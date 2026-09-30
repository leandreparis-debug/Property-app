import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The audit journal is append-only, EVEN IN TESTS: no code may delete audit
 * lines. Only the SQL migrations may touch the table's definition.
 */
const ROOT = join(__dirname, "..", "..");
const SCANNED = ["src", "tests", "scripts", "tools", "prisma"];
const SKIP_DIRS = new Set(["node_modules", ".next", "generated", "migrations"]);
const THIS_FILE = relative(ROOT, __filename);

/** Deletions of audit lines: SQL (DELETE / TRUNCATE) and the Prisma equivalents. */
const PATTERNS: readonly RegExp[] = [
  /DELETE\s+(?:FROM\s+)?\[?(?:dbo\]?\.\[?)?audit_logs/i,
  /TRUNCATE\s+TABLE\s+\[?(?:dbo\]?\.\[?)?audit_logs/i,
  /DROP\s+TABLE\s+\[?(?:dbo\]?\.\[?)?audit_logs/i,
  /auditLog\s*\.\s*delete(?:Many)?\s*\(/,
];

/** A line that ASSERTS the refusal of a deletion (append-only guard tests) is allowed. */
const EXPECTED_REFUSAL = /expect\([^)]*auditLog\s*\.\s*delete(?:Many)?\s*\([^)]*\)\s*\)\s*\.rejects/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(entry) ? [] : files(path);
    return /\.(ts|tsx|mts|js|mjs|sql|sh)$/.test(entry) ? [path] : [];
  });
}

describe("audit journal: never deleted", () => {
  it("no DELETE / TRUNCATE on audit_logs nor auditLog.delete(Many) outside the migrations", () => {
    const offenders: string[] = [];
    for (const dir of SCANNED) {
      for (const path of files(join(ROOT, dir))) {
        const rel = relative(ROOT, path);
        if (rel === THIS_FILE) continue;
        readFileSync(path, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (PATTERNS.some((p) => p.test(line)) && !EXPECTED_REFUSAL.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the patterns do catch the forbidden forms", () => {
    for (const bad of ["await raw.auditLog.deleteMany();", "prisma.auditLog.delete({ where })", "DELETE FROM audit_logs WHERE 1=1", "delete from [dbo].[audit_logs]", "TRUNCATE TABLE audit_logs"]) {
      expect(PATTERNS.some((p) => p.test(bad)), bad).toBe(true);
    }
    expect(EXPECTED_REFUSAL.test("await expect(db.auditLog.deleteMany()).rejects.toThrow(/ajout seul/);")).toBe(true);
  });
});
