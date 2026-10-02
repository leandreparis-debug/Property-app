"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ConflictInfo } from "@/server/sites/edit-common";
import { formatDate } from "@/lib/format";

/** Decision of the user for one conflicting field. */
export type ConflictDecision = "theirs" | "mine";

/**
 * Field-by-field conflict dialog: for each field, « Votre valeur » and
 * « Valeur actuelle — modifiée par {nom} le {date} » (with the reason), and
 * the choice « Garder la leur » or « Remplacer par la mienne ». Once every
 * field is decided, `onResolve` receives the decisions; « Annuler » closes
 * without changing anything (the form stays open).
 */
export function ConflictDialog({ conflicts, onResolve, onCancel }: { conflicts: readonly ConflictInfo[]; onResolve(decisions: Record<string, ConflictDecision>): void; onCancel(): void }) {
  const [decisions, setDecisions] = useState<Record<string, ConflictDecision>>({});
  const decide = (field: string, decision: ConflictDecision) => {
    const next = { ...decisions, [field]: decision };
    setDecisions(next);
    if (conflicts.every((c) => next[c.field])) onResolve(next);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent data-slot="conflict-dialog" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifications concurrentes</DialogTitle>
          <DialogDescription>
            {conflicts.length === 1 ? "Ce champ a été modifié" : "Ces champs ont été modifiés"} par quelqu&apos;un d&apos;autre depuis l&apos;ouverture du formulaire. Rien n&apos;a été enregistré. Choisir, champ par champ, la valeur à conserver.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-4 overflow-y-auto">
          {conflicts.map((c) => (
            <li key={c.field} data-conflict={c.field} className="rounded-md border border-border p-3">
              <p className="mb-2 text-sm font-semibold">{c.labelFr}</p>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-text-muted">Votre valeur</dt>
                  <dd className="numeric">{c.yoursText}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">
                    Valeur actuelle{c.by ? ` — modifiée par ${c.by}` : ""}
                    {c.at ? ` le ${formatDate(c.at)}` : ""}
                  </dt>
                  <dd className="numeric">{c.theirsText}</dd>
                  {c.comment && <dd className="mt-1 text-xs text-text-muted">Motif : {c.comment}</dd>}
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Choix pour ${c.labelFr}`}>
                <Button size="sm" variant={decisions[c.field] === "theirs" ? "default" : "secondary"} aria-pressed={decisions[c.field] === "theirs"} onClick={() => decide(c.field, "theirs")}>
                  Garder la leur
                </Button>
                <Button size="sm" variant={decisions[c.field] === "mine" ? "default" : "secondary"} aria-pressed={decisions[c.field] === "mine"} onClick={() => decide(c.field, "mine")}>
                  Remplacer par la mienne
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
