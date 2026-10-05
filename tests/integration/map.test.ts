import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSession } from "@/server/auth/session";
import { installMapBundle, MapBundleError, rollbackMap, verifyBundle } from "@/server/map/install";
import { storageRoot } from "@/server/storage";
import { buildBundle } from "../../tools/offline-bundle/build";
import { createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

// Route handlers read the session cookie through next/headers.
let sessionToken: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (sessionToken && name.includes("session") ? { name, value: sessionToken } : undefined) }),
  headers: async () => new Headers(),
}));

const { GET, HEAD } = await import("@/app/api/map-assets/[...path]/route");
const { GET: STATUS } = await import("@/app/api/map-assets/status/route");

const ADMIN = "map-admin@vigie.local";
const VIEWER = "map-viewer@vigie.local";
const dir = mkdtempSync(join(tmpdir(), "vigie-map-"));
let bundle: string;

async function makeBundle(day: string): Promise<string> {
  const sites = join(dir, "sites.json");
  writeFileSync(sites, JSON.stringify({ formatVersion: 1, exportedAt: new Date().toISOString(), sites: [{ code: "A", name: "A", addressLine: "1 rue", postalCode: "69800", city: "Saint-Priest", latitude: null, longitude: null }] }));
  const result = await buildBundle({ sitesFile: sites, outDir: join(dir, day), fixtures: true, skipMap: true, skipOrtho: true, workDir: join(dir, "work"), now: () => new Date(`${day}T08:00:00Z`), log: () => {} });
  return result.root;
}

const request = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  new NextRequest(`http://localhost:3000/api/map-assets/${path}`, { method, headers });
const call = (handler: typeof GET, segments: string[], headers: Record<string, string> = {}) =>
  handler(request(segments.join("/"), headers), { params: Promise.resolve({ path: segments }) });

beforeAll(async () => {
  await resetDatabase();
  await createUserFixture(ADMIN, { role: "admin" });
  await createUserFixture(VIEWER, { role: "viewer" });
  await rm(join(storageRoot(), "map"), { recursive: true, force: true });
  await rm(join(storageRoot(), "map.previous"), { recursive: true, force: true });
  bundle = await makeBundle("2026-09-27");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await disconnectAll();
});

