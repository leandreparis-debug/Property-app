/**
 * Filters ⇄ URL. Short parameters (status=critical,warning&region=…), in a
 * STABLE order (fixed criterion order, values sorted), defaults omitted,
 * values escaped so that commas and « % » survive. Unknown or invalid values
 * are ignored silently: a URL never breaks the page.
 */
import {
  EMPTY_FILTERS,
  FILTER_PARAMS,
  LIST_CRITERIA,
  MAX_VALUES,
  VALUE_SCHEMAS,
  activeSchema,
  completenessSchema,
  querySchema,
  type SiteFilters,
} from "./schema";

/** Parameters owned by the filters (others — site, sort, present — are kept as is). */
export const FILTER_PARAM_NAMES: ReadonlySet<string> = new Set(Object.values(FILTER_PARAMS));

const escapeValue = (v: string) => v.replace(/%/g, "%25").replace(/,/g, "%2C");
const unescapeValue = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

type ParamsLike = URLSearchParams | { get(name: string): string | null } | string;

function toParams(input: ParamsLike): { get(name: string): string | null } {
  return typeof input === "string" ? new URLSearchParams(input) : input;
}

/**
 * Reads the filters of a query string.
 * @param input - URLSearchParams, a `?…` string, or Next's ReadonlyURLSearchParams.
 */
export function parseFilters(input: ParamsLike): SiteFilters {
  const params = toParams(input);
  const filters: SiteFilters = { ...EMPTY_FILTERS };
  for (const criterion of LIST_CRITERIA) {
    const raw = params.get(FILTER_PARAMS[criterion]);
    if (!raw) continue;
    const values = new Set<string>();
    for (const part of raw.split(",")) {
      const parsed = VALUE_SCHEMAS[criterion].safeParse(unescapeValue(part));
      if (parsed.success) values.add(parsed.data as string);
      if (values.size >= MAX_VALUES) break;
    }
    (filters[criterion] as string[]) = [...values];
  }
  const active = activeSchema.safeParse(params.get(FILTER_PARAMS.active));
  if (active.success) filters.active = active.data;
  const completeness = params.get(FILTER_PARAMS.completenessBelow);
  if (completeness !== null && completeness !== "") {
    const parsed = completenessSchema.safeParse(completeness);
    if (parsed.success) filters.completenessBelow = parsed.data;
  }
  const q = querySchema.safeParse(params.get(FILTER_PARAMS.q) ?? "");
  if (q.success) filters.q = q.data.trim();
  return filters;
}

/**
 * Writes the filters as URL parameters (stable order, defaults omitted).
 * @returns URLSearchParams with the filter parameters only.
 */
export function serializeFilters(filters: SiteFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const criterion of LIST_CRITERIA) {
    const values = [...new Set(filters[criterion] as string[])].sort((a, b) => a.localeCompare(b, "fr"));
    if (values.length > 0) params.set(FILTER_PARAMS[criterion], values.map(escapeValue).join(","));
  }
  if (filters.active !== "all") params.set(FILTER_PARAMS.active, filters.active);
  if (filters.completenessBelow !== null) params.set(FILTER_PARAMS.completenessBelow, String(filters.completenessBelow));
  if (filters.q.trim() !== "") params.set(FILTER_PARAMS.q, filters.q.trim());
  return params;
}

/**
 * Query string with new filters, the other parameters kept (site, sort…).
 * @param search - Current query (`?…` or empty).
 * @param filters - New filters.
 * @param drop - Other parameters to remove (e.g. « site », « present »).
 * @returns The query without « ? » (may be empty).
 */
export function withFilters(search: string, filters: SiteFilters, drop: readonly string[] = []): string {
  const current = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const [key, value] of current) if (!FILTER_PARAM_NAMES.has(key) && !drop.includes(key)) out.append(key, value);
  const filterParams = serializeFilters(filters);
  // Filters first (stable), then the other parameters.
  return [filterParams.toString(), out.toString()].filter(Boolean).join("&");
}

/** Only the filter parameters of a query (links of the rail). */
export function filterQuery(search: string): string {
  return serializeFilters(parseFilters(search)).toString();
}
