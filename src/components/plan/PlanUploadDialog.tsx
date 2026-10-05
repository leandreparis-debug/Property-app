"use client";

import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { INPUT_CLASS } from "@/components/editing/FieldInput";
import { uploadWithProgress } from "@/components/editing/DocumentControls";
import { useToast } from "@/components/editing/feedback";
import { cleanFileName, MAX_DOCUMENT_BYTES, UPLOAD_MESSAGES } from "@/domain/documents";
import { checkPlanImage, MAX_PLAN_IMAGE_SIDE } from "@/domain/image-size";

/** Only the first bytes are needed to read the size (large JPEG headers included). */
const HEADER_BYTES = 256 * 1024;

/**
 * « Ajouter un plan »: an image exported from AutoCAD (PNG, JPEG or WebP,
 * 8192 px per side at most). Its size is checked in the browser from the
 * file header, then again by the server, which creates the new current plan.
 */
export function PlanUploadDialog({ siteId, label = "Ajouter un plan", variant = "default" }: { siteId: string; label?: string; variant?: "default" | "secondary" }) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [comment, setComment] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setSize(null);
    setComment("");
    setProgress(null);
    setError(null);
    if (input.current) input.current.value = "";
  };

  const choose = async (f: File | undefined) => {
    reset();
    if (!f) return;
    if (f.size > MAX_DOCUMENT_BYTES) return setError(UPLOAD_MESSAGES.tooLarge);
    const check = checkPlanImage(new Uint8Array(await f.slice(0, HEADER_BYTES).arrayBuffer()));
    if (!check.ok) return setError(check.error);
    setFile(f);
    setSize(check.size);
  };

  const send = async () => {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    body.set("category", "PLAN");
    body.set("title", cleanFileName(file.name));
    if (comment.trim()) body.set("comment", comment.trim());
    setProgress(0);
    const result = await uploadWithProgress(`/api/sites/${encodeURIComponent(siteId)}/documents`, body, setProgress);
    if (result.status === 201) {
      toast("Plan ajouté", "Calibrez-le pour le superposer à la carte.");
      setOpen(false);
      reset();
      router.refresh();
    } else {
      setProgress(null);
      setError(result.error ?? "L'ajout du plan a échoué.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>
          <ImagePlus aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un plan</DialogTitle>
          <DialogDescription>
            Exportez le plan AutoCAD en image PNG, JPEG ou WebP ({MAX_PLAN_IMAGE_SIDE} px maximum par côté, 4 000 à 6 000 px conseillés). Le plan actuel restera consultable dans l&apos;historique.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor={`${id}-file`} className="mb-1 block text-xs font-medium text-text-muted">
              Image du plan
            </label>
            <input ref={input} id={`${id}-file`} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(e) => void choose(e.target.files?.[0])} className={INPUT_CLASS} />
          </div>
          {file && size && (
            <p className="text-sm text-text-muted">
              <span className="text-text">{file.name}</span> — <span className="numeric">{size.width} × {size.height}</span> px
            </p>
          )}
          <div>
            <label htmlFor={`${id}-comment`} className="mb-1 block text-xs font-medium text-text-muted">
              Motif (facultatif)
            </label>
            <input id={`${id}-comment`} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} className={INPUT_CLASS} />
          </div>
          {progress !== null && (
            <div role="progressbar" aria-label="Envoi du plan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={progress !== null}>
            Annuler
          </Button>
          <Button onClick={() => void send()} disabled={!file || progress !== null}>
            Envoyer le plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
