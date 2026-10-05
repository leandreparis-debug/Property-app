import { describe, expect, it } from "vitest";
import { searchActions } from "@/domain/search/actions";
import { highlight, prepareSearch, searchPlaces, searchSites, withinOneEdit } from "@/domain/search";
import { foldText } from "@/lib/text";
import { entry } from "./site-index-fixtures";

const entries = [
  entry({ id: "1", code: "SMP-001", name: "Entrepôt Fictif Lyon-Est", city: "Saint-Priest", region: "Auvergne-Rhône-Alpes" }),
  entry({ id: "2", code: "DEMO-009", name: "Entrepôt Démo Paris-Rungis", city: "Rungis", departmentCode: "94", departmentName: "Val-de-Marne", region: "Île-de-France", externalIds: { qlik: ["QS-0042"], al: ["AL-7"], ramses: [], leaseCode: null } }),
  entry({ id: "3", code: "SMP-012", name: "Plateforme Rungis Sud", city: "Chevilly-Larue", region: "Île-de-France", departmentCode: "94", departmentName: "Val-de-Marne" }),
  entry({ id: "4", code: "SMP-020", name: "Entrepôt Fictif Tours", city: "Tours", region: "Centre-Val de Loire", departmentCode: "37", departmentName: "Indre-et-Loire" }),
];
const prepared = prepareSearch(entries);
const hits = (q: string) => searchSites(prepared, q).map((h) => [h.entry.code, h.rank]);

describe("foldText", () => {
  it("accents, case, hyphens, apostrophes", () => {
    expect(foldText("Île-de-France")).toBe("ile de france");
    expect(foldText("  Saint-Ouen-l’Aumône ")).toBe("saint ouen l aumone");
  });
});

describe("searchSites", () => {
  it("rank 1: exact code or external id (hyphens ignored)", () => {
    expect(hits("SMP-001")[0]).toEqual(["SMP-001", 1]);
    expect(hits("smp001")[0]).toEqual(["SMP-001", 1]);
    expect(hits("qs0042")[0]).toEqual(["DEMO-009", 1]);
  });

  it("rank 2: name, city or code starts with the query — before rank 3", () => {
    expect(hits("rungis")).toEqual([["DEMO-009", 2], ["SMP-012", 3]]);
    expect(hits("smp-0")).toEqual(expect.arrayContaining([["SMP-001", 2], ["SMP-012", 2], ["SMP-020", 2]]));
  });

  it("rank 3: every word contained, accents ignored", () => {
    expect(hits("demo paris")).toEqual([["DEMO-009", 3]]);
    expect(hits("entrepot tours")).toEqual([["SMP-020", 3]]);
  });

  it("rank 4: one edit on words of 5+ letters", () => {
    expect(hits("plateforne")).toEqual([["SMP-012", 4]]);
    expect(hits("tourz")).toEqual([["SMP-020", 4]]);
    expect(hits("tour")).toEqual([["SMP-020", 2]]); // prefix of the city
    expect(hits("toutz")).toEqual([]); // two edits away
  });

  it("withinOneEdit", () => {
    expect(withinOneEdit("rungis", "rungis")).toBe(true);
    expect(withinOneEdit("rungis", "rungiss")).toBe(true);
    expect(withinOneEdit("rungis", "runis")).toBe(true);
    expect(withinOneEdit("rungis", "rangis")).toBe(true);
    expect(withinOneEdit("rungis", "ranges")).toBe(false);
  });

  it("empty query → nothing; limit 8", () => {
    expect(searchSites(prepared, "  ")).toEqual([]);
    const many = prepareSearch(Array.from({ length: 30 }, (_, i) => entry({ id: `x${i}`, code: `X-${i}`, name: `Entrepôt ${i}` })));
    expect(searchSites(many, "entrepot")).toHaveLength(8);
  });

  it("performance: < 20 ms on 200 generated entries", () => {
    const big = Array.from({ length: 200 }, (_, i) =>
      entry({ id: `g${i}`, code: `GEN-${String(i).padStart(3, "0")}`, name: `Entrepôt Généré ${i} Plateforme`, city: `Ville ${i % 37}`, externalIds: { qlik: [`QS-${i}`], al: [], ramses: [], leaseCode: `BAIL-${i}` } }),
    );
    const p = prepareSearch(big);
    const start = performance.now();
    for (const q of ["gen-150", "entrepot", "ville 12", "plateforne", "zzz introuvable"]) searchSites(p, q);
    expect((performance.now() - start) / 5).toBeLessThan(20);
  });
});

describe("places, actions, highlight", () => {
  it("regions and departments", () => {
    expect(searchPlaces(entries, "ile de france")).toEqual([{ kind: "region", value: "Île-de-France", label: "Île-de-France", count: 2 }]);
    expect(searchPlaces(entries, "val de")).toEqual([
      { kind: "department", value: "94", label: "Val-de-Marne (94)", count: 2 },
      { kind: "region", value: "Centre-Val de Loire", label: "Centre-Val de Loire", count: 1 },
    ]);
    expect(searchPlaces(entries, "37")[0]).toMatchObject({ kind: "department", value: "37" });
  });

  it("actions: primary when empty, filtered by words", () => {
    expect(searchActions("").map((a) => a.id)).toEqual(["critical", "warning", "deadline6", "national", "supervision", "list"]);
    expect(searchActions("critiques").map((a) => a.id)).toEqual(["critical"]);
    expect(searchActions("effacer").map((a) => a.id)).toEqual(["clear"]);
  });

  it("highlight keeps the original text", () => {
    expect(highlight("Île-de-France", "ile france")).toEqual([
      { text: "Île", match: true },
      { text: "-de-", match: false },
      { text: "France", match: true },
    ]);
    expect(highlight("Rungis", "")).toEqual([{ text: "Rungis", match: false }]);
  });
});
