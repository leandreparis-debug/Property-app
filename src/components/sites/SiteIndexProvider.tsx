"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { SiteIndexEntry } from "@/domain/site-index";

/** Value of the site index context. */
export interface SiteIndexContextValue {
  entries: SiteIndexEntry[];
  /** Business date of the evaluation (YYYY-MM-DD). */
  evaluatedOn: string;
  /** Instant of the last load (ISO). */
  loadedAt: string;
  /** Reloads the index from GET /api/sites/index (presentation mode). */
  refresh: () => Promise<void>;
}

const SiteIndexContext = createContext<SiteIndexContextValue | null>(null);

/**
 * Provides the site index — THE single data source of the map, the list,
 * the search and the supervision — loaded once by the protected layout.
 */
export function SiteIndexProvider({ entries: initial, evaluatedOn: initialDate, children }: { entries: SiteIndexEntry[]; evaluatedOn: string; children: ReactNode }) {
  const [state, setState] = useState({ entries: initial, evaluatedOn: initialDate, loadedAt: new Date().toISOString() });
  const refresh = useCallback(async () => {
    const response = await fetch("/api/sites/index", { cache: "no-store" });
    if (!response.ok) throw new Error(`Rafraîchissement impossible (HTTP ${response.status}).`);
    const body = (await response.json()) as { generatedAt: string; entries: SiteIndexEntry[] };
    setState({ entries: body.entries, evaluatedOn: body.generatedAt.slice(0, 10), loadedAt: body.generatedAt });
  }, []);
  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <SiteIndexContext.Provider value={value}>{children}</SiteIndexContext.Provider>;
}

/** The site index (inside the protected area). */
export function useSiteIndex(): SiteIndexContextValue {
  const value = useContext(SiteIndexContext);
  if (!value) throw new Error("useSiteIndex() hors de SiteIndexProvider.");
  return value;
}
