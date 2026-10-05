/**
 * Actions of the command palette. Pure descriptions: the palette executes
 * them (filters, navigation, map view).
 */
import { foldText } from "@/lib/text";
import type { SiteFilters } from "../filters/schema";

/** What an action does. */
export type PaletteEffect =
  | { kind: "filter"; patch: Partial<SiteFilters>; path: "/" | "/sites" | "/supervision" | null }
  | { kind: "navigate"; path: "/" | "/sites" | "/supervision" }
  | { kind: "national-view" }
  | { kind: "clear-filters" };

/** A palette action. */
export interface PaletteAction {
  id: string;
  label: string;
  /** Extra words matched by the search. */
  keywords: string;
  effect: PaletteEffect;
  /** Shown when the palette opens with an empty query. */
  primary: boolean;
}

/** Actions of the palette, in display order. */
export const PALETTE_ACTIONS: readonly PaletteAction[] = [
  { id: "critical", label: "Afficher les sites critiques", keywords: "statut critique rouge", effect: { kind: "filter", patch: { status: ["critical"] }, path: null }, primary: true },
  { id: "warning", label: "Afficher les sites à surveiller", keywords: "statut avertissement orange", effect: { kind: "filter", patch: { status: ["warning"] }, path: null }, primary: true },
  { id: "deadline6", label: "Échéances de bail à moins de 6 mois", keywords: "arbitrage preavis bail echeance", effect: { kind: "filter", patch: { deadline: ["overdue", "lt3m", "lt6m"] }, path: null }, primary: true },
  { id: "national", label: "Vue nationale", keywords: "carte france recentrer", effect: { kind: "national-view" }, primary: true },
  { id: "supervision", label: "Ouvrir la supervision", keywords: "comite indicateurs tableau de bord", effect: { kind: "navigate", path: "/supervision" }, primary: true },
  { id: "list", label: "Ouvrir la liste des sites", keywords: "tableau liste sites", effect: { kind: "navigate", path: "/sites" }, primary: true },
  { id: "clear", label: "Effacer les filtres", keywords: "reinitialiser tout", effect: { kind: "clear-filters" }, primary: false },
];

/**
 * Actions matching the query (every word in the label or keywords); the
 * primary actions when the query is empty.
 */
export function searchActions(query: string, actions: readonly PaletteAction[] = PALETTE_ACTIONS): PaletteAction[] {
  const q = foldText(query);
  if (!q) return actions.filter((a) => a.primary);
  return actions.filter((a) => {
    const text = foldText(`${a.label} ${a.keywords}`);
    return q.split(" ").every((t) => text.includes(t));
  });
}
