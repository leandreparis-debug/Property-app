import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";
import { detectReference, safeExternalUrl } from "@/domain/fields";
import { geodesicArea } from "@/domain/geo/area";
import { leaseMilestones, timelineRange } from "@/domain/site-sheet/lease-timeline";
import { listContextQuery, parseTab, siteNeighbours, siteSheetHref } from "@/domain/site-sheet/navigation";
import { occupancyCostSeries, partialMention } from "@/domain/site-sheet/occupancy-cost";
import { resolveProvenanceLabel } from "@/domain/site-sheet/provenance";
import { flattenPairs, formatPublicData, groupPublicData } from "@/domain/site-sheet/public-data";
import { surfaceBreakdown } from "@/domain/site-sheet/surfaces";
import { decennialEstimate, sortWorks } from "@/domain/site-sheet/works";
import { attachmentDisposition } from "@/server/http/content-disposition";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = d("2026-09-29");
const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("occupancy cost", () => {
  const rows = (entries: [string, number, number | null][]) => entries.map(([metric, year, value]) => ({ metric, year, value }));

  it("complete year: rent + charges + property tax + office and parking taxes + insurance, per m²", () => {
    const [y] = occupancyCostSeries(
      rows([["RENT", 2024, 1000], ["CHARGES", 2024, 200], ["PROPERTY_TAX", 2024, 100], ["OFFICE_TAX", 2024, 50], ["PARKING_TAX", 2024, 25], ["INSURANCE", 2024, 25], ["TAXES_TOTAL", 2024, 9999]]),
      100,
    );
    expect(y).toMatchObject({ year: 2024, total: 1400, perSqm: 14, partial: false, missing: [] });
    expect(partialMention(y!)).toBeNull();
  });

  it("partial year: missing components listed (« partiel : charges non renseignées »)", () => {
    const [y] = occupancyCostSeries(rows([["RENT", 2024, 1000], ["PROPERTY_TAX", 2024, 100], ["OFFICE_TAX", 2024, 0], ["PARKING_TAX", 2024, 0], ["INSURANCE", 2024, 10]]), null);
    expect(y).toMatchObject({ total: 1110, perSqm: null, partial: true, missing: ["charges"] });
    expect(partialMention(y!)).toBe("partiel : charges non renseignées");
    const [z] = occupancyCostSeries(rows([["RENT", 2025, 1000], ["CHARGES", 2025, 1], ["OFFICE_TAX", 2025, 0], ["PARKING_TAX", 2025, 0], ["INSURANCE", 2025, 1]]), 10);
    expect(partialMention(z!)).toBe("partiel : taxe foncière non renseignée");
  });

  it("no rent: no occupancy cost for that year (even with other components)", () => {
    expect(occupancyCostSeries(rows([["CHARGES", 2024, 200], ["RENT", 2023, null], ["RENT", 2022, 500]]), 100).map((y) => y.year)).toEqual([2022]);
  });
});

describe("ten-year warranty estimate", () => {
  const work = (date: string, datePrecision: string | null, kind = "CONSTRUCTION") => ({ kind, date: d(date), datePrecision });

  it("day precision: works date + 10 years, while not over", () => {
    expect(decennialEstimate(work("2020-05-12", "day"), TODAY)).toEqual({ endDate: d("2030-05-12"), precision: "day" });
    expect(decennialEstimate(work("2016-09-29", "day"), TODAY)?.endDate).toEqual(d("2026-09-29")); // ends today
    expect(decennialEstimate(work("2016-09-28", "day"), TODAY)).toBeNull();
  });

  it("month precision: kept until the end of that month", () => {
    expect(decennialEstimate(work("2016-09-01", "month"), TODAY)).toEqual({ endDate: d("2026-09-01"), precision: "month" });
    expect(decennialEstimate(work("2016-08-01", "month"), TODAY)).toBeNull();
  });

  it("year precision: kept until the end of that year", () => {
    expect(decennialEstimate(work("2016-01-01", "year"), TODAY)).toEqual({ endDate: d("2026-01-01"), precision: "year" });
    expect(decennialEstimate(work("2015-01-01", "year"), TODAY)).toBeNull();
  });

  it("only constructions and extensions; more than ten years old or undated → none", () => {
    expect(decennialEstimate(work("2022-01-01", "day", "EXTENSION"), TODAY)).not.toBeNull();
    expect(decennialEstimate(work("2022-01-01", "day", "REHABILITATION"), TODAY)).toBeNull();
    expect(decennialEstimate({ kind: "CONSTRUCTION", date: null, datePrecision: null }, TODAY)).toBeNull();
    expect(decennialEstimate(work("1998-01-20", "day"), TODAY)).toBeNull();
  });

  it("works are sorted chronologically, undated last", () => {
    const sorted = sortWorks([{ kind: "EXTENSION", date: null }, { kind: "EXTENSION", date: d("2010-01-01") }, { kind: "CONSTRUCTION", date: d("1998-01-01") }]);
    expect(sorted.map((w) => w.date?.getUTCFullYear() ?? null)).toEqual([1998, 2010, null]);
  });
});

