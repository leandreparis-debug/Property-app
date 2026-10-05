"use client";

import type { FieldDefinition } from "@/domain/fields";
import type { FormValue } from "@/domain/fields/wire";
import { DEPARTMENTS, REGIONS } from "@/domain/geo";
import { cn } from "@/lib/utils";

/** Classes shared by the inputs (tokens only, error = dashed border). */
export const INPUT_CLASS = cn(
  "w-full min-w-0 rounded-sm border border-input bg-secondary px-3 py-1.5 text-sm text-foreground outline-none transition-colors",
  "hover:border-border-strong focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
  "aria-invalid:border-dashed aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60",
);

/** Unit suffix of a numeric field. */
export function unitOf(def: FieldDefinition): string | null {
  switch (def.type) {
    case "area":
      return "m²";
    case "money":
      return "€";
    case "moneyPerSqm":
      return "€/m²";
    case "months":
      return "mois";
    case "number":
      return def.unit ?? (def.input === "coordinates" ? "°" : null);
    default:
      return null;
  }
}

/** Props of {@link FieldInput}. */
export interface FieldInputProps {
  def: FieldDefinition;
  /** `id` of the control (the `<label htmlFor>` points to it). */
  id: string;
  value: FormValue;
  onChange(value: FormValue): void;
  /** Error message (the control is `aria-invalid` and described by it). */
  error?: string;
  /** Ids of the help / error texts. */
  describedBy?: string;
}

/**
 * Input of one registry field, chosen by its type: text, text area with a
 * character counter, French number with its unit, date, date and precision,
 * three-state boolean, list, department list with search, coordinates.
 */
export function FieldInput({ def, id, value, onChange, error, describedBy }: FieldInputProps) {
  const common = { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy || undefined } as const;
  const text = typeof value === "string" ? value : "";

  if (def.type === "dateWithPrecision") {
    const v = typeof value === "object" ? value : { date: "", precision: "day" };
    return (
      <div className="flex gap-2">
        <input {...common} type="date" value={v.date} onChange={(e) => onChange({ ...v, date: e.target.value })} className={INPUT_CLASS} />
        <select aria-label={`Précision : ${def.labelFr}`} value={v.precision} onChange={(e) => onChange({ ...v, precision: e.target.value })} className={cn(INPUT_CLASS, "w-28")}>
          <option value="day">Jour</option>
          <option value="month">Mois</option>
          <option value="year">Année</option>
        </select>
      </div>
    );
  }

  if (def.type === "boolean") {
    return (
      <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy || undefined} className="flex flex-wrap gap-4 py-1 text-sm" id={id}>
        {[
          ["true", "Oui"],
          ["false", "Non"],
          ["", "Non renseigné"],
        ].map(([v, label]) => (
          <label key={v} className="flex items-center gap-1.5">
            <input type="radio" name={id} value={v} checked={text === v} onChange={() => onChange(v!)} className="accent-[var(--color-accent)]" />
            {label}
          </label>
        ))}
      </div>
    );
  }

  if (def.type === "date") return <input {...common} type="date" value={text} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} />;

  if (def.type === "longtext") {
    const max = def.constraints?.maxLength;
    return (
      <div>
        <textarea {...common} rows={4} value={text} onChange={(e) => onChange(e.target.value)} className={cn(INPUT_CLASS, "resize-y")} />
        <p className="numeric mt-1 text-right text-xs text-text-muted" aria-live="polite">
          {[...text].length}
          {typeof max === "number" ? ` / ${max}` : ""} caractères
        </p>
      </div>
    );
  }

  if ((def.type === "enum" && def.options) || def.input === "select" || def.input === "region") {
    const values = def.input === "region" ? REGIONS : (def.constraints?.values ?? []);
    return (
      <select {...common} value={text} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="">Non renseigné</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {def.options?.[v] ?? v}
          </option>
        ))}
      </select>
    );
  }

  if (def.input === "department") {
    return (
      <>
        <input {...common} type="text" list={`${id}-list`} autoComplete="off" value={text} onChange={(e) => onChange(e.target.value)} placeholder="Numéro ou nom" className={INPUT_CLASS} />
        <datalist id={`${id}-list`}>
          {DEPARTMENTS.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code} — {d.name}
            </option>
          ))}
        </datalist>
      </>
    );
  }

  const unit = unitOf(def);
  const numeric = ["area", "money", "moneyPerSqm", "number", "integer", "months"].includes(def.type);
  const input = (
    <input
      {...common}
      type={def.type === "url" ? "url" : "text"}
      inputMode={def.type === "integer" ? "numeric" : numeric ? "decimal" : undefined}
      value={text}
      onChange={(e) => onChange(e.target.value)}
      className={cn(INPUT_CLASS, numeric && "numeric", unit && "pr-12")}
      maxLength={typeof def.constraints?.maxLength === "number" ? def.constraints.maxLength + 50 : undefined}
    />
  );
  if (!unit) return input;
  return (
    <div className="relative">
      {input}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-text-muted">
        {unit}
      </span>
    </div>
  );
}
