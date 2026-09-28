import { describe, expect, it } from "vitest";
import {
  COMPLETENESS_FIELDS,
  COMPLIANCE_RULES,
  COMPLIANCE_THRESHOLDS,
  completenessScore,
  evaluateSite,
  missingFields,
  type ComplianceLease,
  type ComplianceSite,
} from "@/domain/compliance";
import { addDays, addMonths, toDateOnly } from "@/domain/dates";

const TODAY = toDateOnly("2026-09-28")!;
const d = (iso: string) => toDateOnly(iso)!;

const lease = (over: Partial<ComplianceLease> = {}): ComplianceLease => ({
  code: "B-1",
  holdingEntity: "SCI Démo",
  endDate: d("2035-12-31"),
  nextExitDate: d("2032-12-31"),
  noticeDate: d("2032-06-30"),
  noticePeriodMonths: 6,
  renewalConditionsSigned: false,
  ...over,
});

/** A complete, compliant site. */
const site = (over: Partial<ComplianceSite> = {}): ComplianceSite => ({
  code: "T-1",
  name: "Entrepôt Test",
  isActive: true,
  addressLine: "1 rue de l'Exemple",
  postalCode: "69800",
  city: "Saint-Priest",
  departmentCode: "69",
  region: "Auvergne-Rhône-Alpes",
  portfolio: "Portefeuille A",
  typology: "Entrepôt",
  operatingMode: null,
  logisticsOperator: null,
  hasCoordinates: true,
  lease: lease(),
  technical: { totalWarehouseArea: 20000, landArea: 50000, socialOfficeArea: 800, dockCount: 30 },
  icpe: { holder: "Exploitant Démo", headingsCount: 2 },
  ...over,
});

const rule = (id: string) => COMPLIANCE_RULES.find((r) => r.id === id)!;
const fires = (id: string, s: ComplianceSite, today = TODAY) => rule(id).evaluate(s, today).triggered;

describe("LEASE_ARBITRATION_OVERDUE (critical)", () => {
  // arbitration = noticeDate − 6 months
  it("fires when the arbitration date is past and conditions are not signed", () => {
    const r = rule("LEASE_ARBITRATION_OVERDUE").evaluate(site({ lease: lease({ noticeDate: d("2026-09-12") }) }), TODAY);
    expect(r).toEqual({ triggered: true, detailFr: "Arbitrage dépassé depuis le 12 mars 2026" });
  });
  it("boundaries: day of arbitration → not yet overdue; the day after → overdue", () => {
    const noticeForArbitrationToday = addMonths(TODAY, 6);
    expect(fires("LEASE_ARBITRATION_OVERDUE", site({ lease: lease({ noticeDate: noticeForArbitrationToday }) }))).toBe(false);
    expect(fires("LEASE_ARBITRATION_OVERDUE", site({ lease: lease({ noticeDate: noticeForArbitrationToday }) }), addDays(TODAY, 1))).toBe(true);
  });
  it("signed conditions or missing dates → no trigger", () => {
    expect(fires("LEASE_ARBITRATION_OVERDUE", site({ lease: lease({ noticeDate: d("2026-01-01"), renewalConditionsSigned: true }) }))).toBe(false);
    expect(fires("LEASE_ARBITRATION_OVERDUE", site({ lease: lease({ noticeDate: null, nextExitDate: null }) }))).toBe(false);
    expect(fires("LEASE_ARBITRATION_OVERDUE", site({ lease: null }))).toBe(false);
  });
  it("falls back to nextExitDate − notice period − 6 months", () => {
    expect(fires("LEASE_ARBITRATION_OVERDUE", site({ lease: lease({ noticeDate: null, nextExitDate: d("2027-06-30"), noticePeriodMonths: 6 }) }))).toBe(true);
  });
});

