import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { METRICS } from "@/domain/metrics";
import { detectHeaders, normalizeHeader } from "@/server/import/headers";
import { FIXED_HEADERS, resolveColumn } from "@/server/import/mapping";

const docRows = readFileSync(new URL("../../docs/source-mapping.md", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => /^\| \d+ \|/.test(line))
  .map((line) => line.split("|").map((c) => c.trim()))
  .map(([, , column, target]) => ({ column: column!, target: target! }));

describe("normalizeHeader", () => {
  it.each([
    ["Lien Géorisques", "LIEN GEORISQUES"],
    ["NOM\nENTREPOT", "NOM ENTREPOT"],
    ["  DATE DE FIN   DE BAIL ", "DATE DE FIN DE BAIL"],
    ["CHARGES / M² 2021", "CHARGES/M² 2021"],
    ["PRIX BUREAUX / M2", "PRIX BUREAUX/M²"],
    ["ASSURANCES/m² 2024", "ASSURANCES/M² 2024"],
    ["STATUT D’OCCUPATION", "STATUT D'OCCUPATION"],
    ["Détail si refacturation gestion technique", "DETAIL SI REFACTURATION GESTION TECHNIQUE"],
    [null, ""],
  ])("%j → %j", (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });
});

describe("detectHeaders", () => {
  const header = ["ENTREPOT", "NOM\nENTREPOT", "LOYER 2024", "COLONNE MYSTÈRE", "LOYER 2024"];

  it("finds a shifted header row (title rows above)", () => {
    const result = detectHeaders([["RÉFÉRENTIEL"], ["Données fictives"], header, ["SMP-1", "Nom", 1]]);
    expect(result.headerRow).toBe(3);
    expect(result.fatal).toBe(false);
    expect(result.columns.map((c) => c.normalized)).toEqual(["ENTREPOT", "NOM ENTREPOT", "LOYER 2024", "COLONNE MYSTERE"]);
  });

  it("keeps the first of duplicated headers, with a warning", () => {
    const result = detectHeaders([header]);
    expect(result.columns.find((c) => c.normalized === "LOYER 2024")?.index).toBe(3);
    expect(result.issues.filter((i) => i.kind === "duplicate_column")).toHaveLength(1);
  });

  it("warns about unknown and missing columns", () => {
    const result = detectHeaders([header], ["ENTREPOT", "NOM ENTREPOT", "VLM"]);
    expect(result.issues.find((i) => i.kind === "unknown_column")?.column).toBe("COLONNE MYSTÈRE");
    expect(result.issues.find((i) => i.kind === "missing_column")?.column).toBe("VLM");
  });

  it("is fatal without the ENTREPOT column", () => {
    const result = detectHeaders([["CODE", "NOM ENTREPOT"], ["x", "y"]]);
    expect(result.fatal).toBe(true);
    expect(result.headerRow).toBeNull();
    expect(result.issues[0]).toMatchObject({ severity: "error", kind: "missing_entrepot_column" });
  });

  it("only searches the first 10 rows", () => {
    const rows = [...Array.from({ length: 10 }, () => ["titre"]), ["ENTREPOT", "NOM ENTREPOT"]];
    expect(detectHeaders(rows).fatal).toBe(true);
  });
});

describe("mapping ↔ docs/source-mapping.md", () => {
  it("recognises every documented column (183), mapped or ignored", () => {
    expect(docRows).toHaveLength(183);
    const unknown = docRows.filter((r) => resolveColumn(normalizeHeader(r.column)) === null).map((r) => r.column);
    expect(unknown).toEqual([]);
  });

  it("ignores exactly the columns documented as computed or replaced by the audit log", () => {
    for (const row of docRows) {
      const spec = resolveColumn(normalizeHeader(row.column))!;
      const documentedIgnored = row.target.includes("**calculé**");
      expect(spec.kind === "derived", row.column).toBe(documentedIgnored);
      if (row.target.includes("journal d'audit")) expect(spec.kind, row.column).toBe("sheetModified");
    }
  });

  it("maps each documented metric column to the documented metric and year", () => {
    for (const row of docRows.filter((r) => r.target.startsWith("`annual_metrics`"))) {
      const spec = resolveColumn(normalizeHeader(row.column))!;
      const code = /`([A-Z_]+)`/.exec(row.target.replace("`annual_metrics`", ""))?.[1];
      if (spec.kind === "metric") {
        expect(spec.metric, row.column).toBe(code);
        expect(row.target, row.column).toContain(String(spec.year));
      } else {
        expect(spec.kind, row.column).toBe("activityMetric");
        expect(spec.kind === "activityMetric" && spec.metric).toBe(code);
      }
    }
  });

  it("agrees with the metric catalogue's source columns", () => {
    for (const metric of METRICS) {
      for (const column of metric.sourceColumns) {
        const spec = resolveColumn(normalizeHeader(column));
        expect(spec && "metric" in spec ? spec.metric : null, column).toBe(metric.code);
      }
    }
  });

  it("expects every fixed column in a complete file", () => {
    expect(FIXED_HEADERS.length).toBeGreaterThan(100);
    expect(FIXED_HEADERS).toContain("ENTREPOT");
  });
});

describe("yearly patterns", () => {
  it.each([
    ["LOYER 2027", { kind: "metric", metric: "RENT", year: 2027 }],
    ["2027 CONSO ELEC EN KWH", { kind: "metric", metric: "ELECTRICITY", year: 2027 }],
    ["2030 CONSO GAZ EN KWH", { kind: "metric", metric: "GAS", year: 2030 }],
    ["TAXE BUREAU 2027", { kind: "metric", metric: "OFFICE_TAX", year: 2027 }],
    ["TAXE BUREAU IDF 2027", { kind: "metric", metric: "OFFICE_TAX", year: 2027, variant: "idf" }],
    ["LOYER PERCU 2027", { kind: "metric", metric: "RENT_COLLECTED", year: 2027 }],
    ["2027 EAU", { kind: "metric", metric: "WATER", year: 2027 }],
  ])("%s → %o", (header, expected) => {
    expect(resolveColumn(normalizeHeader(header))).toEqual(expected);
  });

  it.each(["LOYER 2027 /M²", "CHARGES/M² 2027", "2027 CONSO ELEC PAR M²", "EVOLUTION 2027 LOYER N-1", "EVOLUTION QUELCONQUE", "M² BUREAUX/M²TOTAL", "DATE D'ARBITRAGE XYZ", "NOUVELLE COLONNE PAR M²"])(
    "ignores the derived column %s",
    (header) => {
      expect(resolveColumn(normalizeHeader(header))?.kind).toBe("derived");
    },
  );

  it("does not ignore the contractual per-m² prices", () => {
    expect(resolveColumn(normalizeHeader("LOYER ECONOMIQUE / M²"))).toMatchObject({ kind: "field", field: "economicRentPerSqm" });
    expect(resolveColumn(normalizeHeader("PRIX BUREAUX / M2"))).toMatchObject({ kind: "field", field: "officePricePerSqm" });
  });

  it("links per-m² columns to their metric for the checks", () => {
    expect(resolveColumn(normalizeHeader("TF / M² 2021"))).toEqual({ kind: "derived", check: { type: "perSqm", metric: "PROPERTY_TAX", year: 2021 } });
    expect(resolveColumn(normalizeHeader("CHARGES 2026 /M²"))).toEqual({ kind: "derived", check: { type: "perSqm", metric: "CHARGES", year: 2026 } });
  });
});
