import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adoptDivergence, dismissDivergences, listDivergences, listEnrichmentRuns } from "@/server/enrichment/divergences";
import { runEnrichment } from "@/server/enrichment/run";
import type { SessionUser } from "@/server/auth/session";
import { asUser, createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";
import { db } from "@/server/db";

const ADMIN = "divergence-admin@vigie.local";
const dir = mkdtempSync(join(tmpdir(), "vigie-divergences-"));
let admin: SessionUser;

/** An enrichment.json proposing values for site DIV-001. */
function enrichmentFile(proposals: { target: string; value: unknown }[], name = "enrichment.json"): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    JSON.stringify({
      formatVersion: 1,
      generatedAt: "2026-10-01T10:00:00.000Z",
      generator: "Vigie-offline-bundle/test",
      sites: [
        {
          code: "DIV-001",
          providers: {
            geocoding: { status: "ok", fetchedAt: "2026-10-01T10:00:00.000Z", data: {}, proposals: proposals.map((p) => ({ ...p, confidence: 0.95, evidence: "Base Adresse Nationale" })), publicData: {} },
          },
        },
      ],
    }),
  );
  return path;
}

let siteId: string;

beforeEach(async () => {
  await resetDatabase();
  const id = await createUserFixture(ADMIN, { role: "admin" });
  admin = { id, email: ADMIN, name: "Admin", role: "admin" };
  const site = await raw.site.create({ data: { code: "DIV-001", name: "Site à vérifier", postalCode: "69003", communeInseeCode: "69383" } });
  siteId = site.id;
  await raw.siteGeometry.create({ data: { siteId, heightM: 10 } });
});

afterAll(disconnectAll);

const apply = (path: string) => runEnrichment({ filePath: path, actorEmail: ADMIN });

describe("recording", () => {
  it("one open divergence per site, field and proposed value; audited; re-applying the same file creates nothing", async () => {
    const path = enrichmentFile([{ target: "Site.postalCode", value: "69007" }, { target: "SiteGeometry.heightM", value: 12 }]);
    const first = await apply(path);
    expect(first.summary.divergences).toEqual({ created: 2, known: 0 });
    const open = await listDivergences({ status: "open" });
    expect(open.map((d) => [d.target, d.currentValue, d.proposedValue]).sort()).toEqual([
      ["Site.postalCode", "69003", "69007"],
      ["SiteGeometry.heightM", "10", "12"],
    ]);
    expect(open.find((d) => d.target === "Site.postalCode")).toMatchObject({ adoptable: true, provider: "geocoding", targetLabel: "Code postal" });
    expect(await raw.auditLog.count({ where: { entityType: "EnrichmentDivergence", action: "CREATE", source: "enrichment", batchId: first.batchId } })).toBe(2);

    const second = await apply(path);
    expect(second.summary.divergences).toEqual({ created: 0, known: 2 });
    expect(await raw.enrichmentDivergence.count()).toBe(2);
    expect((await listEnrichmentRuns())[0]).toMatchObject({ divergences: 2, file: "enrichment.json" });
  });

  it("a dismissed divergence does not come back for the same proposed value, but a new proposed value does", async () => {
    await apply(enrichmentFile([{ target: "Site.postalCode", value: "69007" }]));
    const [d] = await listDivergences({ status: "open" });
    expect(await dismissDivergences(admin, [d!.id], "Adresse vérifiée sur place")).toEqual({ ok: true, count: 1 });
    expect(await raw.enrichmentDivergence.findUniqueOrThrow({ where: { id: d!.id } })).toMatchObject({ status: "dismissed", resolvedById: admin.id, resolutionComment: "Adresse vérifiée sur place" });
    expect(await raw.auditLog.count({ where: { entityType: "EnrichmentDivergence", entityId: d!.id, field: "status" } })).toBe(1);

    expect((await apply(enrichmentFile([{ target: "Site.postalCode", value: "69007" }]))).summary.divergences).toEqual({ created: 0, known: 1 });
    expect((await apply(enrichmentFile([{ target: "Site.postalCode", value: "69008" }], "autre.json"))).summary.divergences).toEqual({ created: 1, known: 0 });
    expect(await dismissDivergences(admin, [d!.id])).toMatchObject({ ok: false });
  });
});

describe("adoption", () => {
  it("writes through the site sheet path: value changed, audit source enrichment with the enrichment batch, divergence accepted", async () => {
    const result = await apply(enrichmentFile([{ target: "Site.postalCode", value: "69007" }]));
    const [d] = await listDivergences({ status: "open" });
    expect(await adoptDivergence(admin, d!.id, "Confirmé par La Poste")).toEqual({ ok: true, count: 1 });
    expect((await raw.site.findUniqueOrThrow({ where: { id: siteId } })).postalCode).toBe("69007");
    const line = await raw.auditLog.findFirstOrThrow({ where: { entityType: "Site", entityId: siteId, field: "postalCode" } });
    expect(line).toMatchObject({ source: "enrichment", batchId: result.batchId, actorId: admin.id, comment: "Confirmé par La Poste", beforeValue: '"69003"', afterValue: '"69007"' });
    expect(await raw.enrichmentDivergence.findUniqueOrThrow({ where: { id: d!.id } })).toMatchObject({ status: "accepted", resolvedById: admin.id });
    expect(await adoptDivergence(admin, d!.id)).toMatchObject({ ok: false, message: expect.stringMatching(/déjà été traitée/) });
  });

  it("refused when the current value changed since the detection", async () => {
    await apply(enrichmentFile([{ target: "Site.postalCode", value: "69007" }]));
    const [d] = await listDivergences({ status: "open" });
    await asUser(admin.id, () => db.site.update({ where: { id: siteId }, data: { postalCode: "69002" } }));
    expect(await adoptDivergence(admin, d!.id)).toMatchObject({ ok: false, message: expect.stringMatching(/a changé depuis la détection/) });
    expect((await raw.site.findUniqueOrThrow({ where: { id: siteId } })).postalCode).toBe("69002");
  });

  it("refused on an archived site and on a field not editable in the registry", async () => {
    await apply(enrichmentFile([{ target: "Site.postalCode", value: "69007" }, { target: "SiteGeometry.heightM", value: 12 }]));
    const height = (await listDivergences({ target: "SiteGeometry.heightM" }))[0]!;
    expect(height.adoptable).toBe(false);
    expect(await adoptDivergence(admin, height.id)).toMatchObject({ ok: false, message: expect.stringMatching(/n'est pas modifiable/) });

    await raw.site.update({ where: { id: siteId }, data: { archivedAt: new Date() } });
    const postal = (await listDivergences({ target: "Site.postalCode" }))[0]!;
    expect(await adoptDivergence(admin, postal.id)).toMatchObject({ ok: false, message: expect.stringMatching(/archivé/) });
  });

  it("an editor (no enrichment:apply) cannot review", async () => {
    await apply(enrichmentFile([{ target: "Site.postalCode", value: "69007" }]));
    const [d] = await listDivergences();
    await expect(adoptDivergence({ ...admin, role: "editor" }, d!.id)).rejects.toThrow(/Accès refusé/);
  });
});
