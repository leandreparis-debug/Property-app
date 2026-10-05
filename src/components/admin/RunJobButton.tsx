"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/editing/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { runJobNowAction } from "@/server/ops/actions";

/** Props of {@link RunJobButton}. */
export interface RunJobButtonProps {
  job: string;
  label: string;
}

/**
 * « Lancer maintenant » with a confirmation dialog; waits for the end of the
 * run, then refreshes the screen. The permission is checked by the action.
 */
export function RunJobButton({ job, label }: RunJobButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const result = await runJobNowAction({ job });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setOpen(false);
    toast(label, result.message);
    router.refresh();
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} data-job={job}>
        <Play aria-hidden="true" />
        Lancer maintenant
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lancer « {label} » maintenant ?</DialogTitle>
            <DialogDescription>La tâche s&apos;exécute tout de suite, en votre nom. Une seule exécution à la fois : un second lancement est refusé.</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={() => void run()} disabled={busy} aria-busy={busy}>
              {busy ? "Exécution en cours…" : "Lancer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
