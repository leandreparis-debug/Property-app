/**
 * Display of the informative public data (`site_public_data`) written by the
 * enrichment: one formatter per known key; an unknown key is rendered as
 * key / value pairs — never as raw JSON. Values are data, never markup: every
 * formatter returns plain strings.
 */
import { formatDate, formatNumber, formatSurface } from "@/lib/format";

/** A formatted public-data item. */
export type PublicDataItem =
  | { key: string; labelFr: string; kind: "text"; text: string }
  | { key: string; labelFr: string; kind: "list"; items: string[] }
  | { key: string; labelFr: string; kind: "table"; columns: string[]; rows: string[][] }
  | { key: string; labelFr: string; kind: "pairs"; pairs: [string, string][] };

/** A stored public-data row (subset of `SitePublicData`). */
export interface PublicDataRow {
  provider: string;
  key: string;
  valueJson: string;
  fetchedAt: Date | null;
}

/** Public data of one provider. */
export interface PublicDataGroup {
  provider: string;
  providerLabelFr: string;
  /** Most recent fetch date of the group. */
  fetchedAt: Date | null;
  items: PublicDataItem[];
}

/** French name of the known providers (source shown on each group). */
export const PUBLIC_DATA_PROVIDERS: Readonly<Record<string, string>> = {
  georisques: "Géorisques",
  cadastre: "Cadastre (IGN)",
  urbanisme: "Géoportail de l'urbanisme",
  companies: "Annuaire des entreprises",
  geocoding: "Base adresse nationale",
  buildings: "BD TOPO (IGN)",
};

const EMPTY = "—";
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? formatNumber(v) : typeof v === "boolean" ? (v ? "Oui" : "Non") : EMPTY);
/** « 20190617 » or « 2019-06-17 » → « 17 juin 2019 »; anything else as text. */
const day = (v: unknown): string => {
  const m = typeof v === "string" ? /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v.trim()) : null;
  return m ? formatDate(`${m[1]}-${m[2]}-${m[3]}`) : str(v);
};
const metres = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? `${formatNumber(Math.round(v))} m` : EMPTY);

type Formatter = (value: unknown, key: string) => PublicDataItem | null;

/** Known keys → formatter. */
const FORMATTERS: Readonly<Record<string, Formatter>> = {
  seismicZone: (v, key) => {
    const o = obj(v);
    if (!o) return null;
    const label = typeof o.label === "string" && o.label.trim() ? ` — ${o.label.trim()}` : "";
    return { key, labelFr: "Zone de sismicité", kind: "text", text: `Zone ${str(o.code)}${label}` };
  },
  radonClass: (v, key) => (v === null || v === undefined ? null : { key, labelFr: "Potentiel radon", kind: "text", text: `Classe ${str(v)}` }),
  communeRisks: (v, key) => ({ key, labelFr: "Risques recensés sur la commune", kind: "list", items: arr(v).map(str).filter((s) => s !== EMPTY) }),
  icpeNearby: (v, key) => ({
    key,
    labelFr: "Installations classées à proximité",
    kind: "table",
    columns: ["Nom", "Distance", "Régime", "Seveso"],
    rows: arr(v).map((i) => {
      const o = obj(i) ?? {};
      return [str(o.name), metres(o.distanceM), str(o.regime), str(o.seveso)];
    }),
  }),
  parcels: (v, key) => ({
    key,
    labelFr: "Parcelles cadastrales",
    kind: "table",
    columns: ["Identifiant", "Section", "Numéro", "Contenance"],
    rows: arr(v).map((p) => {
      const o = obj(p) ?? {};
      return [str(o.idu), str(o.section), str(o.numero), typeof o.areaM2 === "number" ? formatSurface(o.areaM2) : EMPTY];
    }),
  }),
  parcelsTotalAreaM2: (v, key) => (typeof v === "number" ? { key, labelFr: "Contenance cadastrale totale", kind: "text", text: formatSurface(v) } : null),
  urbanZones: (v, key) => ({
    key,
    labelFr: "Zonage d'urbanisme",
    kind: "table",
    columns: ["Zone", "Libellé", "Type", "Approbation"],
    rows: arr(v).map((z) => {
      const o = obj(z) ?? {};
      return [str(o.label), str(o.longLabel), str(o.zoneType), day(o.approvedOn)];
    }),
  }),
  companyCandidates: (v, key) => ({
    key,
    labelFr: "Établissements à proximité (candidats)",
    kind: "table",
    columns: ["Raison sociale", "SIRET", "Activité", "Distance"],
    rows: arr(v).map((c) => {
      const o = obj(c) ?? {};
      return [str(o.name), str(o.siret ?? o.siren), str(o.activity), metres(o.distanceM)];
    }),
  }),
};

/**
 * Flattens any JSON value into readable key / value pairs
 * (`a.b`, `liste 1.nom`…). Empty containers give « — ».
 * @param value - Parsed JSON value.
 * @param prefix - Path prefix.
 */
export function flattenPairs(value: unknown, prefix = ""): [string, string][] {
  const label = (k: string) => (prefix ? `${prefix} › ${k}` : k);
  if (Array.isArray(value)) {
    if (value.length === 0) return [[prefix || "valeur", EMPTY]];
    if (value.every((v) => v === null || typeof v !== "object")) return [[prefix || "valeur", value.map(str).join(", ")]];
    return value.flatMap((v, i) => flattenPairs(v, label(String(i + 1))));
  }
  const o = obj(value);
  if (o) {
    const entries = Object.entries(o);
    if (entries.length === 0) return [[prefix || "valeur", EMPTY]];
    return entries.flatMap(([k, v]) => flattenPairs(v, label(k)));
  }
  // Unknown meaning: numbers are shown as written (a year stays « 2024 »), with a decimal comma.
  const text = typeof value === "number" && Number.isFinite(value) ? String(value).replace(".", ",") : str(value);
  return [[prefix || "valeur", text]];
}

/**
 * Formats one public-data value.
 * @param key - Data key.
 * @param valueJson - Stored JSON (unparsable JSON is shown as text).
 */
export function formatPublicData(key: string, valueJson: string): PublicDataItem | null {
  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    return { key, labelFr: key, kind: "text", text: valueJson };
  }
  const formatter = FORMATTERS[key];
  if (formatter) return formatter(value, key);
  return { key, labelFr: key, kind: "pairs", pairs: flattenPairs(value) };
}

/**
 * Public data grouped by provider (known providers first, in the order of
 * {@link PUBLIC_DATA_PROVIDERS}, then alphabetical).
 * @param rows - Rows of one site.
 */
export function groupPublicData(rows: readonly PublicDataRow[]): PublicDataGroup[] {
  const groups = new Map<string, PublicDataGroup>();
  for (const row of rows) {
    const item = formatPublicData(row.key, row.valueJson);
    let group = groups.get(row.provider);
    if (!group) {
      group = { provider: row.provider, providerLabelFr: PUBLIC_DATA_PROVIDERS[row.provider] ?? row.provider, fetchedAt: null, items: [] };
      groups.set(row.provider, group);
    }
    if (row.fetchedAt && (!group.fetchedAt || row.fetchedAt > group.fetchedAt)) group.fetchedAt = row.fetchedAt;
    if (item) group.items.push(item);
  }
  const known = Object.keys(PUBLIC_DATA_PROVIDERS);
  const rank = (p: string) => (known.includes(p) ? known.indexOf(p) : known.length);
  return [...groups.values()].sort((a, b) => rank(a.provider) - rank(b.provider) || a.provider.localeCompare(b.provider));
}
