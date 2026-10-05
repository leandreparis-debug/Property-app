import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { exportFolderName } from "@/domain/export/retention";
import { runNightlyExport, nightlyExportJob } from "@/server/exports/nightly";
import { listExports } from "@/server/exports/store";
import { runJob } from "@/server/ops/run";
import type { JobDefinition } from "@/server/ops/types";
import { resolveStoragePath } from "@/server/storage";
import { createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";

const exportsDir = () => resolveStoragePath("exports");

async function seedSites(): Promise<void> {
  const active = await raw.site.create({ data: { code: "EXP-001", name: "=HYPERLINK(\"x\")", city: "Lyon", isActive: true } });
  await raw.lease.create({ data: { siteId: active.id, code: "B-EXP-1", marketRentValue: 123456.78, endDate: new Date("2028-06-30T00:00:00Z") } });
  await raw.siteTechnical.create({ data: { siteId: active.id, totalWarehouseArea: 12000 } });
  await raw.annualMetric.create({ data: { siteId: active.id, year: 2025, metric: "RENT", value: 600000 } });
  await raw.site.create({ data: { code: "EXP-002", name: "Ancien entrepôt", archivedAt: new Date("2026-01-10T09:00:00Z") } });
}

beforeEach(async () => {
  await resetDatabase();
  await rm(exportsDir(), { recursive: true, force: true });
  await seedSites();
});

afterAll(async () => {
  await disconnectAll();
});

describe("nightly export", () => {
  it("writes a complete folder whose manifest matches the files (rows, size, SHA-256)", async () => {
    await createUserFixture("export-viewer@vigie.local", { role: "viewer" });
    const outcome = await runJob("nightly-export", "cli", { jobs: [nightlyExportJob] });
    expect(outcome.status).toBe("success");
    const folder = (outcome.status === "success" ? outcome.summary?.folder : null) as string;
    expect(folder).toMatch(/^\d{4}-\d{2}-\d{2}T\d{4}_[A-Za-z0-9]{8}$/);

    const dir = join(exportsDir(), folder);
    const names = (await readdir(dir)).sort();
    expect(names).toEqual(["annual_metrics.csv", "audit_logs.csv", "documents.csv", "equipment.csv", "manifest.json", "sites.csv", "users.csv", "vigie-export.xlsx"]);
    expect((await readdir(exportsDir())).filter((n) => n.startsWith(".tmp-"))).toEqual([]);

    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ application: "Vigie", sites: 2, runId: outcome.runId });
    expect(manifest.lastMigration).toMatch(/^\d{14}_/);
    expect(manifest.files).toHaveLength(7);
    for (const file of manifest.files as { name: string; rows: number; bytes: number; sha256: string }[]) {
      const content = await readFile(join(dir, file.name));
      expect(content.length).toBe(file.bytes);
      expect(createHash("sha256").update(content).digest("hex")).toBe(file.sha256);
      if (file.name.endsWith(".csv") && file.name !== "audit_logs.csv") {
        // Data lines (CRLF-terminated) minus the header; no multi-line cell in these fixtures.
        expect(content.toString("utf8").split("\r\n").length - 2).toBe(file.rows);
      }
    }

    // Complete: archived sites, financial data; formulas neutralised; no secret.
    const sites = await readFile(join(dir, "sites.csv"), "utf8");
    expect(sites.startsWith("﻿Site.code;")).toBe(true);
    expect(sites).toContain("EXP-002");
    expect(sites).toContain("123456.78");
    expect(sites).toContain(`"'=HYPERLINK(""x"")"`);
    const users = await readFile(join(dir, "users.csv"), "utf8");
    expect(users).toContain("export-viewer@vigie.local");
    expect(users).not.toMatch(/argon2|password/i);
  });

  it("a failing export leaves neither its temporary folder nor a final folder, and the run is failed", async () => {
    const failing: JobDefinition = {
      ...nightlyExportJob,
      run: (ctx) =>
        runNightlyExport(ctx, {
          beforeManifest: () => {
            throw new Error("Disque plein (simulation)");
          },
        }),
    };
    const outcome = await runJob("nightly-export", "cli", { jobs: [failing] });
    expect(outcome).toMatchObject({ status: "failed", error: "Disque plein (simulation)" });
    expect(await readdir(exportsDir())).toEqual([]);
  });

  it("applies the retention at the end: old exports beyond the policy and orphan temporary folders are deleted", async () => {
    const make = async (iso: string, complete = true) => {
      const name = exportFolderName(new Date(iso), `old${Date.parse(iso).toString(36)}`);
      await mkdir(join(exportsDir(), name), { recursive: true });
      if (complete) await writeFile(join(exportsDir(), name, "manifest.json"), "{}");
      return name;
    };
    await mkdir(exportsDir(), { recursive: true });
    const keptMonthly = await make("2026-07-01T01:30:00Z");
    const deletedSameMonth = await make("2026-07-02T01:30:00Z");
    const deletedTooOld = await make("2024-01-01T02:30:00Z");
    await mkdir(join(exportsDir(), ".tmp-orphan"));

    const outcome = await runJob("nightly-export", "cli", { jobs: [nightlyExportJob], now: new Date("2026-10-05T01:30:00Z") });
    expect(outcome.status).toBe("success");
    const left = await readdir(exportsDir());
    expect(left).toContain(keptMonthly);
    expect(left).not.toContain(deletedSameMonth);
    expect(left).not.toContain(deletedTooOld);
    expect(left).not.toContain(".tmp-orphan");
    const summary = outcome.status === "success" ? outcome.summary : null;
    expect((summary?.deletedExports as string[]).sort()).toEqual([deletedSameMonth, deletedTooOld].sort());
    expect((await listExports())[0]?.name).toBe(summary?.folder);
  });
});
