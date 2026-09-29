import type { SiteIndexEntry } from "@/domain/site-index";

/** A site index entry for tests. */
export function entry(over: Partial<SiteIndexEntry> = {}): SiteIndexEntry {
  return {
    id: over.code ?? "s1",
    code: "SMP-001",
    name: "Entrepôt Test",
    city: "Saint-Priest",
    departmentCode: "69",
    departmentName: "Rhône",
    region: "Auvergne-Rhône-Alpes",
    lat: 45.7,
    lon: 4.9,
    portfolio: "Portefeuille A",
    occupyingBu: "BU Nord",
    typology: "Entrepôt",
    logisticsOperator: "Exploitant Démo",
    isActive: true,
    status: "ok",
    statusRank: 0,
    reasons: [],
    completeness: 90,
    totalArea: 20000,
    leaseDeadlineBucket: "gt12m",
    externalIds: { qlik: [], al: [], ramses: [], leaseCode: null },
    ...over,
  };
}
