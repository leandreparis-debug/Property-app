"use client";

import { Archive, ArchiveRestore, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { archiveSiteAction, unarchiveSiteAction } from "@/server/sites/actions";
import { INPUT_CLASS } from "./FieldInput";
import { useToast } from "./feedback";

/**
 * « Plus d'actions » menu of the sheet (administrators): « Archiver le site »
 * with a confirmation dialog and a MANDATORY reason, or « Désarchiver ».
 */
export function ArchiveControls({ siteId, name, archived, variant = "menu" }: { siteId: string; name: string; archived: boolean; variant?: "menu" | "button" }) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!archived && reason.trim() === "") {
      setError("Motif obligatoire pour archiver un site.");
      document.getElementById(`${id}-reason`)?.focus();
      return;
    }
    setBusy(true);
    const result = archived ? await unarchiveSiteAction({ siteId, reason: reason.trim() || null }) : await archiveSiteAction({ siteId, reason });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setOpen(false);
    setReason("");
    toast(archived ? "Site désarchivé" : "Site archivé", name);
    router.refresh();
  };

  return (
    <>
      {variant === "button" ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <ArchiveRestore aria-hidden="true" />
          {archived ? "Désarchiver" : "Archiver le site"}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" data-slot="sheet-menu">
              <MoreHorizontal aria-hidden="true" />
              Plus d&apos;actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setOpen(true)}>
              {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
              {archived ? "Désarchiver le site" : "Archiver le site"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-slot="archive-dialog">
          <DialogHeader>
            <DialogTitle>{archived ? "Désarchiver le site ?" : "Archiver le site ?"}</DialogTitle>
            <DialogDescription>
              {archived
                ? `« ${name} » réapparaîtra sur la carte, dans la liste, la recherche et la supervision.`
                : `« ${name} » disparaîtra de la carte, de la liste, de la recherche et de la supervision. Sa fiche restera consultable par son adresse.`}
            </DialogDescription>
          </DialogHeader>
          <label htmlFor={`${id}-reason`} className="block text-xs font-medium text-text-muted">
            {archived ? "Motif (facultatif)" : "Motif (obligatoire)"}
          </label>
          <textarea
            id={`${id}-reason`}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            required={!archived}
            className={INPUT_CLASS}
          />
          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm font-medium">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {archived ? "Désarchiver" : "Archiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
