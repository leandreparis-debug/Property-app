import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasSuccessfulImport, importReportPath, listImportRuns } from "@/server/import/history";
import { ImportPreconditionError, runImport } from "@/server/import/run";
import { getSetting, IMPORT_LOCKED_MESSAGE, isImportLocked, setSetting } from "@/server/settings";
import { createUserFixture, disconnectAll, raw, resetDatabase } from "./helpers";
import { testDatabaseUrl } from "./test-db";

const SAMPLE = "samples/vigie-sample.xlsx";
const ADMIN = "import-lock@vigie.local";
const run = promisify(execFile);

let admin: { id: string; email: string; name: string; role: "admin" };

beforeEach(async () => {
  await resetDatabase();
  const id = await createUserFixture(ADMIN, { role: "admin" });
  admin = { id, email: ADMIN, name: "Admin", role: "admin" };
});

afterAll(disconnectAll);

describe("import lock", () => {
  it("is off by default; changing it is audited with the reason; an editor cannot change it", async () => {
    expect(await isImportLocked()).toBe(false);
    await setSetting(admin, "import.locked", true, "Import validé le 5 octobre");
    expect(await getSetting("import.locked")).toBe(true);
    const line = await raw.auditLog.findFirstOrThrow({ where: { entityType: "AppSetting" } });
    expect(line).toMatchObject({ action: "CREATE", source: "ui", actorId: admin.id, comment: "Import validé le 5 octobre" });
    await expect(setSetting({ ...admin, role: "editor" } as never, "import.locked", false)).rejects.toThrow(/Accès refusé/);
  });

  it("locked: a real import is refused with the message, the simulation stays allowed", async () => {
    await setSetting(admin, "import.locked", true);
    await expect(runImport({ filePath: SAMPLE, actorEmail: ADMIN, activityYear: 2025 })).rejects.toThrow(new ImportPreconditionError(IMPORT_LOCKED_MESSAGE));
    expect(await raw.importBatch.count()).toBe(0);
    const simulation = await runImport({ filePath: SAMPLE, actorEmail: ADMIN, activityYear: 2025, dryRun: true });
    expect(simulation.summary.mode).toBe("simulation");
    expect(await raw.site.count()).toBe(0);
  });

  it("the CLI refuses a real import with the message and a non-zero exit code", async () => {
    await setSetting(admin, "import.locked", true);
    const env = { ...process.env, DATABASE_URL: testDatabaseUrl() };
    const error = await run("pnpm", ["-s", "import:spreadsheet", "--file", SAMPLE, "--actor", ADMIN], { env }).then(
      () => null,
      (e: { code?: number; stderr?: string }) => e,
    );
    expect(error?.code).toBe(1);
    expect(error?.stderr).toContain(IMPORT_LOCKED_MESSAGE);
  }, 120_000);
});

describe("import history", () => {
  it("lists real imports and simulations with their counters and report files", async () => {
    const real = await runImport({ filePath: SAMPLE, actorEmail: ADMIN, activityYear: 2025 });
    await runImport({ filePath: SAMPLE, actorEmail: ADMIN, activityYear: 2025, dryRun: true });
    expect(await hasSuccessfulImport()).toBe(real.summary.status !== "FAILED");
    const runs = await listImportRuns();
    const realRun = runs.find((r) => r.id === real.batchId)!;
    expect(realRun).toMatchObject({ mode: "import", file: "vigie-sample.xlsx", files: ["report.csv", "changes.csv", "summary.json"] });
    expect(realRun.counters?.rowsRead).toBe(real.summary.rowsRead);
    const simulation = runs.find((r) => r.mode === "simulation")!;
    expect(simulation).toMatchObject({ actor: ADMIN, file: "vigie-sample.xlsx" });
    expect(await importReportPath(real.batchId!, "report.csv")).toMatch(/report\.csv$/);
    expect(await importReportPath(real.batchId!, "../../etc/passwd")).toBeNull();
    expect(await importReportPath("../secret", "report.csv")).toBeNull();
  });
});