describe("LEASE_NOTICE_IMMINENT (critical)", () => {
  it("fires within 3 months, detail with the date and days left", () => {
    const r = rule("LEASE_NOTICE_IMMINENT").evaluate(site({ lease: lease({ noticeDate: d("2026-10-28") }) }), TODAY);
    expect(r).toEqual({ triggered: true, detailFr: "Date de préavis le 28 octobre 2026 (dans 30 jours)" });
  });
  it("boundaries: today → fires; yesterday → no; 3 months minus one day → fires; exactly 3 months → no", () => {
    const at = (notice: Date) => fires("LEASE_NOTICE_IMMINENT", site({ lease: lease({ noticeDate: notice }) }));
    expect(at(TODAY)).toBe(true);
    expect(rule("LEASE_NOTICE_IMMINENT").evaluate(site({ lease: lease({ noticeDate: TODAY }) }), TODAY).detailFr).toContain("aujourd'hui");
    expect(at(addDays(TODAY, -1))).toBe(false);
    expect(at(addDays(addMonths(TODAY, 3), -1))).toBe(true);
    expect(at(addMonths(TODAY, 3))).toBe(false);
  });
  it("signed conditions or no notice date → no trigger", () => {
    expect(fires("LEASE_NOTICE_IMMINENT", site({ lease: lease({ noticeDate: addDays(TODAY, 10), renewalConditionsSigned: true }) }))).toBe(false);
    expect(fires("LEASE_NOTICE_IMMINENT", site({ lease: lease({ noticeDate: null }) }))).toBe(false);
  });
});

describe("LEASE_END_PASSED (critical)", () => {
  it("fires when end AND next exit are past, not signed", () => {
    const r = rule("LEASE_END_PASSED").evaluate(site({ lease: lease({ endDate: d("2026-01-31"), nextExitDate: d("2026-09-27") }) }), TODAY);
    expect(r).toEqual({ triggered: true, detailFr: "Fin de bail le 31 janvier 2026 et prochaine sortie le 27 septembre 2026 dépassées" });
  });
  it("boundaries: exit today → no; one of the dates missing or future → no; signed → no", () => {
    expect(fires("LEASE_END_PASSED", site({ lease: lease({ endDate: d("2026-01-31"), nextExitDate: TODAY }) }))).toBe(false);
    expect(fires("LEASE_END_PASSED", site({ lease: lease({ endDate: d("2026-01-31"), nextExitDate: null }) }))).toBe(false);
    expect(fires("LEASE_END_PASSED", site({ lease: lease({ endDate: d("2026-01-31"), nextExitDate: d("2027-01-01") }) }))).toBe(false);
    expect(fires("LEASE_END_PASSED", site({ lease: lease({ endDate: d("2026-01-31"), nextExitDate: d("2026-02-01"), renewalConditionsSigned: true }) }))).toBe(false);
  });
});

describe("LEASE_ARBITRATION_SOON (warning)", () => {
  it("fires when the arbitration is within 6 months (today included)", () => {
    // arbitration = notice − 6 months = 2027-01-15
    const r = rule("LEASE_ARBITRATION_SOON").evaluate(site({ lease: lease({ noticeDate: d("2027-07-15") }) }), TODAY);
    expect(r).toEqual({ triggered: true, detailFr: "Arbitrage le 15 janvier 2027 (dans 109 jours)" });
    expect(fires("LEASE_ARBITRATION_SOON", site({ lease: lease({ noticeDate: addMonths(TODAY, 6) }) }))).toBe(true);
  });
  it("boundaries: exactly 6 months ahead → no; past → no (OVERDUE takes over)", () => {
    expect(fires("LEASE_ARBITRATION_SOON", site({ lease: lease({ noticeDate: addMonths(TODAY, 12) }) }))).toBe(false);
    expect(fires("LEASE_ARBITRATION_SOON", site({ lease: lease({ noticeDate: addMonths(addDays(TODAY, -1), 6) }) }))).toBe(false);
  });
});

