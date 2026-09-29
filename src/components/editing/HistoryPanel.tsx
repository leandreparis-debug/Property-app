"use client";

import { History } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import type { FieldHistoryEntry } from "@/server/sites/history";

/** A field whose history can be opened. */
export interface HistoryTarget {
  entity: string;
  field: string;
  labelFr: string;
}

const HistoryContext = createContext<((target: HistoryTarget) => void) | null>(null);

/** Opens the history panel of a field, or `null` outside a site sheet. */
export function useOpenHistory() {
  return useContext(HistoryContext);
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * History panel of a field of the site: date, author, source, previous →
 * new value and reason, newest first (50 entries at most), read from
 * `GET /api/sites/[id]/history`.
 */
export function HistoryProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const [target, setTarget] = useState<HistoryTarget | null>(null);
  const [entries, setEntries] = useState<FieldHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = useCallback((t: HistoryTarget) => {
    setEntries(null);
    setError(null);
    setTarget(t);
  }, []);

  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    const q = new URLSearchParams({ entity: target.entity, field: target.field });
    fetch(`/api/sites/${encodeURIComponent(siteId)}/history?${q.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setEntries(((await r.json()) as { entries: FieldHistoryEntry[] }).entries);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setError("Historique indisponible.");
      });
    return () => controller.abort();
  }, [siteId, target]);

  return (
    <HistoryContext.Provider value={open}>
      {children}
      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent data-slot="history-panel" className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4 text-text-muted" aria-hidden="true" />
              Historique — {target?.labelFr}
            </DialogTitle>
            <DialogDescription>Modifications du champ, de la plus récente à la plus ancienne (50 au maximum).</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm">{error}</p>}
          {!error && entries === null && <p className="text-sm text-text-muted">Chargement…</p>}
          {entries && entries.length === 0 && <p className="text-sm text-text-muted">Aucune modification enregistrée pour ce champ.</p>}
          {entries && entries.length > 0 && (
            <ol className="max-h-[60vh] space-y-3 overflow-y-auto" data-slot="history-entries">
              {entries.map((e) => (
                <li key={e.id} className="rounded-md border border-border p-3 text-sm" data-source={e.source}>
                  <p className="text-xs text-text-muted">
                    {formatDate(e.at)} à {timeFmt.format(new Date(e.at))} — {e.sourceLabel}
                    {e.by ? ` par ${e.by}` : ""}
                  </p>
                  <p className="numeric mt-1" data-slot="history-change">
                    <span className="text-text-muted">{e.before}</span>
                    <span aria-hidden="true"> → </span>
                    <span className="sr-only"> devient </span>
                    <span className="font-medium">{e.after}</span>
                  </p>
                  {e.comment && <p className="mt-1 text-xs text-text-muted">Motif : {e.comment}</p>}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </HistoryContext.Provider>
  );
}
