/**
 * Universal search (Ctrl+K), fully local on the site index (< 200 entries).
 *
 * Score, best first:
 *   1. exact match of the code or of an external identifier;
 *   2. the name, the city or the code STARTS with the query;
 *   3. every word of the query is contained in the searchable text;
 *   4. approximate match: words of 5+ letters within one edit
 *      (insertion, deletion, substitution) of a word of the text.
 * Accents, case and hyphens are ignored (foldText). See docs/filters-and-search.md.
 */
import { foldText } from "@/lib/text";
import { haystack } from "../filters/apply";
import type { SiteIndexEntry } from "../site-index";

/** Rank of a result (1 = best). */
export type SearchRank = 1 | 2 | 3 | 4;

/** A prepared entry (folded texts computed once). */
export interface PreparedEntry {
  entry: SiteIndexEntry;
  code: string;
  compactIds: string[];
  name: string;
  city: string;
  text: string;
  words: string[];
}

/** A site result. */
export interface SiteHit {
  entry: SiteIndexEntry;
  rank: SearchRank;
}

const compact = (s: string) => foldText(s).replace(/ /g, "");

/** Prepares the index for searching (call once per index). */
export function prepareSearch(entries: readonly SiteIndexEntry[]): PreparedEntry[] {
  return entries.map((entry) => {
    const text = haystack(entry);
    return {
      entry,
      code: foldText(entry.code),
      compactIds: [entry.code, ...entry.externalIds.qlik, ...entry.externalIds.al, ...entry.externalIds.ramses, entry.externalIds.leaseCode ?? ""].filter(Boolean).map(compact),
      name: foldText(entry.name),
      city: foldText(entry.city),
      text,
      words: [...new Set(text.split(" "))],
    };
  });
}

/**
 * Whether two words are within one edit (Levenshtein distance ≤ 1).
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/**
 * Rank of one prepared entry for a folded query, or null when it does not match.
 */
export function rankEntry(p: PreparedEntry, query: string): SearchRank | null {
  if (!query) return null;
  const q = query;
  const qc = q.replace(/ /g, "");
  if (p.compactIds.includes(qc)) return 1;
  if (p.name.startsWith(q) || p.city.startsWith(q) || p.code.replace(/ /g, "").startsWith(qc)) return 2;
  const tokens = q.split(" ");
  if (tokens.every((t) => p.text.includes(t))) return 3;
  const fuzzy = tokens.every((t) => (t.length >= 5 ? p.words.some((w) => withinOneEdit(t, w)) : p.text.includes(t)));
  return fuzzy ? 4 : null;
}

/**
 * Searches the sites.
 * @param prepared - Output of prepareSearch.
 * @param query - Raw query.
 * @param limit - Maximum number of results (default 8).
 */
export function searchSites(prepared: readonly PreparedEntry[], query: string, limit = 8): SiteHit[] {
  const q = foldText(query);
  if (!q) return [];
  const hits: SiteHit[] = [];
  for (const p of prepared) {
    const rank = rankEntry(p, q);
    if (rank !== null) hits.push({ entry: p.entry, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || b.entry.statusRank - a.entry.statusRank || a.entry.name.localeCompare(b.entry.name, "fr"));
  return hits.slice(0, limit);
}

/** A place result (applies a filter). */
export interface PlaceHit {
  kind: "region" | "department";
  /** Filter value: region name, or department code. */
  value: string;
  label: string;
  count: number;
}

/**
 * Regions and departments matching the query (name contains it, or exact
 * department code), with their number of sites.
 */
export function searchPlaces(entries: readonly SiteIndexEntry[], query: string, limit = 5): PlaceHit[] {
  const q = foldText(query);
  if (q.length < 2) return [];
  const regions = new Map<string, number>();
  const departments = new Map<string, { name: string; count: number }>();
  for (const e of entries) {
    if (e.region) regions.set(e.region, (regions.get(e.region) ?? 0) + 1);
    if (e.departmentCode) {
      const d = departments.get(e.departmentCode) ?? { name: e.departmentName ?? e.departmentCode, count: 0 };
      d.count++;
      departments.set(e.departmentCode, d);
    }
  }
  const hits: (PlaceHit & { score: number })[] = [];
  for (const [region, count] of regions) {
    const f = foldText(region);
    if (f.includes(q)) hits.push({ kind: "region", value: region, label: region, count, score: f.startsWith(q) ? 0 : 1 });
  }
  for (const [code, d] of departments) {
    const f = foldText(d.name);
    if (foldText(code) === q || f.includes(q)) hits.push({ kind: "department", value: code, label: `${d.name} (${code})`, count: d.count, score: foldText(code) === q || f.startsWith(q) ? 0 : 1 });
  }
  return hits
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, "fr"))
    .slice(0, limit)
    .map(({ score: _score, ...h }) => h);
}

/** A segment of a highlighted text. */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Folds one character (same rules as foldText, one output char per input char). */
function foldChar(c: string): string {
  const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (base.length !== 1) return base.charAt(0) || " ";
  return /[-‐‑–—_'’.,/\s]/.test(base) ? " " : base;
}

/**
 * Splits a text into highlighted / plain segments for the query words
 * (accents, case and hyphens ignored).
 */
export function highlight(text: string, query: string): HighlightSegment[] {
  const tokens = foldText(query).split(" ").filter((t) => t.length > 0);
  if (!text || tokens.length === 0) return text ? [{ text, match: false }] : [];
  const folded = [...text].map(foldChar).join("");
  const marks = new Array<boolean>(text.length).fill(false);
  for (const t of tokens) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(t, from);
      if (at < 0) break;
      for (let i = at; i < at + t.length; i++) marks[i] = true;
      from = at + t.length;
    }
  }
  const out: HighlightSegment[] = [];
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const last = out.at(-1);
    if (last && last.match === marks[i]) last.text += chars[i];
    else out.push({ text: chars[i]!, match: marks[i] ?? false });
  }
  return out;
}
