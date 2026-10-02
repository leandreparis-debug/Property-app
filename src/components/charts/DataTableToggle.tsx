"use client";

import { Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * « Voir les données » button of a chart. The table stays in the document
 * when collapsed (visually hidden, still read by screen readers) and is
 * always printed.
 */
export function DataTableToggle({ tableId, children }: { tableId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={tableId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-ring print:hidden"
      >
        <Table2 className="size-3.5" aria-hidden="true" />
        {open ? "Masquer les données" : "Voir les données"}
      </button>
      <div data-slot="chart-data" className={cn("relative mt-2 overflow-x-auto", !open && "sr-only print:not-sr-only")}>
        {children}
      </div>
    </div>
  );
}
