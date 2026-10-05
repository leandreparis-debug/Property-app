"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { metricValueSchema } from "@/domain/metrics";
import { parseNumber } from "@/server/import/parsers";
import { cn } from "@/lib/utils";
import { saveAnnualMetricsAction } from "@/server/sites/actions";
import type { ConflictInfo } from "@/server/sites/edit-common";
import { ConflictDialog, type ConflictDecision } from "./ConflictDialog";
import { INPUT_CLASS } from "./FieldInput";
import { LEAVE_QUESTION, useEditGuard, useToast } from "./feedback";
import { savedMessage, statusChangeText } from "./SectionEditor";

/** A row of the editable metric table. */
export interface MetricEditorRow {
  code: string;
  labelFr: string;
  unit: string;
  /** The user may change this metric (financial ones need `finance:read`). */
  editable: boolean;
}

const key = (code: string, year: number) => `${code}|${year}`;
const toText = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
const YEAR_MIN = 1990;
const YEAR_MAX = 2100;

/** Validated number of a cell, or an error. */
function parseCell(text: string): { value: number | null } | { error: string } {
  if (text.trim() === "") return { value: null };
  const n = parseNumber(text).value;
  if (n === null) return { error: "Nombre invalide (exemple : 12 345,67)." };
  const checked = metricValueSchema.safeParse(n);
  return checked.success ? { value: checked.data } : { error: checked.error.issues[0]?.message ?? "Valeur invalide." };
}

/**
 * Yearly metric table editable cell by cell (« Modifier les valeurs »):
 * French numbers, an emptied cell deletes the value, « Ajouter une année »
 * adds a column. Same `from` / `to` conflict handling as the sections.
 */
