import type { ReactNode } from "react";
import { detectReference, fieldsOfSection, formatFieldValue, isFilledValue, REFERENCE_KIND_LABELS, safeExternalUrl, type FieldDefinition, type FieldSection } from "@/domain/fields";
import { cn } from "@/lib/utils";
import { CopyableText, ExternalAnchor, WithProvenance, type ProvenanceHint } from "./values";

/** « — » for sighted users, « Non renseigné » for screen readers. */
export function EmptyValue() {
  return (
    <span data-slot="empty-value" className="text-text-muted">
      <span aria-hidden="true">—</span>
      <span className="sr-only">Non renseigné</span>
    </span>
  );
}

/**
 * One registry value: formatted text with its provenance; links (http/https
 * only) and paths (copy button) for URLs and free references.
 */
export function FieldValue({ def, value, hint }: { def: FieldDefinition; value: unknown; hint: ProvenanceHint | null }) {
  if (!isFilledValue(value)) return <EmptyValue />;
  if (def.type === "url" || def.type === "reference") {
    const text = String(value).trim();
    const ref = def.type === "url" ? (safeExternalUrl(text) ? detectReference(text) : { kind: "other" as const, text }) : detectReference(text);
    if (!ref) return <EmptyValue />;
    if (ref.kind === "url") return <ExternalAnchor href={ref.href} hint={hint}>{ref.text}</ExternalAnchor>;
    if (ref.kind === "networkPath" || ref.kind === "localPath") return <CopyableText text={ref.text} kindLabel={REFERENCE_KIND_LABELS[ref.kind]} hint={hint} />;
    return (
      <WithProvenance hint={hint} className="break-words">
        {ref.text}
      </WithProvenance>
    );
  }
  const text = formatFieldValue(def, value);
  return (
    <WithProvenance hint={hint} className={cn(def.type === "longtext" && "whitespace-pre-line", ["area", "money", "moneyPerSqm", "number", "integer", "months", "date"].includes(def.type) && "numeric")}>
      {text}
    </WithProvenance>
  );
}

/** A value to display: its definition, value and provenance. */
export interface FieldItem {
  def: FieldDefinition;
  value: unknown;
  hint: ProvenanceHint | null;
}

/**
 * Builds the items of a section from a record.
 * @param section - Registry section.
 * @param record - Record holding the values (missing record → every value empty).
 * @param hintOf - Provenance of a field.
 */
export function sectionItems(section: FieldSection, record: Record<string, unknown> | null, hintOf: (def: FieldDefinition) => ProvenanceHint | null): FieldItem[] {
  return fieldsOfSection(section).map((def) => {
    const raw = record?.[def.key];
    const value = def.type === "dateWithPrecision" && def.precisionKey ? (raw ? { date: raw as Date, precision: record?.[def.precisionKey] as never } : null) : raw;
    return { def, value, hint: isFilledValue(value) ? hintOf(def) : null };
  });
}

/** Values as a description list (`<dl>`), two columns on wide screens. */
export function FieldList({ items, columns = 2, className, extra }: { items: readonly FieldItem[]; columns?: 1 | 2; className?: string; extra?: ReactNode }) {
  return (
    <dl data-slot="field-list" className={cn("grid gap-x-8 gap-y-3", columns === 2 && "sm:grid-cols-2", className)}>
      {items.map(({ def, value, hint }) => (
        <div key={`${def.entity}.${def.key}`} data-field={`${def.entity}.${def.key}`} className={cn("min-w-0", def.type === "longtext" && columns === 2 && "sm:col-span-2")}>
          <dt className="text-xs text-text-muted">
            {def.labelFr}
            {def.helpFr && <span className="block text-[11px] text-text-muted">{def.helpFr}</span>}
          </dt>
          <dd className="mt-0.5 text-sm text-text">
            <FieldValue def={def} value={value} hint={hint} />
          </dd>
        </div>
      ))}
      {extra}
    </dl>
  );
}

/** A titled block of the sheet (h3 + content). */
export function SheetSection({ title, children, actions, className, id }: { title: string; children: ReactNode; actions?: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-lg border border-border bg-surface-1 p-5 print:break-inside-avoid print:border-neutral-300 print:bg-white", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id={id} className="text-sm font-semibold tracking-tight">
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
