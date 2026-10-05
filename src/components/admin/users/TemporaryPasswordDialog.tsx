"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Props of {@link TemporaryPasswordDialog}. */
export interface TemporaryPasswordDialogProps {
  /** Account the password belongs to. */
  email: string;
  /** The temporary password; `null` closes the dialog. */
  password: string | null;
  onClose(): void;
}

/**
 * Shows a temporary password ONCE (it is never stored in clear nor logged):
 * copy button, reminder to transmit it through a separate channel.
 */
export function TemporaryPasswordDialog({ email, password, onClose }: TemporaryPasswordDialogProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog
      open={password !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent data-slot="temporary-password-dialog">
        <DialogHeader>
          <DialogTitle>Mot de passe temporaire</DialogTitle>
          <DialogDescription>
            Pour {email}. Il ne sera plus jamais affiché : le transmettre à la personne par un canal séparé. Elle devra le changer à sa première connexion.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <output aria-label="Mot de passe temporaire" data-slot="temporary-password" className="numeric flex-1 rounded-sm border border-border-strong bg-surface-2 px-3 py-2 text-base font-semibold tracking-wide text-text select-all">
            {password}
          </output>
          <Button variant="secondary" onClick={() => void copy()} aria-label="Copier le mot de passe temporaire">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copié" : "Copier"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>J&apos;ai transmis le mot de passe</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
