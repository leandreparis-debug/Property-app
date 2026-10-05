"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LIST_SCHEMAS, type ListKind } from "@/domain/fields/lists";
import { fieldErrors } from "@/domain/fields/validation";
import type { FormValue } from "@/domain/fields/wire";
import { cn } from "@/lib/utils";
import { deleteListItemAction, saveListItemAction } from "@/server/sites/actions";
import { INPUT_CLASS } from "./FieldInput";
import { LEAVE_QUESTION, useEditGuard, useToast } from "./feedback";

/** A column / input of a list. */
export interface ListField {
  key: string;
  labelFr: string;
  type: "text" | "select" | "dateWithPrecision" | "longtext";
  options?: readonly { value: string; label: string }[];
}

/** A row: its form values and its formatted cells. */
export interface ListRow {
  id: string;
  values: Record<string, FormValue>;
  cells: ReactNode[];
}

/** Props of {@link ListEditor}. */
export interface ListEditorProps {
  siteId: string;
  kind: ListKind;
  /** Accessible name of the table and noun of the actions (« une rubrique »). */
  caption: string;
  itemLabel: string;
  fields: readonly ListField[];
  rows: readonly ListRow[];
  canEdit: boolean;
  empty: string;
}

const blank = (fields: readonly ListField[]): Record<string, FormValue> =>
  Object.fromEntries(fields.map((f) => [f.key, f.type === "dateWithPrecision" ? { date: "", precision: "day" } : f.type === "select" ? (f.options?.[0]?.value ?? "") : ""]));

/**
 * Editable list of the site sheet (ICPE headings, building works, external
 * ids): add, modify and delete row by row (deletion confirmed), validation
 * shared with the server, optional reason, audited Server Actions.
 */