describe("CRITICAL_DATA_MISSING (warning)", () => {
  it("lists each missing essential", () => {
    const r = rule("CRITICAL_DATA_MISSING").evaluate(site({ addressLine: " ", city: null, technical: { totalWarehouseArea: 0 }, icpe: null }), TODAY);
    expect(r).toEqual({ triggered: true, detailFr: "Manquant : adresse, ville, surface de référence, détenteur ICPE" });
  });
  it("complete site → no trigger; surveyed area is enough", () => {
    expect(fires("CRITICAL_DATA_MISSING", site())).toBe(false);
    expect(fires("CRITICAL_DATA_MISSING", site({ technical: { surveyedTotalArea: 1000 } }))).toBe(false);
  });
});

describe("completeness and LOW_COMPLETENESS (warning)", () => {
  it("a complete site scores 100; an empty one near 0", () => {
    expect(completenessScore(site())).toBe(100);
    const empty = site({ name: "T-1", addressLine: null, postalCode: null, city: null, departmentCode: null, region: null, portfolio: null, typology: null, hasCoordinates: false, lease: null, technical: null, icpe: null });
    expect(completenessScore(empty)).toBe(0);
    expect(missingFields(empty)[0]).toBe("Surface de référence");
  });
  it("weights: ~20 fields; missing lease (9/30) → 70 %", () => {
    expect(COMPLETENESS_FIELDS.length).toBeGreaterThanOrEqual(18);
    expect(COMPLETENESS_FIELDS.length).toBeLessThanOrEqual(22);
    expect(completenessScore(site({ lease: null }))).toBe(70);
  });
  it("fires below 60 %, not at 60 % or more", () => {
    expect(COMPLIANCE_THRESHOLDS.minCompleteness).toBe(60);
    const low = site({ lease: null, icpe: null, portfolio: null }); // 30 − 9 − 4 − 1 = 16/30 = 53 %
    expect(completenessScore(low)).toBe(53);
    expect(rule("LOW_COMPLETENESS").evaluate(low, TODAY)).toEqual({ triggered: true, detailFr: "Complétude 53 % (minimum 60 %)" });
    expect(fires("LOW_COMPLETENESS", site({ lease: null }))).toBe(false);
  });
});

describe("evaluateSite", () => {
  it("no rule triggered → ok, no reason", () => {
    expect(evaluateSite(site(), TODAY)).toEqual({ status: "ok", reasons: [], completeness: 100 });
  });

  it("inactive site → unknown with « Site inactif » only, other rules not evaluated", () => {
    const r = evaluateSite(site({ isActive: false, addressLine: null, lease: lease({ noticeDate: d("2026-01-01") }) }), TODAY);
    expect(r.status).toBe("unknown");
    expect(r.reasons).toEqual([{ ruleId: "SITE_INACTIVE", severity: "unknown", labelFr: "Site inactif", detailFr: null }]);
  });

  it("isActive null is evaluated normally", () => {
    expect(evaluateSite(site({ isActive: null }), TODAY).status).toBe("ok");
  });

  it("several rules: the most severe wins, reasons sorted critical first", () => {
    const r = evaluateSite(site({ addressLine: null, lease: lease({ noticeDate: d("2026-10-10") }) }), TODAY);
    expect(r.status).toBe("critical");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["LEASE_ARBITRATION_OVERDUE", "LEASE_NOTICE_IMMINENT", "CRITICAL_DATA_MISSING"]);
  });

  it("warnings only → warning", () => {
    expect(evaluateSite(site({ city: null }), TODAY).status).toBe("warning");
  });

  it("insufficient lease data never triggers a lease rule", () => {
    const r = evaluateSite(site({ lease: lease({ endDate: null, nextExitDate: null, noticeDate: null, noticePeriodMonths: null }) }), TODAY);
    expect(r.reasons.filter((x) => x.ruleId.startsWith("LEASE_"))).toEqual([]);
  });
});
