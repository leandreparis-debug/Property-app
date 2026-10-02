"use client";

import { Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACCEPT_ATTRIBUTE, ALLOWED_TYPES, cleanFileName, extensionOf, MAX_DOCUMENT_BYTES, UPLOAD_MESSAGES } from "@/domain/documents";
import { DocumentCategory } from "@/domain/enums";
import { cn } from "@/lib/utils";
import { INPUT_CLASS } from "./FieldInput";
import { useToast } from "./feedback";

/** Upload with progress (fetch has no upload progress: XMLHttpRequest). */
export function uploadWithProgress(url: string, body: FormData, onProgress: (ratio: number) => void): Promise<{ status: number; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let error: string | undefined;
      try {
        error = (JSON.parse(xhr.responseText) as { error?: string }).error;
      } catch {
        error = undefined;
      }
      resolve({ status: xhr.status, error });
    };
    xhr.onerror = () => resolve({ status: 0, error: "Envoi impossible (connexion au serveur)." });
    xhr.send(body);
  });
}

/**
 * « Ajouter un document »: drop zone or file button, category (mandatory),
 * title (the cleaned file name by default), optional reason, progress bar and
 * French errors. The server checks everything again (size, signature, type).
 */
export function DocumentUploader({ siteId }: { siteId: string }) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const choose = (f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    if (!ALLOWED_TYPES[extensionOf(f.name)]) return setError(UPLOAD_MESSAGES.typeNotAllowed);
    if (f.size > MAX_DOCUMENT_BYTES) return setError(UPLOAD_MESSAGES.tooLarge);
    setFile(f);
    setTitle(cleanFileName(f.name));
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    choose(e.dataTransfer.files[0]);
  };
  const reset = () => {
    setFile(null);
    setTitle("");
    setComment("");
    setProgress(null);
    if (input.current) input.current.value = "";
  };

  const upload = async () => {
    if (!file) return setError("Choisir un fichier.");
    if (!category) return setError("Catégorie obligatoire.");
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("category", category);
    body.set("title", title);
    if (comment.trim()) body.set("comment", comment.trim());
    setProgress(0);
    const result = await uploadWithProgress(`/api/sites/${encodeURIComponent(siteId)}/documents`, body, setProgress);
    if (result.status === 201) {
      toast("Document ajouté", title);
      reset();
      router.refresh();
    } else {
      setProgress(null);
      setError(result.error ?? "L'ajout du document a échoué.");
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} data-slot="document-uploader" className="rounded-lg border border-border bg-surface-1 p-5 print:hidden">
      <h3 id={`${id}-title`} className="mb-3 text-sm font-semibold">
        Ajouter un document
      </h3>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-slot="drop-zone"
        className={cn("flex flex-col items-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-text-muted", over && "border-accent bg-accent/5")}
      >
        <Upload className="size-5" aria-hidden="true" />
        <p>{file ? <span className="text-text">{file.name}</span> : "Déposer un fichier ici ou"}</p>
        <input ref={input} id={`${id}-file`} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" tabIndex={-1} aria-label="Choisir un fichier" onChange={(e) => choose(e.target.files?.[0])} />
        <Button type="button" size="sm" variant="secondary" onClick={() => input.current?.click()}>
          {file ? "Choisir un autre fichier" : "Ajouter un document"}
        </Button>
        <p className="text-xs">PDF, images (PNG, JPEG, WebP), Word, Excel, PowerPoint, DWG, DXF — 50 Mo maximum.</p>
      </div>
      {file && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-category`} className="mb-1 block text-xs font-medium text-text-muted">
              Catégorie
            </label>
            <select id={`${id}-category`} value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT_CLASS} required>
              <option value="">Choisir une catégorie…</option>
              {DocumentCategory.values.map((c) => (
                <option key={c} value={c}>
                  {DocumentCategory.label(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-doc-title`} className="mb-1 block text-xs font-medium text-text-muted">
              Titre
            </label>
            <input id={`${id}-doc-title`} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-comment`} className="mb-1 block text-xs font-medium text-text-muted">
              Motif (facultatif)
            </label>
            <input id={`${id}-comment`} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>
      )}
      {progress !== null && (
        <div className="mt-3">
          <div role="progressbar" aria-label="Envoi du document" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium">
          {error}
        </p>
      )}
      {file && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => void upload()} disabled={progress !== null}>
            Envoyer
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={progress !== null}>
            Annuler
          </Button>
        </div>
      )}
    </section>
  );
}

/** « Supprimer » a document: confirmation, optional reason; the file goes to the trash. */
export function DeleteDocumentButton({ documentId, title }: { documentId: string; title: string }) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: comment.trim() || undefined }) });
    setBusy(false);
    if (response.status === 204) {
      setOpen(false);
      toast("Document supprimé", title);
      router.refresh();
    } else setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "La suppression a échoué.");
  };
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="print:hidden">
        <Trash2 aria-hidden="true" />
        Supprimer<span className="sr-only"> {title}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le document ?</DialogTitle>
            <DialogDescription>« {title} » sera retiré de la fiche. Le fichier est conservé dans la corbeille du serveur ; la suppression est tracée.</DialogDescription>
          </DialogHeader>
          <label htmlFor={`${id}-comment`} className="block text-xs font-medium text-text-muted">
            Motif (facultatif)
          </label>
          <input id={`${id}-comment`} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} className={INPUT_CLASS} />
          {error && (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => void remove()} disabled={busy}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
