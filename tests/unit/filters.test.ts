import { describe, expect, it } from "vitest";
import {
  activeCriteriaCount,
  applyFilters,
  buildFilterOptions,
  EMPTY_FILTERS,
  filterQuery,
  parseFilters,
  serializeFilters,
  valueLabel,
  withFilters,
  type SiteFilters,
} from "@/domain/filters";
import { entry } from "./site-index-fixtures";

const f = (over: Partial<SiteFilters>): SiteFilters => ({ ...EMPTY_FILTERS, ...over });

describe("parseFilters / serializeFilters", () => {
  it("round trip", () => {
    const filters = f({
      status: ["warning", "critical"],
      region: ["Île-de-France", "Grand Est"],
      department: ["2A", "69"],
      portfolio: ["P, avec virgule"],
      bu: ["BU 100 %"],
      typology: ["Frais"],
      operator: ["Op"],
      rule: ["LEASE_NOTICE_IMMINENT"],
      deadline: ["lt6m", "overdue"],
      active: "inactive",
      completenessBelow: 60,
      q: "saint-priest & co ?",
    });
    const text = serializeFilters(filters).toString();
    const back = parseFilters(text);
    expect(serializeFilters(back).toString()).toBe(text);
    expect(back.portfolio).toEqual(["P, avec virgule"]);
    expect(back.bu).toEqual(["BU 100 %"]);
    expect(back.q).toBe("saint-priest & co ?");
    expect(new Set(back.status)).toEqual(new Set(filters.status));
  });

  it("short parameters, stable order, sorted values, defaults omitted", () => {
    expect(serializeFilters(EMPTY_FILTERS).toString()).toBe("");
    expect(serializeFilters(f({ region: ["Occitanie", "Bretagne"], status: ["warning", "critical"], department: ["69"] })).toString()).toBe(
      "status=critical%2Cwarning&region=Bretagne%2COccitanie&dep=69",
    );
    expect(serializeFilters(f({ active: "all", completenessBelow: null, q: "  " })).toString()).toBe("");
  });

  it("unknown or invalid values are ignored silently", () => {
    const parsed = parseFilters("?status=critical,purple&deadline=soon,lt3m&active=maybe&compl=150&dep=999x,2b&rule=bad-id,LOW_COMPLETENESS&region=");
    expect(parsed.status).toEqual(["critical"]);
    expect(parsed.deadline).toEqual(["lt3m"]);
    expect(parsed.active).toBe("all");
    expect(parsed.completenessBelow).toBeNull();
    expect(parsed.department).toEqual(["2B"]);
    expect(parsed.rule).toEqual(["LOW_COMPLETENESS"]);
    expect(parsed.region).toEqual([]);
    expect(() => parseFilters("?region=%E0%A4%A&q=%")).not.toThrow();
  });

  it("withFilters keeps the other parameters; filterQuery keeps only the filters", () => {
    expect(withFilters("?site=A-1&status=ok&sort=-name", f({ region: ["Corse"] }))).toBe("region=Corse&site=A-1&sort=-name");
    expect(withFilters("?site=A-1&present=1", f({}), ["site", "present"])).toBe("");
    expect(filterQuery("?site=A-1&present=1&status=critical")).toBe("status=critical");
  });

  it("activeCriteriaCount", () => {
    expect(activeCriteriaCount(EMPTY_FILTERS)).toBe(0);
    expect(activeCriteriaCount(f({ status: ["ok", "warning"], active: "active", q: "x", completenessBelow: 50 }))).toBe(4);
  });
});

