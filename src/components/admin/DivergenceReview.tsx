"use client";

import Link from "next/link";
import { ArrowRight, Check, CircleSlash, MinusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useToast } from "@/components/editing/feedback";
import { Button } from "@/components/ui/button";
import { INPUT_CLASS } from "@/components/ui/input-class";
import { DivergenceStatus } from "@/domain/enums";
import { formatDateTime } from "@/lib/format";
import { adoptDivergenceAction, dismissDivergencesAction } from "@/server/enrichment/actions";
import { ConfirmDialog } from "./ConfirmDialog";

/** A divergence as sent to the client. */
export interface DivergenceItem {
  id: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  siteArchived: boolean;
  targetLabel: string;
  adoptable: boolean;
  currentValue: string | null;
  proposedValue: string;
  provider: string;
  evidence: string | null;
  status: string;
  createdAt: string;
  resolvedBy: string | null;
  resolutionComment: string | null;
}

/** Props of {@link DivergenceReview}. */
export interface DivergenceReviewProps {
  items: DivergenceItem[];
}

const short = (text: string | null) => (text === null ? "—" : text.length > 160 ? `${text.slice(0, 160)}…` : text);

function StatusText({ status }: { status: string }) {
  const Icon = status === "accepted" ? Check : status === "dismissed" ? CircleSlash : MinusCircle;
  return (
    <span className={status === "open" ? "inline-flex items-center gap-1.5 font-semibold text-text" : "inline-flex items-center gap-1.5 text-text-muted"}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {DivergenceStatus.is(status) ? DivergenceStatus.label(status) : status}
    </span>
  );
}

/**
 * Review of the divergences: current and proposed values side by side, link
 * to the sheet; « Conserver la valeur actuelle » (also on a selection) and
 * « Adopter la valeur proposée » (one at a time), each with an optional reason.
 */
export function DivergenceReview({ items }: DivergenceReviewProps) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ kind: "dismiss"; ids: string[] } | { kind: "adopt"; item: DivergenceItem } | null>(null);
  const [comment, setComment] = useState("");
  const open = items.filter((d) => d.status === "open");
  const allSelected = open.length > 0 && open.every((d) => selected.has(d.id));

  const toggle = (divergenceId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(divergenceId)) next.delete(divergenceId);
      else next.add(divergenceId);
      return next;
    });

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <Button variant="secondary" size="sm" disabled={selected.size === 0} onClick={() => setDialog({ kind: "dismiss", ids: [...selected] })} data-slot="dismiss-selection">
          <CircleSlash aria-hidden="true" />
          Conserver la valeur actuelle ({selected.size})
        </Button>
        <span className="text-xs text-text-muted">L&apos;adoption d&apos;une valeur proposée se fait divergence par divergence.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-slot="divergences-table">
          <caption className="sr-only">Divergences entre les valeurs actuelles et les données publiques</caption>
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th scope="col" className="w-8 py-1.5 pr-2">
                <input
                  type="checkbox"
                  aria-label="Sélectionner toutes les divergences à examiner"
                  checked={allSelected}
                  disabled={open.length === 0}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(open.map((d) => d.id)))}
                  className="size-4 accent-[var(--color-accent)]"
                />
              </th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Site</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Champ</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Valeur actuelle</th>
              <th scope="col" className="w-6 py-1.5 pr-2">
                <span className="sr-only">vers</span>
              </th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Valeur proposée</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Source</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Statut</th>
              <th scope="col" className="py-1.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-text-muted">
                  Aucune divergence ne correspond aux filtres.
                </td>
              </tr>
            )}
            {items.map((d) => (
              <tr key={d.id} className="border-t border-border align-top" data-divergence={d.id} data-status={d.status}>
                <td className="py-2.5 pr-2">
                  {d.status === "open" && (
                    <input type="checkbox" aria-label={`Sélectionner ${d.siteCode} — ${d.targetLabel}`} checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="size-4 accent-[var(--color-accent)]" />
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  <Link href={`/sites/${d.siteId}`} className="font-mono text-xs text-accent hover:underline">
                    {d.siteCode}
                  </Link>
                  <span className="block max-w-48 truncate text-xs text-text-muted" title={d.siteName}>
                    {d.siteName}
                    {d.siteArchived && " (archivé)"}
                  </span>
                </td>
                <td className="py-2.5 pr-4">{d.targetLabel}</td>
                <td className="max-w-64 py-2.5 pr-4 break-words" data-slot="current-value">
                  {short(d.currentValue)}
                </td>
                <td className="py-2.5 pr-2 text-text-subtle">
                  <ArrowRight className="size-4" aria-hidden="true" />
                </td>
                <td className="max-w-64 py-2.5 pr-4 font-medium break-words" data-slot="proposed-value">
                  {short(d.proposedValue)}
                </td>
                <td className="py-2.5 pr-4 text-text-muted">
                  {d.provider}
                  <span className="block text-xs">{formatDateTime(d.createdAt)}</span>
                </td>
                <td className="py-2.5 pr-4">
                  <StatusText status={d.status} />
                  {d.resolvedBy && <span className="block text-xs text-text-muted">par {d.resolvedBy}</span>}
                  {d.resolutionComment && <span className="block text-xs text-text-muted">« {d.resolutionComment} »</span>}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {d.status === "open" && (
                    <span className="inline-flex gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "dismiss", ids: [d.id] })}>
                        Conserver
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!d.adoptable || d.siteArchived}
                        title={!d.adoptable ? "Champ non modifiable dans la fiche" : d.siteArchived ? "Site archivé" : undefined}
                        onClick={() => setDialog({ kind: "adopt", item: d })}
                      >
                        Adopter
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(v) => {
          if (!v) {
            setDialog(null);
            setComment("");
          }
        }}
        slot="divergence-dialog"
        title={dialog?.kind === "adopt" ? "Adopter la valeur proposée ?" : `Conserver la valeur actuelle (${dialog?.kind === "dismiss" ? dialog.ids.length : 0}) ?`}
        description={
          dialog?.kind === "adopt"
            ? `${dialog.item.siteCode} — ${dialog.item.targetLabel} : « ${short(dialog.item.currentValue)} » sera remplacée par « ${short(dialog.item.proposedValue)} », comme une modification de la fiche (tracée, source enrichissement).`
            : "Les divergences sélectionnées sont écartées : elles ne réapparaîtront pas pour la même valeur proposée."
        }
        confirmLabel={dialog?.kind === "adopt" ? "Adopter" : "Conserver"}
        onConfirm={async () => {
          if (!dialog) return null;
          const result = dialog.kind === "adopt" ? await adoptDivergenceAction({ id: dialog.item.id, comment }) : await dismissDivergencesAction({ ids: dialog.ids, comment });
          if (!result.ok) return result.message;
          toast(dialog.kind === "adopt" ? "Valeur proposée adoptée" : `${result.count} divergence${result.count > 1 ? "s" : ""} écartée${result.count > 1 ? "s" : ""}`);
          setSelected(new Set());
          setComment("");
          router.refresh();
          return null;
        }}
      >
        <label htmlFor={`${id}-comment`} className="text-xs font-medium text-text-muted">
          Motif (facultatif)
        </label>
        <textarea id={`${id}-comment`} rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} className={INPUT_CLASS} />
      </ConfirmDialog>
    </>
  );
}