describe("geodesic footprint area", () => {
  /** Square of `side` metres centred on (lon, lat), built with a local metric approximation. */
  function square(lon: number, lat: number, side: number): Polygon {
    const dLat = side / 2 / 111_132.954;
    const dLon = side / 2 / (111_319.49 * Math.cos((lat * Math.PI) / 180));
    return { type: "Polygon", coordinates: [[[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]]] };
  }

  it("a 200 m square near Lille is 40 000 m² within 1 %", () => {
    expect(geodesicArea(square(3.12, 50.59, 200))).toBeGreaterThan(40_000 * 0.99);
    expect(geodesicArea(square(3.12, 50.59, 200))).toBeLessThan(40_000 * 1.01);
  });

  it("a 1° × 1° cell matches the exact sphere formula within 1 %", () => {
    const cell: Polygon = { type: "Polygon", coordinates: [[[2, 45], [3, 45], [3, 46], [2, 46], [2, 45]]] };
    const R = 6_371_007.181;
    const exact = R * R * (Math.PI / 180) * (Math.sin((46 * Math.PI) / 180) - Math.sin((45 * Math.PI) / 180));
    expect(Math.abs(geodesicArea(cell) - exact) / exact).toBeLessThan(0.01);
  });

  it("holes are subtracted, winding order does not matter, multipolygons add up", () => {
    const outer = square(5, 45, 100).coordinates[0]!;
    const hole = square(5, 45, 50).coordinates[0]!;
    const withHole = geodesicArea({ type: "Polygon", coordinates: [outer, hole] });
    expect(withHole / 7_500).toBeCloseTo(1, 2);
    expect(geodesicArea({ type: "Polygon", coordinates: [[...outer].reverse()] }) / 10_000).toBeCloseTo(1, 2);
    expect(geodesicArea({ type: "MultiPolygon", coordinates: [[outer], [square(6, 45, 100).coordinates[0]!]] }) / 20_000).toBeCloseTo(1, 2);
  });
});

describe("lease timeline", () => {
  const lease = {
    initialEffectiveDate: d("2014-01-01"),
    lastAmendmentDate: null,
    noticeDate: d("2026-07-28"),
    noticePeriodMonths: 6,
    nextExitDate: d("2027-01-28"),
    endDate: d("2027-01-28"),
  };

  it("milestones in date order, missing ones omitted, arbitration computed, past dimmed", () => {
    const m = leaseMilestones(lease, TODAY);
    expect(m.map((x) => x.id)).toEqual(["initialEffective", "arbitration", "notice", "nextExit", "end"]);
    expect(m.find((x) => x.id === "arbitration")?.date).toEqual(d("2026-01-28"));
    expect(m.filter((x) => x.past).map((x) => x.id)).toEqual(["initialEffective", "arbitration", "notice"]);
  });

  it("the arbitration is flagged only when a lease rule is triggered", () => {
    expect(leaseMilestones(lease, TODAY, [{ ruleId: "LOW_COMPLETENESS" }]).some((x) => x.flagged)).toBe(false);
    const flagged = leaseMilestones(lease, TODAY, [{ ruleId: "LEASE_ARBITRATION_OVERDUE" }]).filter((x) => x.flagged);
    expect(flagged.map((x) => x.id)).toEqual(["arbitration"]);
  });

  it("no lease or no date → no milestone and no range", () => {
    expect(leaseMilestones(null, TODAY)).toEqual([]);
    const empty = leaseMilestones({ initialEffectiveDate: null, lastAmendmentDate: null, noticeDate: null, noticePeriodMonths: null, nextExitDate: null, endDate: null }, TODAY);
    expect(empty).toEqual([]);
    expect(timelineRange(empty, TODAY)).toBeNull();
  });

  it("the range includes today and every milestone", () => {
    const m = leaseMilestones({ ...lease, initialEffectiveDate: null, noticeDate: null, noticePeriodMonths: null }, TODAY);
    const [start, end] = timelineRange(m, TODAY)!;
    expect(start).toBeLessThan(TODAY.getTime());
    expect(end).toBeGreaterThan(d("2027-01-28").getTime());
  });
});

