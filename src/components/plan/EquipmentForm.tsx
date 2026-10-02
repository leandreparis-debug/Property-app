"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INPUT_CLASS } from "@/components/editing/FieldInput";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_TYPES, equipmentTypeLabel } from "@/domain/equipment/catalog";

/** Values of the form (text inputs). */
export interface EquipmentFormValues {
  type: string;
  label: string;
  reference: string;
  level: string;
  installedAt: string;
  notes: string;
  comment: string;
}

/** Props of {@link EquipmentForm}. */
export interface EquipmentFormProps {
  open: boolean;
  mode: "create" | "edit";
  initial: Omit<EquipmentFormValues, "comment">;
  /** Extra line under the title (position, plan). */
  detail?: string;
  onCancel: () => void;
  /** Returns an error message, or null when saved. */
  onSubmit: (values: EquipmentFormValues) => Promise<string | null>;
}

/**
 * Attributes of an equipment: type, label (proposed automatically, e.g.
 * « RIA 4 »), reference, level, commissioning date, notes, optional reason.
 */
export function EquipmentForm({ open, mode, initial, detail, onCancel, onSubmit }: EquipmentFormProps) {
  const id = useId().replace(/:/g, "");
  const [values, setValues] = useState<EquipmentFormValues>({ ...initial, comment: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setValues({ ...initial, comment: "" });
      setError(null);
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (field: keyof EquipmentFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const submit = async () => {
    if (!values.label.trim()) return setError("Libellé obligatoire.");
    setSaving(true);
    const message = await onSubmit(values);
    setSaving(false);
    setError(message);
  };
  const field = (name: keyof EquipmentFormValues, label: string, props: Record<string, unknown> = {}) => (
    <div>
      <label htmlFor={`${id}-${name}`} className="mb-1 block text-xs font-medium text-text-muted">
        {label}
      </label>
      <input id={`${id}-${name}`} value={values[name]} onChange={set(name)} className={INPUT_CLASS} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent data-slot="equipment-form">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? `Nouvel équipement : ${equipmentTypeLabel(values.type)}` : "Modifier l'équipement"}</DialogTitle>
          {detail && <DialogDescription>{detail}</DialogDescription>}
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "edit" && (
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-type`} className="mb-1 block text-xs font-medium text-text-muted">
                Type
              </label>
              <select id={`${id}-type`} value={values.type} onChange={set("type")} className={INPUT_CLASS}>
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <optgroup key={c.code} label={c.labelFr}>
                    {EQUIPMENT_TYPES.filter((t) => t.category === c.code).map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.labelFr}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
          {field("label", "Libellé", { maxLength: 200, required: true })}
          {field("reference", "Référence", { maxLength: 100 })}
          {field("level", "Niveau", { maxLength: 50, placeholder: "RDC, mezzanine…" })}
          {field("installedAt", "Date de mise en service", { type: "date" })}
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-notes`} className="mb-1 block text-xs font-medium text-text-muted">
              Notes
            </label>
            <textarea id={`${id}-notes`} value={values.notes} onChange={set("notes")} maxLength={4000} rows={3} className={INPUT_CLASS} />
          </div>
          <div className="sm:col-span-2">{field("comment", "Motif (facultatif)", { maxLength: 500 })}</div>
          {error && (
            <p role="alert" className="text-sm font-medium sm:col-span-2">
              {error}
            </p>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {mode === "create" ? "Ajouter l'équipement" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