export function ListEditor({ siteId, kind, caption, itemLabel, fields, rows, canEdit, empty }: ListEditorProps) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const guard = useEditGuard();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Record<string, FormValue>>({});
  const [initialForm, setInitialForm] = useState<Record<string, FormValue>>({});
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ListRow | null>(null);
  const [deleteComment, setDeleteComment] = useState("");

  const dirty = editing !== null && (JSON.stringify(form) !== JSON.stringify(initialForm) || comment.trim() !== "");
  useEffect(() => {
    guard.setDirty(id, dirty);
    return () => guard.setDirty(id, false);
  }, [dirty, guard, id]);

  const start = (row: ListRow | null) => {
    const values = row ? { ...row.values } : blank(fields);
    setForm(values);
    setInitialForm(values);
    setComment("");
    setErrors({});
    setSummary(null);
    setEditing(row ? row.id : "new");
  };
  const stop = () => {
    guard.setDirty(id, false);
    setEditing(null);
  };
  const cancel = () => {
    if (dirty && !window.confirm(LEAVE_QUESTION)) return;
    stop();
  };

  const save = async () => {
    const parsed = LIST_SCHEMAS[kind].safeParse(form);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      setSummary("Corriger les erreurs avant d'enregistrer.");
      const first = fields.find((f) => errs[f.key]);
      if (first) document.getElementById(`${id}-${first.key}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const result = await saveListItemAction({ siteId, kind, id: editing === "new" ? undefined : (editing ?? undefined), values: form, comment: comment.trim() || null });
      if (result.ok) {
        toast(editing === "new" ? `${itemLabel} ajouté(e)` : `${itemLabel} modifié(e)`);
        stop();
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        setSummary(result.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const result = await deleteListItemAction({ siteId, kind, id: deleting.id, comment: deleteComment.trim() || null });
      if (result.ok) {
        toast(`${itemLabel} supprimé(e)`);
        router.refresh();
      } else setSummary(result.message);
    } finally {
      setSaving(false);
      setDeleting(null);
      setDeleteComment("");
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  const formRow = (
    <div onKeyDown={onKeyDown} data-slot="list-form" className="space-y-3 rounded-md border border-accent/60 p-3">
      {summary && (
        <div role="alert" className="rounded-md border border-dashed border-destructive px-3 py-2 text-sm">
          {summary}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {fields.map((f) => {
          const inputId = `${id}-${f.key}`;
          const err = errors[f.key] ?? (f.key === "date" ? errors.date : undefined);
          const common = { id: inputId, "aria-invalid": err ? true : undefined, "aria-describedby": err ? `${inputId}-error` : undefined } as const;
          const value = form[f.key];
          return (
            <div key={f.key} className={cn(f.type === "longtext" && "sm:col-span-3")}>
              <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-text-muted">
                {f.labelFr}
              </label>
              {f.type === "select" ? (
                <select {...common} value={String(value ?? "")} onChange={(e) => setForm((c) => ({ ...c, [f.key]: e.target.value }))} className={INPUT_CLASS}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "dateWithPrecision" ? (
                <div className="flex gap-2">
                  <input {...common} type="date" value={typeof value === "object" ? value.date : ""} onChange={(e) => setForm((c) => ({ ...c, [f.key]: { ...(c[f.key] as { date: string; precision: string }), date: e.target.value } }))} className={INPUT_CLASS} />
                  <select aria-label={`Précision : ${f.labelFr}`} value={typeof value === "object" ? value.precision : "day"} onChange={(e) => setForm((c) => ({ ...c, [f.key]: { ...(c[f.key] as { date: string; precision: string }), precision: e.target.value } }))} className={cn(INPUT_CLASS, "w-28")}>
                    <option value="day">Jour</option>
                    <option value="month">Mois</option>
                    <option value="year">Année</option>
                  </select>
                </div>
              ) : f.type === "longtext" ? (
                <textarea {...common} rows={2} value={String(value ?? "")} onChange={(e) => setForm((c) => ({ ...c, [f.key]: e.target.value }))} className={INPUT_CLASS} />
              ) : (
                <input {...common} value={String(value ?? "")} onChange={(e) => setForm((c) => ({ ...c, [f.key]: e.target.value }))} className={INPUT_CLASS} />
              )}
              {err && (
                <p id={`${inputId}-error`} className="mt-1 text-xs font-medium">
                  {err}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div>
        <label htmlFor={`${id}-comment`} className="mb-1 block text-xs font-medium text-text-muted">
          Motif de la modification (facultatif)
        </label>
        <input id={`${id}-comment`} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} className={INPUT_CLASS} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel}>
          Annuler
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3" data-slot="list-editor" data-kind={kind}>
      {rows.length === 0 && editing !== "new" ? (
        <p className="text-sm text-text-muted">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-xs text-text-muted">
              {fields.map((f) => (
                <th key={f.key} scope="col" className="py-1 pr-4 font-medium">
                  {f.labelFr}
                </th>
              ))}
              {canEdit && (
                <th scope="col" className="py-1 text-right font-medium print:hidden">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              editing === row.id ? (
                <tr key={row.id}>
                  <td colSpan={fields.length + 1} className="py-2">
                    {formRow}
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className="border-t border-border" data-row={row.id}>
                  {row.cells.map((cell, i) => (
                    <td key={i} className={cn("py-1.5 pr-4 align-top", i === 0 && "font-medium")}>
                      {cell}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="py-1 text-right whitespace-nowrap print:hidden">
                      <Button size="sm" variant="ghost" onClick={() => start(row)} disabled={editing !== null}>
                        <Pencil aria-hidden="true" />
                        <span className="sr-only">Modifier {itemLabel.toLowerCase()} {String(row.cells[0] ?? "")}</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(row)} disabled={editing !== null}>
                        <Trash2 aria-hidden="true" />
                        <span className="sr-only">Supprimer {itemLabel.toLowerCase()} {String(row.cells[0] ?? "")}</span>
                      </Button>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
      {editing === "new" && formRow}
      {canEdit && editing === null && (
        <Button size="sm" variant="secondary" onClick={() => start(null)} className="print:hidden">
          <Plus aria-hidden="true" />
          Ajouter {itemLabel.toLowerCase()}
        </Button>
      )}
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer {itemLabel.toLowerCase()} ?</DialogTitle>
            <DialogDescription>La suppression est tracée dans le journal d&apos;audit.</DialogDescription>
          </DialogHeader>
          <label htmlFor={`${id}-delete-comment`} className="block text-xs font-medium text-text-muted">
            Motif (facultatif)
          </label>
          <input id={`${id}-delete-comment`} maxLength={500} value={deleteComment} onChange={(e) => setDeleteComment(e.target.value)} className={INPUT_CLASS} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Annuler
            </Button>
            <Button onClick={() => void confirmDelete()} disabled={saving}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