describe("external links and references", () => {
  it("only http/https URLs are links", () => {
    expect(safeExternalUrl("https://www.georisques.gouv.fr/a?b=1")).toBe("https://www.georisques.gouv.fr/a?b=1");
    expect(safeExternalUrl("http://intranet.local/x")).toBe("http://intranet.local/x");
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "file:///C:/bail.pdf", "file://srv/share", "data:text/html,<script>", "vbscript:x", "ftp://x", "//evil.example", "www.site.fr", "https://", "https://exa mple.fr", " java\nscript:alert(1)", null, undefined, ""]) {
      expect(safeExternalUrl(bad as string), String(bad)).toBeNull();
    }
  });

  it("references are detected as link, network path, local path, yes/no or text", () => {
    expect(detectReference("https://sharepoint.example/bail.pdf")?.kind).toBe("url");
    expect(detectReference("\\\\srv-fichiers\\baux\\DEMO-002.pdf")?.kind).toBe("networkPath");
    expect(detectReference("C:\\Baux\\DEMO.pdf")?.kind).toBe("localPath");
    expect(detectReference("/mnt/baux/demo.pdf")?.kind).toBe("localPath");
    expect(detectReference("OUI")).toMatchObject({ kind: "boolean", value: true, text: "Oui" });
    expect(detectReference("non")).toMatchObject({ kind: "boolean", value: false, text: "Non" });
    expect(detectReference("javascript:alert(1)")?.kind).toBe("other");
    expect(detectReference("file:///C:/x.pdf")?.kind).toBe("other");
    expect(detectReference("Bail/DEMO-002/bail-signe.pdf")?.kind).toBe("other");
    expect(detectReference("   ")).toBeNull();
  });
});

describe("provenance labels", () => {
  const at = new Date("2026-09-28T10:00:00Z");
  it.each([
    [{ source: "import", occurredAt: at, actorName: "Admin", batchId: "b" }, "Import du tableur — 28 sept. 2026"],
    [{ source: "ui", occurredAt: new Date("2026-10-03T08:00:00Z"), actorName: "Marie Dupont", batchId: null }, "Saisie par Marie Dupont — 3 oct. 2026"],
    [{ source: "ui", occurredAt: at, actorName: null, batchId: null }, "Saisie manuelle — 28 sept. 2026"],
    [{ source: "enrichment", occurredAt: at, actorName: null, batchId: "e" }, "Enrichissement (source publique) — 28 sept. 2026"],
    [{ source: "system", occurredAt: at, actorName: null, batchId: null }, "Système — 28 sept. 2026"],
  ])("%j", (p, label) => {
    expect(resolveProvenanceLabel(p)).toBe(label);
  });
  it("unknown provenance", () => expect(resolveProvenanceLabel(null)).toBe("Origine inconnue"));
});

