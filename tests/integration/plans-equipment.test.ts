import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fromMercator, mercatorScale, toMercator } from "@/domain/geometry";
import { offsetLngLat, pixelToLngLat, type PlanControlPoint } from "@/domain/plan/calibration";
import { distanceM } from "@/domain/equipment/catalog";
import { runWithAuditContext } from "@/server/audit/context";
import { createSession, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { archiveEquipment, createEquipment, moveEquipment, updateEquipment } from "@/server/equipment/edit";
import { getSitePlanData } from "@/server/plans/data";
import { savePlanCalibration, setDockSide } from "@/server/plans/edit";
import { storageRoot } from "@/server/storage";
import { createUserFixture, disconnectAll, markAudit, raw, resetDatabase } from "./helpers";

let sessionToken: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (sessionToken && name.includes("session") ? { name, value: sessionToken } : undefined) }),
  headers: async () => new Headers(),
}));

const { POST } = await import("@/app/api/sites/[id]/documents/route");
const { GET } = await import("@/app/api/documents/[id]/route");

const ORIGIN = "http://localhost:3000";
const PNG = new Uint8Array(readFileSync(join(__dirname, "../fixtures/images/tiny.png")));
const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
const SITE: [number, number] = [3.12, 50.59];
const asImport = <T>(fn: () => Promise<T>) => runWithAuditContext({ actorId: null, source: "import", batchId: "imp" }, fn);

/** A PNG header (signature + IHDR) of the given size. */
function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

let editor: SessionUser;
let viewer: SessionUser;
let editorToken = "";
let siteId = "";

async function user(email: string, role: "viewer" | "editor"): Promise<SessionUser> {
  const id = await createUserFixture(email, { role });
  return { id, email, name: "Utilisateur Test", role };
}

function upload(name: string, bytes: Uint8Array, category = "PLAN") {
  const form = new FormData();
  form.set("file", new File([bytes as BlobPart], name));
  form.set("category", category);
  return POST(new NextRequest(`${ORIGIN}/api/sites/${siteId}/documents`, { method: "POST", body: form, headers: { origin: ORIGIN } }), { params: Promise.resolve({ id: siteId }) });
}
const inline = (id: string) => GET(new NextRequest(`${ORIGIN}/api/documents/${id}?inline=1`), { params: Promise.resolve({ id }) });

/** Control points of a plan at `mPerPx` metres per pixel, north up, top-left pixel at the site, optionally shifted east. */
function points(mPerPx: number, eastShiftM = 0): PlanControlPoint[] {
  const [ox, oy] = toMercator(offsetLngLat(SITE, eastShiftM, 0));
  const k = mercatorScale(SITE[1]);
  return ([[0, 0], [400, 0], [400, 300], [0, 300]] as [number, number][]).map((pixel) => ({ pixel, lngLat: fromMercator([ox + pixel[0] * mPerPx * k, oy - pixel[1] * mPerPx * k]) }));
}

async function uploadPlan(): Promise<{ documentId: string; planId: string }> {
  sessionToken = editorToken;
  const response = await upload("plan.png", PNG);
  expect(response.status).toBe(201);
  const body = (await response.json()) as { id: string; planId: string };
  return { documentId: body.id, planId: body.planId };
}

beforeAll(async () => {
  await resetDatabase();
  editor = await user("plan-editor@vigie.local", "editor");
  viewer = await user("plan-viewer@vigie.local", "viewer");
  editorToken = (await createSession(editor.id)).token;
});

beforeEach(async () => {
  await raw.equipment.deleteMany();
  await raw.sitePlan.deleteMany();
  await raw.site.deleteMany();
  await rm(join(storageRoot(), "documents"), { recursive: true, force: true });
  const site = await asImport(() => db.site.create({ data: { code: "PLAN-1", name: "Entrepôt plan", latitude: SITE[1], longitude: SITE[0] } }));
  await asImport(() => db.siteTechnical.create({ data: { siteId: site.id, totalWarehouseArea: 20000, cellCount: 4, dockCount: 30 } }));
  siteId = site.id;
  await markAudit();
});

