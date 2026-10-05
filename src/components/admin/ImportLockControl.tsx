"use client";

import { Lock, LockOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useToast } from "@/components/editing/feedback";
import { Button } from "@/components/ui/button";
import { INPUT_CLASS } from "@/components/ui/input-class";
import { setImportLockAction } from "@/server/settings-actions";
import { ConfirmDialog } from "./ConfirmDialog";

/** Props of {@link ImportLockControl}. */
export interface ImportLockControlProps {
  locked: boolean;
}

/** Button activating or deactivating the import lock, with confirmation and an optional reason. */
export function ImportLockControl({ locked }: ImportLockControlProps) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  return (
    <>
      <Button variant={locked ? "secondary" : "default"} onClick={() => setOpen(true)} data-slot="import-lock-button">
        {locked ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
        {locked ? "Déverrouiller l'import" : "Verrouiller l'import"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={locked ? "Déverrouiller l'import du tableur ?" : "Verrouiller l'import du tableur ?"}
        description={
          locked
            ? "Un import réel redeviendra possible depuis la ligne de commande. À réserver à une reprise exceptionnelle."
            : "Tout import réel sera refusé par la ligne de commande ; la simulation reste possible. La base devient la seule source de vérité."
        }
        confirmLabel={locked ? "Déverrouiller" : "Verrouiller"}
        onConfirm={async () => {
          const result = await setImportLockAction({ locked: !locked, comment });
          if (!result.ok) return result.message;
          toast(locked ? "Import déverrouillé" : "Import verrouillé");
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