describe("public data formatters", () => {
  it("known keys", () => {
    expect(formatPublicData("seismicZone", JSON.stringify({ code: "3", label: "Modérée" }))).toMatchObject({ kind: "text", text: "Zone 3 — Modérée" });
    expect(formatPublicData("radonClass", '"1"')).toMatchObject({ kind: "text", text: "Classe 1" });
    expect(formatPublicData("communeRisks", '["Inondation","Séisme"]')).toMatchObject({ kind: "list", items: ["Inondation", "Séisme"] });
    const parcels = formatPublicData("parcels", JSON.stringify([{ idu: "59343000AB0012", section: "AB", numero: "0012", areaM2: 36000 }]));
    expect(parcels?.kind === "table" && nbsp(parcels.rows[0]!.join("|"))).toBe("59343000AB0012|AB|0012|36 000 m²");
    const zones = formatPublicData("urbanZones", JSON.stringify([{ label: "UX", longLabel: null, zoneType: "U", approvedOn: "20190617" }]));
    expect(zones?.kind === "table" && zones.rows[0]).toEqual(["UX", "—", "U", "17 juin 2019"]);
    const nearby = formatPublicData("icpeNearby", JSON.stringify([{ name: "X", distanceM: 613.7, regime: "Autorisation", seveso: null }]));
    expect(nearby?.kind === "table" && nbsp(nearby.rows[0]!.join("|"))).toBe("X|614 m|Autorisation|—");
  });

  it("an unknown key is shown as key / value pairs, never raw JSON", () => {
    const item = formatPublicData("floodZone", JSON.stringify({ level: "fort", sources: ["PPRI", "TRI"], detail: { updated: 2024, ok: true }, empty: [] }));
    expect(item).toMatchObject({ kind: "pairs", labelFr: "floodZone" });
    expect(item?.kind === "pairs" && item.pairs).toEqual([
      ["level", "fort"],
      ["sources", "PPRI, TRI"],
      ["detail › updated", "2024"],
      ["detail › ok", "Oui"],
      ["empty", "—"],
    ]);
    const text = JSON.stringify(item);
    expect(text).not.toContain('{\\"');
    expect(flattenPairs([{ a: 1 }, { a: 2 }])).toEqual([["1 › a", "1"], ["2 › a", "2"]]);
    expect(formatPublicData("x", "not json")).toMatchObject({ kind: "text", text: "not json" });
  });

  it("groups by provider (known providers first) with the latest fetch date", () => {
    const groups = groupPublicData([
      { provider: "zeta", key: "k", valueJson: "1", fetchedAt: null },
      { provider: "cadastre", key: "parcelsTotalAreaM2", valueJson: "68000", fetchedAt: d("2026-09-01") },
      { provider: "georisques", key: "radonClass", valueJson: '"2"', fetchedAt: d("2026-09-02") },
      { provider: "georisques", key: "seismicZone", valueJson: '{"code":"2","label":null}', fetchedAt: d("2026-09-10") },
    ]);
    expect(groups.map((g) => g.provider)).toEqual(["georisques", "cadastre", "zeta"]);
    expect(groups[0]).toMatchObject({ providerLabelFr: "Géorisques", fetchedAt: d("2026-09-10") });
    expect(groups[0]!.items).toHaveLength(2);
  });
});

describe("tabs and previous / next", () => {
  it("?tab= : known tabs kept, anything else → overview", () => {
    expect(parseTab("finance")).toBe("finance");
    expect(parseTab("documents")).toBe("documents");
    for (const bad of ["", "FINANCE", "admin", null, undefined, ["x"]]) expect(parseTab(bad as string)).toBe("overview");
    expect(parseTab(["energy", "x"])).toBe("energy");
  });

  it("neighbours: first, middle, last, absent", () => {
    const ids = ["a", "b", "c"];
    expect(siteNeighbours(ids, "a")).toEqual({ previous: null, next: "b", position: 1, total: 3 });
    expect(siteNeighbours(ids, "b")).toEqual({ previous: "a", next: "c", position: 2, total: 3 });
    expect(siteNeighbours(ids, "c")).toEqual({ previous: "b", next: null, position: 3, total: 3 });
    expect(siteNeighbours(ids, "z")).toBeNull();
    expect(siteNeighbours(["a"], "a")).toEqual({ previous: null, next: null, position: 1, total: 1 });
  });

  it("the list context keeps filters and sort, never site / present / tab", () => {
    expect(listContextQuery("?region=Hauts-de-France&sort=-area&site=X&present=1&tab=finance")).toBe("region=Hauts-de-France&sort=-area");
    expect(listContextQuery("sort=status")).toBe("");
    expect(siteSheetHref("abc", "status=critical&tab=finance&site=X")).toBe("/sites/abc?status=critical&tab=finance");
    expect(siteSheetHref("abc", "tab=overview")).toBe("/sites/abc");
  });
});

describe("surfaces and downloads", () => {
  it("surface breakdown keeps the known positive parts with their share", () => {
    const parts = surfaceBreakdown({ dryArea: 750, temperatureControlledArea: 0, socialOfficeArea: 250, guardHouseArea: null });
    expect(parts.map((p) => [p.key, p.share])).toEqual([["dryArea", 0.75], ["socialOfficeArea", 0.25]]);
    expect(surfaceBreakdown(null)).toEqual([]);
  });

  it("Content-Disposition: attachment, ASCII fallback and RFC 5987 UTF-8 name", () => {
    expect(attachmentDisposition("Bail signé (2024).pdf")).toBe(`attachment; filename="Bail signe (2024).pdf"; filename*=UTF-8''Bail%20sign%C3%A9%20%282024%29.pdf`);
    const hostile = attachmentDisposition('../"evil"\r\nX: y.pdf');
    expect(hostile).not.toMatch(/[\r\n/\\]/);
    expect(hostile.match(/"/g)).toHaveLength(2);
    expect(attachmentDisposition("")).toContain('filename="document"');
  });
});