afterAll(async () => {
  await rm(join(storageRoot(), "documents"), { recursive: true, force: true });
  await disconnectAll();
});

describe("plan upload", () => {
  it("creates the PLAN document and the current SitePlan (image size from the header); the previous plan leaves « current »", async () => {
    const first = await uploadPlan();
    const plan = await raw.sitePlan.findUniqueOrThrow({ where: { id: first.planId } });
    expect(plan).toMatchObject({ siteId, documentId: first.documentId, imageWidth: 5, imageHeight: 3, isCurrent: true });
    expect((await raw.document.findUniqueOrThrow({ where: { id: first.documentId } })).category).toBe("PLAN");
    // Document and plan share one audit batch.
    const lines = await raw.auditLog.findMany({ where: { entityType: { in: ["Document", "SitePlan"] }, action: "CREATE" }, select: { batchId: true, source: true } });
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map((l) => l.batchId)).size).toBe(1);

    const second = await uploadPlan();
    expect((await raw.sitePlan.findUniqueOrThrow({ where: { id: first.planId } })).isCurrent).toBe(false);
    expect((await raw.sitePlan.findUniqueOrThrow({ where: { id: second.planId } })).isCurrent).toBe(true);
    const data = (await getSitePlanData(siteId))!;
    expect(data.plan?.id).toBe(second.planId);
    expect(data.history.map((p) => p.id)).toEqual([second.planId, first.planId]);
    expect(data.plan?.imageUrl).toBe(`/api/documents/${second.documentId}?inline=1`);
  });

  it("refuses an image larger than 8192 px, a PDF plan, and a viewer", async () => {
    sessionToken = editorToken;
    const big = await upload("grand.png", pngHeader(9000, 4000));
    expect(big.status).toBe(400);
    expect(((await big.json()) as { error: string }).error).toBe("Exportez le plan en 8192 px maximum (limite d'affichage).");
    const pdf = await upload("plan.pdf", PDF);
    expect(pdf.status).toBe(415);
    expect(((await pdf.json()) as { error: string }).error).toMatch(/exportez le plan AutoCAD en image/);
    expect(await raw.sitePlan.count()).toBe(0);
    sessionToken = (await createSession(viewer.id)).token;
    expect((await upload("plan.png", PNG)).status).toBe(403);
  });
});