describe("map:install", () => {
  it("refuses a non-admin actor", async () => {
    await expect(installMapBundle(bundle, VIEWER)).rejects.toBeInstanceOf(MapBundleError);
  });

  it("installs a valid bundle into STORAGE_ROOT/map with its manifest, and audits it", async () => {
    const result = await installMapBundle(bundle, ADMIN);
    expect(result.previousKept).toBe(false);
    expect(existsSync(join(storageRoot(), "map", "manifest.json"))).toBe(true);
    expect(existsSync(join(storageRoot(), "map", "sprites", "v4", "dark.json"))).toBe(true);
    expect(await raw.auditLog.count({ where: { entityType: "MapBundle", action: "IMPORT" } })).toBe(1);
  });

  it("keeps the previous version under map.previous/ and can roll back", async () => {
    const second = await makeBundle("2026-09-28");
    const result = await installMapBundle(second, ADMIN);
    expect(result.previousKept).toBe(true);
    const current = JSON.parse(readFileSync(join(storageRoot(), "map", "manifest.json"), "utf8")) as { name: string };
    const previous = JSON.parse(readFileSync(join(storageRoot(), "map.previous", "manifest.json"), "utf8")) as { name: string };
    expect(current.name).toBe("vigie-offline-bundle-20260928");
    expect(previous.name).toBe("vigie-offline-bundle-20260927");
    const restored = await rollbackMap(ADMIN);
    expect(restored?.name).toBe("vigie-offline-bundle-20260927");
    await rollbackMap(ADMIN); // back to the newest
  });

  it("refuses an altered bundle (checksum) and leaves the installed map untouched", async () => {
    const altered = await makeBundle("2026-09-29");
    writeFileSync(join(altered, "map", "sprites", "v4", "dark.json"), '{"altered":true}');
    await expect(verifyBundle(altered)).rejects.toThrow(/Somme de contrôle invalide pour map\/sprites\/v4\/dark.json/);
    await expect(installMapBundle(altered, ADMIN)).rejects.toThrow(/altéré/);
    const current = JSON.parse(readFileSync(join(storageRoot(), "map", "manifest.json"), "utf8")) as { name: string };
    expect(current.name).toBe("vigie-offline-bundle-20260928");
  });

  it("refuses a folder without manifest or with an invalid format version", async () => {
    await expect(verifyBundle(dir)).rejects.toThrow(/n'est pas un paquet hors ligne/);
    const bad = await makeBundle("2026-09-30");
    const manifest = JSON.parse(readFileSync(join(bad, "manifest.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(bad, "manifest.json"), JSON.stringify({ ...manifest, formatVersion: 7 }));
    await expect(verifyBundle(bad)).rejects.toThrow(/Version de paquet non prise en charge/);
  });
});

describe("/api/map-assets", () => {
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

  beforeAll(async () => {
    writeFileSync(join(storageRoot(), "map", "test-range.pmtiles"), bytes);
    const viewer = await raw.user.findUniqueOrThrow({ where: { email: VIEWER } });
    sessionToken = null;
    const session = await createSession(viewer.id);
    sessionToken = session.token;
  });

  it("401 without a session", async () => {
    const saved = sessionToken;
    sessionToken = null;
    expect((await call(GET, ["test-range.pmtiles"])).status).toBe(401);
    expect((await STATUS(new NextRequest("http://localhost:3000/api/map-assets/status"), {})).status).toBe(401);
    sessionToken = saved;
  });

  it("status: installed with the public manifest (no internal path)", async () => {
    const response = await STATUS(new NextRequest("http://localhost:3000/api/map-assets/status"), {});
    const body = (await response.json()) as { installed: boolean; manifest: Record<string, unknown> };
    expect(body.installed).toBe(true);
    expect(body.manifest.name).toBe("vigie-offline-bundle-20260928");
    expect(JSON.stringify(body)).not.toContain(storageRoot());
    expect(body.manifest).not.toHaveProperty("parameters");
  });

  it("200: whole file, headers, content type", async () => {
    const response = await call(GET, ["test-range.pmtiles"]);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(response.headers.get("content-type")).toBe("application/vnd.pmtiles");
    expect(response.headers.get("content-length")).toBe("1000");
  });

  it("206: the right bytes and Content-Range", async () => {
    const response = await call(GET, ["test-range.pmtiles"], { range: "bytes=100-109" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-109/1000");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(100, 110));
    const suffix = await call(GET, ["test-range.pmtiles"], { range: "bytes=-5" });
    expect(Buffer.from(await suffix.arrayBuffer())).toEqual(bytes.subarray(995));
  });

  it("304 with If-None-Match", async () => {
    const etag = (await call(HEAD, ["test-range.pmtiles"])).headers.get("etag")!;
    const response = await call(GET, ["test-range.pmtiles"], { "if-none-match": etag });
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("416 for an unsatisfiable range", async () => {
    const response = await call(GET, ["test-range.pmtiles"], { range: "bytes=5000-" });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */1000");
  });

  it("HEAD: headers without body", async () => {
    const response = await HEAD(request("test-range.pmtiles", {}, "HEAD"), { params: Promise.resolve({ path: ["test-range.pmtiles"] }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("1000");
    expect(await response.text()).toBe("");
  });

  it("400 on traversal, 404 when absent", async () => {
    expect((await call(GET, ["..", "map.previous", "manifest.json"])).status).toBe(400);
    expect((await call(GET, ["sprites", "..", "..", "x"])).status).toBe(400);
    expect((await call(GET, [".hidden"])).status).toBe(400);
    expect((await call(GET, ["fonts", "absent.pbf"])).status).toBe(404);
    expect((await call(GET, ["sprites"])).status).toBe(404); // a directory
  });
});