export function MetricEditor({ siteId, caption, rows, years, values, children }: { siteId: string; caption: string; rows: readonly MetricEditorRow[]; years: readonly number[]; values: Readonly<Record<string, number | null>>; children: ReactNode }) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const guard = useEditGuard();
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState<Record<string, number | null>>({ ...values });
  const [cells, setCells] = useState<Record<string, string>>({});
  const [columns, setColumns] = useState<number[]>([...years]);
  const [newYear, setNewYear] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const editableRows = useMemo(() => rows.filter((r) => r.editable), [rows]);
  const canEdit = editableRows.length > 0;

  const changed = (b: Record<string, number | null>, c: Record<string, string>) =>
    Object.entries(c).filter(([k, text]) => {
      const parsed = parseCell(text);
      return !("value" in parsed) || parsed.value !== (b[k] ?? null);
    });
  const dirty = editing && (changed(base, cells).length > 0 || comment.trim() !== "");
  useEffect(() => {
    guard.setDirty(id, dirty);
    return () => guard.setDirty(id, false);
  }, [dirty, guard, id]);

  const open = () => {
    setBase({ ...values });
    setCells(Object.fromEntries(editableRows.flatMap((r) => years.map((y) => [key(r.code, y), toText(values[key(r.code, y)] ?? null)]))));
    setColumns([...years]);
    setErrors({});
    setSummary(null);
    setComment("");
    setEditing(true);
  };
  const close = () => {
    guard.setDirty(id, false);
    setEditing(false);
  };
  const cancel = () => {
    if (dirty && !window.confirm(LEAVE_QUESTION)) return;
    close();
  };

  const addYear = () => {
    const y = Number(newYear);
    if (!Number.isInteger(y) || y < YEAR_MIN || y > YEAR_MAX) {
      setErrors((e) => ({ ...e, _year: `Année entre ${YEAR_MIN} et ${YEAR_MAX} attendue.` }));
      return;
    }
    if (!columns.includes(y)) setColumns([...columns, y].sort((a, b) => a - b));
    setCells((c) => ({ ...c, ...Object.fromEntries(editableRows.filter((r) => c[key(r.code, y)] === undefined).map((r) => [key(r.code, y), ""])) }));
    setErrors(({ _year: _, ...rest }) => rest);
    setNewYear("");
  };

  const save = async (cellValues = cells, baseValues = base) => {
    const errs: Record<string, string> = {};
    const changes: { metric: string; year: number; from: number | null; to: string }[] = [];
    for (const [k, text] of changed(baseValues, cellValues)) {
      const parsed = parseCell(text);
      if ("error" in parsed) errs[k] = parsed.error;
      const [metric, year] = k.split("|");
      changes.push({ metric: metric!, year: Number(year), from: baseValues[k] ?? null, to: text });
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      setSummary(`Corriger les valeurs invalides (${Object.keys(errs).length}).`);
      document.getElementById(`${id}-${Object.keys(errs)[0]!.replace("|", "-")}`)?.focus();
      return;
    }
    if (changes.length === 0) {
      toast(savedMessage(0));
      close();
      return;
    }
    setSaving(true);
    try {
      const result = await saveAnnualMetricsAction({ siteId, changes, comment: comment.trim() || null });
      if (result.ok) {
        toast(savedMessage(result.changedCount), statusChangeText(result.status));
        close();
        router.refresh();
      } else if (result.reason === "conflict" && result.conflicts) setConflicts(result.conflicts);
      else {
        setErrors(result.fieldErrors ?? {});
        setSummary(result.message);
      }
    } catch {
      setSummary("L'enregistrement a échoué (connexion au serveur). Réessayer.");
    } finally {
      setSaving(false);
    }
  };

  const resolve = (decisions: Record<string, ConflictDecision>) => {
    const nextBase = { ...base };
    const nextCells = { ...cells };
    for (const c of conflicts) {
      const theirs = typeof c.theirs === "number" ? c.theirs : null;
      nextBase[c.field] = theirs;
      if (decisions[c.field] === "theirs") nextCells[c.field] = toText(theirs);
    }
    setConflicts([]);
    setBase(nextBase);
    setCells(nextCells);
    void save(nextCells, nextBase);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape" && conflicts.length === 0) {
      event.preventDefault();
      cancel();
    }
  };

  if (!editing) {
    return (
      <div className="space-y-3">
        {canEdit && (
          <div className="flex justify-end print:hidden">
            <Button size="sm" variant="ghost" onClick={open} data-slot="edit-metrics">
              <Pencil aria-hidden="true" />
              Modifier les valeurs
            </Button>
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <div onKeyDown={onKeyDown} data-slot="metric-editor" className="space-y-3">
      {summary && (
        <div role="alert" className="rounded-md border border-dashed border-destructive px-3 py-2 text-sm">
          {summary}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`${id}-year`} className="mb-1 block text-xs font-medium text-text-muted">
            Ajouter une année
          </label>
          <input
            id={`${id}-year`}
            inputMode="numeric"
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                addYear();
              }
            }}
            aria-invalid={errors._year ? true : undefined}
            aria-describedby={errors._year ? `${id}-year-error` : undefined}
            className={cn(INPUT_CLASS, "numeric w-28")}
            placeholder="2027"
          />
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={addYear}>
          <Plus aria-hidden="true" />
          Ajouter la colonne
        </Button>
        {errors._year && (
          <p id={`${id}-year-error`} className="text-xs font-medium">
            {errors._year}
          </p>
        )}
      </div>
      <div className="max-h-[560px] overflow-auto rounded-lg border border-border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{caption} — modification</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 left-0 z-20 border-b border-border bg-surface-2 px-3 py-2 text-left text-xs font-medium text-text-muted">
                Indicateur
              </th>
              {columns.map((y) => (
                <th key={y} scope="col" className="numeric sticky top-0 z-10 border-b border-border bg-surface-2 px-2 py-2 text-right text-xs font-medium text-text-muted">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {editableRows.map((r) => (
              <tr key={r.code} data-metric={r.code}>
                <th scope="row" className="sticky left-0 z-10 border-b border-border bg-surface-1 px-3 py-2 text-left font-normal whitespace-nowrap">
                  {r.labelFr}
                  <span className="block text-[11px] text-text-muted">{r.unit}</span>
                </th>
                {columns.map((y) => {
                  const k = key(r.code, y);
                  const cellId = `${id}-${r.code}-${y}`;
                  return (
                    <td key={y} className="border-b border-border px-2 py-1.5 align-top">
                      <input
                        id={cellId}
                        aria-label={`${r.labelFr} ${y} (${r.unit})`}
                        inputMode="decimal"
                        value={cells[k] ?? ""}
                        onChange={(e) => setCells((c) => ({ ...c, [k]: e.target.value }))}
                        aria-invalid={errors[k] ? true : undefined}
                        aria-describedby={errors[k] ? `${cellId}-error` : undefined}
                        className={cn(INPUT_CLASS, "numeric w-32 text-right")}
                      />
                      {errors[k] && (
                        <p id={`${cellId}-error`} className="mt-1 max-w-32 text-[11px] font-medium">
                          {errors[k]}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">Vider une cellule supprime la valeur. Les valeurs saisies ici ne seront plus écrasées par un import du tableur.</p>
      <div>
        <label htmlFor={`${id}-comment`} className="mb-1 block text-xs font-medium text-text-muted">
          Motif de la modification (facultatif)
        </label>
        <textarea id={`${id}-comment`} rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} className={INPUT_CLASS} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving} aria-keyshortcuts="Control+Enter">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel} aria-keyshortcuts="Escape">
          Annuler
        </Button>
        <span className="text-xs text-text-muted">Ctrl+Entrée pour enregistrer, Échap pour annuler.</span>
      </div>
      {conflicts.length > 0 && <ConflictDialog conflicts={conflicts} onResolve={resolve} onCancel={() => setConflicts([])} />}
    </div>
  );
}