describe("inline document route", () => {
  it("serves a plan image inline with nosniff; refuses any other document", async () => {
    const { documentId } = await uploadPlan();
    const response = await inline(documentId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const lease = await upload("photo.png", PNG, "PHOTO");
    const photoId = ((await lease.json()) as { id: string }).id;
    expect((await inline(photoId)).status).toBe(403);
    // The normal download still works.
    const attached = await GET(new NextRequest(`${ORIGIN}/api/documents/${photoId}`), { params: Promise.resolve({ id: photoId }) });
    expect(attached.headers.get("content-disposition")).toMatch(/^attachment/);
  });
});

describe("calibration", () => {
  it("saves points, transform, RMS error, rotation, author — audited", async () => {
    const { planId } = await uploadPlan();
    await markAudit();
    const result = await savePlanCalibration(editor, { planId, points: points(0.5), opacity: 0.6, comment: "Calage initial" });
    expect(result).toMatchObject({ ok: true, moved: 0 });
    const plan = await raw.sitePlan.findUniqueOrThrow({ where: { id: planId } });
    expect(Number(plan.rmsErrorM)).toBeLessThan(0.01);
    expect(Number(plan.rotationDeg)).toBeCloseTo(0, 1);
    expect(Number(plan.opacity)).toBe(0.6);
    expect(plan.calibratedById).toBe(editor.id);
    expect(plan.calibratedAt).not.toBeNull();
    expect(JSON.parse(plan.controlPointsJson!)).toHaveLength(4);
    const lines = await raw.auditLog.findMany({ where: { entityType: "SitePlan", entityId: planId } });
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines.every((l) => l.source === "ui" && l.comment === "Calage initial")).toBe(true);
  });

  it("aligned points and a viewer are refused; > 3 m needs a confirmation", async () => {
    const { planId } = await uploadPlan();
    const aligned = points(0.5).map((p, i) => ({ ...p, pixel: [i * 10, i * 10] as [number, number] }));
    expect(await savePlanCalibration(editor, { planId, points: aligned })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await savePlanCalibration(viewer, { planId, points: points(0.5) })).toMatchObject({ ok: false, reason: "forbidden" });
    const noisy = points(0.5);
    noisy[2] = { ...noisy[2]!, lngLat: offsetLngLat(noisy[2]!.lngLat, 30, 0) };
    expect(await savePlanCalibration(editor, { planId, points: noisy })).toMatchObject({ ok: false, reason: "warnings" });
    expect(await savePlanCalibration(editor, { planId, points: noisy, confirmLowQuality: true })).toMatchObject({ ok: true });
  });

  it("recalibration: the equipments placed on the plan are recalculated under the same batch", async () => {
    const { planId } = await uploadPlan();
    await savePlanCalibration(editor, { planId, points: points(0.5) });
    const first = (await getSitePlanData(siteId))!.plan!;
    const at = pixelToLngLat(first.matrix!, [100, 100]);
    const created = await createEquipment(editor, { siteId, type: "FIRE_HOSE_REEL", lngLat: at, planId });
    expect(created).toMatchObject({ ok: true, label: "RIA 1" });
    const eq = await raw.equipment.findFirstOrThrow({ where: { siteId } });
    expect(Number(eq.planX)).toBeCloseTo(100, 1);
    expect(Number(eq.planY)).toBeCloseTo(100, 1);

    await markAudit();
    // The same plan, 12 m further east.
    const result = await savePlanCalibration(editor, { planId, points: points(0.5, 12), comment: "Recalage" });
    expect(result).toMatchObject({ ok: true, moved: 1 });
    expect((result as { meanShiftM: number }).meanShiftM).toBeCloseTo(12, 0);
    const moved = await raw.equipment.findFirstOrThrow({ where: { id: eq.id } });
    expect(distanceM(at, [Number(moved.longitude), Number(moved.latitude)])).toBeCloseTo(12, 0);
    const batches = await raw.auditLog.findMany({ where: { entityType: { in: ["SitePlan", "Equipment"] } }, select: { entityType: true, batchId: true } });
    expect(batches.some((b) => b.entityType === "Equipment")).toBe(true);
    expect(new Set(batches.map((b) => b.batchId)).size).toBe(1);
  });
});

