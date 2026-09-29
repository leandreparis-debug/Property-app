import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runWithAuditContext } from "@/server/audit/context";
import { createSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { storageRoot } from "@/server/storage";
import { createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

let sessionToken: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (sessionToken && name.includes("session") ? { name, value: sessionToken } : undefined) }),
  headers: async () => new Headers(),
}));

const { POST } = await import("@/app/api/sites/[id]/documents/route");
const { GET, DELETE } = await import("@/app/api/documents/[id]/route");

const ORIGIN = "http://localhost:3000";
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
let siteId = "";
let editorToken = "";
let viewerToken = "";

function upload(files: { name: string; bytes: Uint8Array }, fields: Record<string, string> = { category: "LEASE" }, headers: Record<string, string> = { origin: ORIGIN }) {
  const form = new FormData();
  form.set("file", new File([files.bytes as BlobPart], files.name));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return POST(new NextRequest(`${ORIGIN}/api/sites/${siteId}/documents`, { method: "POST", body: form, headers }), { params: Promise.resolve({ id: siteId }) });
}
const download = (id: string) => GET(new NextRequest(`${ORIGIN}/api/documents/${id}`), { params: Promise.resolve({ id }) });
const remove = (id: string, comment?: string) =>
  DELETE(new NextRequest(`${ORIGIN}/api/documents/${id}`, { method: "DELETE", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ comment }) }), { params: Promise.resolve({ id }) });

beforeAll(async () => {
  await resetDatabase();
  await rm(join(storageRoot(), "documents"), { recursive: true, force: true });
  await rm(join(storageRoot(), "trash"), { recursive: true, force: true });
  const editor = await createUserFixture("doc-editor@vigie.local", { role: "editor" });
  const viewer = await createUserFixture("doc-viewer@vigie.local", { role: "viewer" });
  editorToken = (await createSession(editor)).token;
  viewerToken = (await createSession(viewer)).token;
  siteId = (await runWithAuditContext({ actorId: null, source: "import" }, () => db.site.create({ data: { code: "DOC-1", name: "Site documents" } }))).id;
});

afterAll(async () => {
  await rm(join(storageRoot(), "documents"), { recursive: true, force: true });
  await rm(join(storageRoot(), "trash"), { recursive: true, force: true });
  await disconnectAll();
});

describe("POST /api/sites/[id]/documents", () => {
  it("stores the file under STORAGE_ROOT with its sha256, audited; download returns the same bytes", async () => {
    sessionToken = editorToken;
    const response = await upload({ name: "../Bail signé <2026>.pdf", bytes: PDF }, { category: "LEASE", comment: "Bail renouvelé" });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; title: string; storagePath: string; sha256: string; mimeType: string };
    expect(body).toMatchObject({ title: "Bail signé 2026 .pdf", mimeType: "application/pdf", sha256: createHash("sha256").update(PDF).digest("hex") });
    expect(body.storagePath).toBe(`documents/${siteId}/${body.id}.pdf`);
    expect(readFileSync(join(storageRoot(), body.storagePath))).toEqual(Buffer.from(PDF));
    expect(await raw.auditLog.findFirst({ where: { entityType: "Document", entityId: body.id }, select: { action: true, source: true, comment: true } })).toEqual({ action: "CREATE", source: "ui", comment: "Bail renouvelé" });

    const got = await download(body.id);
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PDF);
  });

  it("accepts an XLSX checked by its ZIP parts", async () => {
    sessionToken = editorToken;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("A").addRow(["x"]);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    expect((await upload({ name: "Surfaces.xlsx", bytes }, { category: "OTHER" })).status).toBe(201);
    // The same workbook renamed .docx is refused.
    expect((await upload({ name: "Surfaces.docx", bytes }, { category: "OTHER" })).status).toBe(415);
  });

  it("refuses a forbidden type, an inconsistent signature, a missing category, a too large file", async () => {
    sessionToken = editorToken;
    const forbidden = await upload({ name: "outil.exe", bytes: new Uint8Array([0x4d, 0x5a, 0, 0]) });
    expect([forbidden.status, ((await forbidden.json()) as { error: string }).error]).toEqual([415, "Type de fichier non autorisé."]);
    const renamed = await upload({ name: "photo.pdf", bytes: PNG });
    expect(renamed.status).toBe(415);
    expect(((await renamed.json()) as { error: string }).error).toMatch(/^Le contenu du fichier ne correspond pas à son extension/);
    expect((await upload({ name: "a.pdf", bytes: PDF }, { category: "NOPE" })).status).toBe(400);

    // Content-Length above the limit: refused before reading the body.
    const declared = await POST(
      new NextRequest(`${ORIGIN}/api/sites/${siteId}/documents`, { method: "POST", body: "x", headers: { origin: ORIGIN, "content-length": String(60 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" } }),
      { params: Promise.resolve({ id: siteId }) },
    );
    expect([declared.status, ((await declared.json()) as { error: string }).error]).toEqual([413, "Fichier trop volumineux (50 Mo maximum)."]);
    // Streamed body above the limit (no usable Content-Length).
    const big = new Uint8Array(51 * 1024 * 1024);
    big.set(PDF);
    expect((await upload({ name: "gros.pdf", bytes: big })).status).toBe(413);
    expect(readdirSync(join(storageRoot(), "documents", siteId))).toHaveLength(2); // only the two accepted files
  });

  it("refuses a foreign Origin, a reader, and no session", async () => {
    sessionToken = editorToken;
    expect((await upload({ name: "a.pdf", bytes: PDF }, { category: "LEASE" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await upload({ name: "a.pdf", bytes: PDF }, { category: "LEASE" }, {})).status).toBe(403);
    sessionToken = viewerToken;
    expect((await upload({ name: "a.pdf", bytes: PDF })).status).toBe(403);
    sessionToken = null;
    expect((await upload({ name: "a.pdf", bytes: PDF })).status).toBe(401);
  });
});

describe("DELETE /api/documents/[id]", () => {
  it("deletes the row (audited with the reason) and moves the file to the trash", async () => {
    sessionToken = editorToken;
    const created = (await (await upload({ name: "à supprimer.pdf", bytes: PDF })).json()) as { id: string; storagePath: string };
    sessionToken = viewerToken;
    expect((await remove(created.id)).status).toBe(403);
    sessionToken = editorToken;
    expect((await remove(created.id, "Doublon")).status).toBe(204);
    expect(await raw.document.count({ where: { id: created.id } })).toBe(0);
    expect(existsSync(join(storageRoot(), created.storagePath))).toBe(false);
    const trash = readdirSync(join(storageRoot(), "trash", "documents"));
    expect(trash.some((f) => f.endsWith(`${created.id}.pdf`))).toBe(true);
    expect(await raw.auditLog.findFirst({ where: { entityType: "Document", entityId: created.id, action: "DELETE" }, select: { comment: true, source: true } })).toEqual({ comment: "Doublon", source: "ui" });
    expect((await remove(created.id)).status).toBe(404);
  });
});
