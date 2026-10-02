"use client";

import { AlertTriangle, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { FieldDefinition, FieldSection } from "@/domain/fields";
import { buildSectionSchema, computeChanges, crossFieldRules, fieldErrors, type CrossFieldFinding } from "@/domain/fields/validation";
import { fromWire, wireToForm, type FormValue, type WireValue } from "@/domain/fields/wire";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import { saveSiteSectionAction } from "@/server/sites/actions";
import type { ConflictInfo } from "@/server/sites/edit-common";
import { ConflictDialog, type ConflictDecision } from "./ConflictDialog";
import { FieldInput, unitOf } from "./FieldInput";
import { LEAVE_QUESTION, useEditGuard, useToast } from "./feedback";

/** Maximum length of the reason. */
const COMMENT_MAX = 500;

const sameForm = (a: FormValue | undefined, b: FormValue | undefined) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

/** « 2 modifications enregistrées ». */
export function savedMessage(n: number): string {
  return n === 0 ? "Aucune modification à enregistrer" : `${n} modification${n > 1 ? "s" : ""} enregistrée${n > 1 ? "s" : ""}`;
}

/** « Statut : À surveiller → Conforme » when the status changed. */
export function statusChangeText(status: { before: keyof typeof STATUS_META; after: keyof typeof STATUS_META }): string | undefined {
  return status.before === status.after ? undefined : `Statut : ${STATUS_META[status.before].label} → ${STATUS_META[status.after].label}`;
}

/** Props of {@link SectionEditor}. */
export interface SectionEditorProps {
  siteId: string;
  section: FieldSection;
  title: string;
  /** Fields of the section, in display order (editable and read-only). */
  fields: readonly FieldDefinition[];
  /** Values shown to the user (wire form), by key. */
  initial: Readonly<Record<string, WireValue>>;
  /** The user may edit this section (permission checked again by the server). */
  canEdit: boolean;
  /** Read-only content (value list with provenance). */
  children: ReactNode;
  className?: string;
}

/**
 * A section of the site sheet, editable in place. « Modifier » turns the
 * block into a form generated from the registry: validation shared with the
 * server (immediate French messages next to each field), cross-field errors
 * and warnings (« Enregistrer quand même »), optional reason, field-by-field
 * conflicts, Ctrl+Entrée to save and Échap to cancel, confirmation before
 * leaving unsaved changes.
 */
export function SectionEditor({ siteId, section, title, fields, initial, canEdit, children, className }: SectionEditorProps) {
  const formId = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const guard = useEditGuard();
  const editable = useMemo(() => fields.filter((f) => f.editable), [fields]);
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState<Record<string, WireValue>>({ ...initial });
  const [form, setForm] = useState<Record<string, FormValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<CrossFieldFinding[]>([]);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const focusFirstError = useRef(false);
  const headingId = `${formId}-title`;

  const initialForm = useMemo(() => Object.fromEntries(editable.map((f) => [f.key, wireToForm(f, base[f.key] ?? null)])), [editable, base]);
  const dirty = editing && (editable.some((f) => !sameForm(form[f.key], initialForm[f.key])) || comment.trim() !== "");

  useEffect(() => {
    guard.setDirty(formId, dirty);
    return () => guard.setDirty(formId, false);
  }, [dirty, formId, guard]);

  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    const first = editable.find((f) => errors[f.key]);
    if (first) document.getElementById(`${formId}-${first.key}`)?.focus();
  }, [errors, editable, formId]);

  const open = () => {
    setBase({ ...initial });
    setForm(Object.fromEntries(editable.map((f) => [f.key, wireToForm(f, initial[f.key] ?? null)])));
    setErrors({});
    setSummary(null);
    setWarnings([]);
    setComment("");
    setEditing(true);
  };
  const close = () => {
    guard.setDirty(formId, false);
    setEditing(false);
  };
  const cancel = () => {
    if (dirty && !window.confirm(LEAVE_QUESTION)) return;
    close();
  };

  const showErrors = (errs: Record<string, string>, message: string) => {
    setErrors(errs);
    const list = editable.filter((f) => errs[f.key]).map((f) => `${f.labelFr} : ${errs[f.key]}`);
    setSummary(list.length ? `${message} ${list.join(" ")}` : (errs._form ?? message));
    focusFirstError.current = true;
  };

  const save = async (confirmWarnings = false, formValues = form, fromValues = base) => {
    setSummary(null);
    const parsed = buildSectionSchema(section).safeParse(formValues);
    if (!parsed.success) return showErrors(fieldErrors(parsed.error), "Corriger les erreurs avant d'enregistrer.");
    const values: Record<string, unknown> = {};
    for (const f of fields) values[f.key] = f.key in parsed.data ? parsed.data[f.key] : fromWire(f, fromValues[f.key] ?? null);
    const rules = crossFieldRules(section, values);
    if (rules.errors.length) return showErrors(Object.fromEntries(rules.errors.map((e) => [e.field, e.message])), "Corriger les erreurs avant d'enregistrer.");
    if (rules.warnings.length && !confirmWarnings) {
      setErrors({});
      setWarnings(rules.warnings);
      return;
    }
    const changes = computeChanges(section, fromValues, formValues, parsed.data);
    if (Object.keys(changes).length === 0) {
      toast(savedMessage(0));
      close();
      return;
    }
    setSaving(true);
    try {
      const result = await saveSiteSectionAction({ siteId, section, changes, comment: comment.trim() || null, confirmWarnings });
      if (result.ok) {
        toast(savedMessage(result.changedCount), statusChangeText(result.status));
        close();
        router.refresh();
        return;
      }
      if (result.reason === "conflict" && result.conflicts) setConflicts(result.conflicts);
      else if (result.reason === "warnings" && result.warnings) setWarnings(result.warnings);
      else showErrors(result.fieldErrors ?? {}, result.message);
    } catch {
      setSummary("L'enregistrement a échoué (connexion au serveur). Réessayer.");
    } finally {
      setSaving(false);
    }
  };

  const resolveConflicts = (decisions: Record<string, ConflictDecision>) => {
    const nextBase = { ...base };
    const nextForm = { ...form };
    for (const c of conflicts) {
      const def = editable.find((f) => f.key === c.field);
      if (!def) continue;
      nextBase[c.field] = c.theirs; // the reference becomes the current value
      if (decisions[c.field] === "theirs") nextForm[c.field] = wireToForm(def, c.theirs);
    }
    setConflicts([]);
    setBase(nextBase);
    setForm(nextForm);
    void save(true, nextForm, nextBase);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape" && conflicts.length === 0) {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      data-section={section}
      data-editing={editing || undefined}
      className={cn("rounded-lg border border-border bg-surface-1 p-5 print:break-inside-avoid print:border-neutral-300 print:bg-white", editing && "border-accent/60", className)}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold tracking-tight">
          {title}
        </h3>
        {canEdit && !editing && (
          <Button size="sm" variant="ghost" onClick={open} className="print:hidden" data-slot="edit-section">
            <Pencil aria-hidden="true" />
            Modifier<span className="sr-only"> la section {title}</span>
          </Button>
        )}
      </div>

      {!editing ? (
        children
      ) : (
        <form
          noValidate
          onKeyDown={onKeyDown}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          aria-labelledby={headingId}
          data-slot="section-form"
        >
          {summary && (
            <div role="alert" data-slot="error-summary" className="mb-4 rounded-md border border-dashed border-destructive px-3 py-2 text-sm">
              {summary}
            </div>
          )}
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `${formId}-${f.key}`;
              const unit = unitOf(f);
              const label = f.labelFr;
              if (!f.editable) {
                return (
                  <div key={f.key} className="min-w-0">
                    <p className="text-xs text-text-muted">{label}</p>
                    <p className="mt-1 text-sm text-text-muted">{base[f.key] === null || base[f.key] === undefined ? "—" : String(typeof base[f.key] === "object" ? (base[f.key] as { date: string }).date : base[f.key])}</p>
                    <p className="text-[11px] text-text-muted">Non modifiable</p>
                  </div>
                );
              }
              const help = f.helpFr ? `${id}-help` : "";
              const err = errors[f.key] ? `${id}-error` : "";
              return (
                <div key={f.key} className={cn("min-w-0", f.type === "longtext" && "sm:col-span-2")} data-field={`${f.entity}.${f.key}`}>
                  <label htmlFor={id} id={`${id}-label`} className="mb-1 block text-xs font-medium text-text-muted">
                    {label}
                    {unit && <span className="sr-only"> (en {unit})</span>}
                  </label>
                  <FieldInput def={f} id={id} value={form[f.key] ?? ""} onChange={(v) => setForm((cur) => ({ ...cur, [f.key]: v }))} error={errors[f.key]} describedBy={[help, err].filter(Boolean).join(" ")} />
                  {f.helpFr && (
                    <p id={help} className="mt-1 text-[11px] text-text-muted">
                      {f.helpFr}
                    </p>
                  )}
                  {errors[f.key] && (
                    <p id={err} className="mt-1 text-xs font-medium text-text" data-slot="field-error">
                      {errors[f.key]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {warnings.length > 0 && (
            <div role="alert" data-slot="warnings" className="mt-5 rounded-md border border-border-strong bg-surface-2 p-3 text-sm">
              <p className="mb-2 flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4 text-text-muted" aria-hidden="true" />
                Avertissements
              </p>
              <ul className="space-y-1.5">
                {warnings.map((w) => (
                  <li key={`${w.field}-${w.message}`} className="flex flex-wrap items-center gap-2">
                    <span>{w.message}</span>
                    {w.suggestion && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setForm((cur) => ({ ...cur, [w.suggestion!.field]: w.suggestion!.value }));
                          setWarnings((all) => all.filter((x) => x !== w));
                        }}
                      >
                        Appliquer : {w.suggestion.value}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" onClick={() => void save(true)} disabled={saving}>
                  Enregistrer quand même
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setWarnings([])}>
                  Revenir au formulaire
                </Button>
              </div>
            </div>
          )}

          <div className="mt-5">
            <label htmlFor={`${formId}-comment`} className="mb-1 block text-xs font-medium text-text-muted">
              Motif de la modification (facultatif)
            </label>
            <textarea id={`${formId}-comment`} rows={2} maxLength={COMMENT_MAX} value={comment} onChange={(e) => setComment(e.target.value)} className="w-full rounded-sm border border-input bg-secondary px-3 py-1.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-ring" />
            <p className="numeric mt-1 text-right text-xs text-text-muted">
              {[...comment].length} / {COMMENT_MAX}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={saving} aria-keyshortcuts="Control+Enter">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel} aria-keyshortcuts="Escape">
              Annuler
            </Button>
            <span className="text-xs text-text-muted">Ctrl+Entrée pour enregistrer, Échap pour annuler.</span>
          </div>
          <p className="mt-3 text-xs text-text-muted" data-slot="preservation-note">
            Les valeurs saisies ici ne seront plus écrasées par un import du tableur.
          </p>
        </form>
      )}
      {conflicts.length > 0 && <ConflictDialog conflicts={conflicts} onResolve={resolveConflicts} onCancel={() => setConflicts([])} />}
    </section>
  );
}
