"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Props of {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Runs the action; returns an error message to display, or `null` on success (the dialog closes). */
  onConfirm(): Promise<string | null>;
  /** Extra fields (select, reason…). */
  children?: ReactNode;
  /** Test hook. */
  slot?: string;
}

/** Confirmation dialog of the administration screens: cancel, confirm, error shown in place. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, children, slot }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    const message = await onConfirm();
    setBusy(false);
    if (message) setError(message);
    else onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        setError(null);
        onOpenChange(value);
      }}
    >
      <DialogContent data-slot={slot}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error && (
          <p role="alert" className="text-sm font-medium text-text">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={() => void confirm()} disabled={busy} aria-busy={busy}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