describe("equipments", () => {
  it("create, move, update, archive: audited, with automatic labels", async () => {
    const r1 = await createEquipment(editor, { siteId, type: "FIRE_HOSE_REEL", lngLat: offsetLngLat(SITE, 20, 10), reference: "R-01", level: "RDC", installedAt: "2019-05-02" });
    const r2 = await createEquipment(editor, { siteId, type: "FIRE_HOSE_REEL", lngLat: offsetLngLat(SITE, 40, 10) });
    expect(r1).toMatchObject({ ok: true, label: "RIA 1" });
    expect(r2).toMatchObject({ ok: true, label: "RIA 2" });
    const id = (r1 as { id: string }).id;
    const created = await raw.equipment.findUniqueOrThrow({ where: { id } });
    expect(created).toMatchObject({ type: "FIRE_HOSE_REEL", reference: "R-01", level: "RDC", planId: null });
    expect(created.installedAt?.toISOString().slice(0, 10)).toBe("2019-05-02");

    const target = offsetLngLat(SITE, 25, 10);
    expect(await moveEquipment(editor, { equipmentId: id, lngLat: target, comment: "Déplacé" })).toEqual({ ok: true });
    const moved = await raw.equipment.findUniqueOrThrow({ where: { id } });
    expect(distanceM(target, [Number(moved.longitude), Number(moved.latitude)])).toBeLessThan(0.2);

    expect(await updateEquipment(editor, { equipmentId: id, label: "RIA quai nord", reference: null, level: "RDC", notes: "Contrôlé" })).toEqual({ ok: true });
    expect(await raw.equipment.findUniqueOrThrow({ where: { id } })).toMatchObject({ label: "RIA quai nord", reference: null, notes: "Contrôlé" });

    expect(await archiveEquipment(editor, { equipmentId: id, comment: "Déposé" })).toEqual({ ok: true });
    expect((await getSitePlanData(siteId))!.equipments.map((e) => e.label)).toEqual(["RIA 2"]);

    const actions = await raw.auditLog.findMany({ where: { entityType: "Equipment", entityId: id }, select: { action: true, field: true, source: true, batchId: true } });
    expect(actions.every((a) => a.source === "ui")).toBe(true);
    expect(actions.map((a) => a.field)).toEqual(expect.arrayContaining(["longitude", "label", "archivedAt"]));
    // One batch per action: create, move, update, archive.
    expect(new Set(actions.map((a) => a.batchId)).size).toBe(4);
  });

  it("refuses a viewer, a position beyond 1 km, an unknown type, and an archived site", async () => {
    expect(await createEquipment(viewer, { siteId, type: "TANK", lngLat: SITE })).toMatchObject({ ok: false, reason: "forbidden" });
    expect(await createEquipment(editor, { siteId, type: "TANK", lngLat: offsetLngLat(SITE, 0, 1200) })).toMatchObject({ ok: false, reason: "refused" });
    expect(await createEquipment(editor, { siteId, type: "SPRINKLER", lngLat: SITE })).toMatchObject({ ok: false, reason: "invalid" });
    const ok = (await createEquipment(editor, { siteId, type: "TANK", lngLat: SITE })) as { id: string };
    expect(await moveEquipment(editor, { equipmentId: ok.id, lngLat: offsetLngLat(SITE, 1500, 0) })).toMatchObject({ ok: false, reason: "refused" });
    expect(await moveEquipment(viewer, { equipmentId: ok.id, lngLat: SITE })).toMatchObject({ ok: false, reason: "forbidden" });

    await asImport(() => db.site.update({ where: { id: siteId }, data: { archivedAt: new Date() } }));
    expect(await createEquipment(editor, { siteId, type: "TANK", lngLat: SITE })).toMatchObject({ ok: false, reason: "archived" });
    expect(await archiveEquipment(editor, { equipmentId: ok.id })).toMatchObject({ ok: false, reason: "archived" });
    expect(await setDockSide(editor, { siteId, dockSide: "b" })).toMatchObject({ ok: false, reason: "archived" });
  });
});

describe("setDockSide", () => {
  it("creates the geometry row when missing, audited; the volume moves its docks", async () => {
    const before = (await getSitePlanData(siteId))!;
    expect(before.site.dockSide).toBe("a");
    expect(before.volume?.approximate).toBe(true);
    expect(before.volume?.meta).toMatchObject({ cells: 4, docks: 30 });

    expect(await setDockSide(editor, { siteId, dockSide: "b", comment: "Quais au sud" })).toEqual({ ok: true });
    const geometry = await raw.siteGeometry.findUniqueOrThrow({ where: { siteId } });
    expect(geometry).toMatchObject({ dockSide: "b", volumeApproximate: true, footprintGeoJson: null });
    expect(await raw.auditLog.findFirst({ where: { entityType: "SiteGeometry", action: "CREATE" }, select: { comment: true, source: true } })).toEqual({ comment: "Quais au sud", source: "ui" });

    const after = (await getSitePlanData(siteId))!;
    expect(after.site.dockSide).toBe("b");
    const dockLat = (v: typeof after.volume) => (v!.parts.features.find((f) => f.properties.part === "dock")!.geometry.coordinates[0] as number[][])[0]![1]!;
    // East-west rectangle: side a is south, side b is north.
    expect(dockLat(before.volume)).toBeLessThan(SITE[1]);
    expect(dockLat(after.volume)).toBeGreaterThan(SITE[1]);

    expect(await setDockSide(viewer, { siteId, dockSide: "a" })).toMatchObject({ ok: false, reason: "forbidden" });
    expect(await setDockSide(editor, { siteId, dockSide: "c" as "a" })).toMatchObject({ ok: false, reason: "invalid" });
  });
});