describe("applyFilters", () => {
  const entries = [
    entry({ id: "1", code: "A-1", name: "Entrepôt Île", region: "Île-de-France", departmentCode: "94", departmentName: "Val-de-Marne", status: "critical", reasons: [{ ruleId: "LEASE_END_PASSED", severity: "critical", labelFr: "x", detailFr: null }], leaseDeadlineBucket: "overdue", completeness: 40 }),
    entry({ id: "2", code: "B-2", name: "Entrepôt Lyon", city: "Vénissieux", status: "warning", portfolio: "P2", occupyingBu: "BU Sud", externalIds: { qlik: ["QS-777"], al: [], ramses: [], leaseCode: "BAIL-42" } }),
    entry({ id: "3", code: "C-3", name: "Entrepôt Nantes", region: "Pays de la Loire", isActive: false, status: "unknown", typology: "Frais", logisticsOperator: "Autre" }),
  ];
  const codes = (filters: Partial<SiteFilters>) => applyFilters(entries, f(filters)).map((e) => e.code);

  it("each criterion", () => {
    expect(codes({ status: ["critical"] })).toEqual(["A-1"]);
    expect(codes({ region: ["Pays de la Loire"] })).toEqual(["C-3"]);
    expect(codes({ department: ["94"] })).toEqual(["A-1"]);
    expect(codes({ portfolio: ["P2"] })).toEqual(["B-2"]);
    expect(codes({ bu: ["BU Sud"] })).toEqual(["B-2"]);
    expect(codes({ typology: ["Frais"] })).toEqual(["C-3"]);
    expect(codes({ operator: ["Autre"] })).toEqual(["C-3"]);
    expect(codes({ rule: ["LEASE_END_PASSED"] })).toEqual(["A-1"]);
    expect(codes({ deadline: ["overdue"] })).toEqual(["A-1"]);
    expect(codes({ active: "inactive" })).toEqual(["C-3"]);
    expect(codes({ active: "active" })).toEqual(["A-1", "B-2"]);
    expect(codes({ completenessBelow: 50 })).toEqual(["A-1"]);
    expect(codes({})).toEqual(["A-1", "B-2", "C-3"]);
  });

  it("OR within a criterion, AND between criteria", () => {
    expect(codes({ status: ["critical", "warning"] })).toEqual(["A-1", "B-2"]);
    expect(codes({ status: ["critical", "warning"], region: ["Auvergne-Rhône-Alpes"] })).toEqual(["B-2"]);
    expect(codes({ status: ["unknown"], active: "active" })).toEqual([]);
  });

  it("q: accents, case, hyphens, department and external ids", () => {
    expect(codes({ q: "ile de france" })).toEqual([]); // region is not in q (filter by region instead)
    expect(codes({ q: "entrepot ile" })).toEqual(["A-1"]);
    expect(codes({ q: "VENISSIEUX" })).toEqual(["B-2"]);
    expect(codes({ q: "val de marne" })).toEqual(["A-1"]);
    expect(codes({ q: "qs-777" })).toEqual(["B-2"]);
    expect(codes({ q: "bail-42" })).toEqual(["B-2"]);
    expect(codes({ q: "b-2" })).toEqual(["B-2"]);
  });
});

describe("buildFilterOptions", () => {
  const entries = [entry({ region: "Occitanie" }), entry({ region: "Bretagne" }), entry({ region: "Occitanie", status: "critical" }), entry({ region: null })];
  it("counts and French sort; statuses by severity", () => {
    const options = buildFilterOptions(entries);
    expect(options.region).toEqual([
      { value: "Bretagne", label: "Bretagne", count: 1 },
      { value: "Occitanie", label: "Occitanie", count: 2 },
    ]);
    expect(options.status.map((o) => [o.value, o.count])).toEqual([["critical", 1], ["warning", 0], ["unknown", 0], ["ok", 3]]);
    expect(options.department[0]).toEqual({ value: "69", label: "69 — Rhône", count: 4 });
    expect(options.deadline.find((o) => o.value === "gt12m")?.count).toBe(4);
    expect(valueLabel("deadline", "overdue")).toBe("Arbitrage dépassé");
    expect(valueLabel("status", "warning")).toBe("À surveiller");
    expect(valueLabel("rule", "SITE_INACTIVE")).toBe("Site inactif");
  });
});
