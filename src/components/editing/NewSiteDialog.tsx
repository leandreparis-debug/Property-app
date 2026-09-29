"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NEW_SITE_FIELDS, newSiteSchema } from "@/domain/fields/new-site";
import { fieldErrors } from "@/domain/fields/validation";
import { DEPARTMENTS } from "@/domain/geo";
import { createSiteAction } from "@/server/sites/actions";
import { INPUT_CLASS } from "./FieldInput";
import { useToast } from "./feedback";

const LABELS: Record<(typeof NEW_SITE_FIELDS)[number], string> = {
  code: "Code entrepôt (obligatoire)",
  name: "Nom (obligatoire)",
  addressLine: "Adresse",
  postalCode: "Code postal",
  city: "Ville",
  departmentCode: "Département",
  latitude: "Latitude (facultative)",
  longitude: "Longitude (facultative)",
};

/**
 * « Nouveau site » (`site:write`): code (upper case, `A-Z 0-9 -`, unique),
 * name, address and optional coordinates; validation shared with the server;
 * on success, the sheet of the new site opens.
 */
export function NewSiteDialog() {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (errs: Record<string, string>, message: string) => {
    setErrors(errs);
    setSummary(message);
    const first = NEW_SITE_FIELDS.find((k) => errs[k]);
    if (first) document.getElementById(`${id}-${first}`)?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = newSiteSchema.safeParse(form);
    if (!parsed.success) return fail(fieldErrors(parsed.error), "Corriger les erreurs avant de créer le site.");
    setBusy(true);
    const result = await createSiteAction(form as never);
    setBusy(false);
    if (!result.ok) return fail(result.fieldErrors ?? {}, result.message);
    toast("Site créé", `${result.code} — ${parsed.data.name}`);
    setOpen(false);
    setForm({});
    router.push(`/sites/${result.id}`);
    router.refresh();
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-slot="new-site">
        <Plus aria-hidden="true" />
        Nouveau site
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nouveau site</DialogTitle>
            <DialogDescription>Le code est la clé de l&apos;import du tableur et de l&apos;adresse de la fiche : il ne pourra plus être modifié.</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={(e) => void submit(e)} className="space-y-3" data-slot="new-site-form">
            {summary && (
              <div role="alert" className="rounded-md border border-dashed border-destructive px-3 py-2 text-sm">
                {summary}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {NEW_SITE_FIELDS.map((key) => (
                <div key={key} className={key === "name" || key === "addressLine" ? "sm:col-span-2" : undefined}>
                  <label htmlFor={`${id}-${key}`} className="mb-1 block text-xs font-medium text-text-muted">
                    {LABELS[key]}
                  </label>
                  <input
                    id={`${id}-${key}`}
                    value={form[key] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: key === "code" ? e.target.value.toUpperCase() : e.target.value }))}
                    list={key === "departmentCode" ? `${id}-deps` : undefined}
                    inputMode={key === "latitude" || key === "longitude" ? "decimal" : key === "postalCode" ? "numeric" : undefined}
                    autoComplete="off"
                    aria-invalid={errors[key] ? true : undefined}
                    aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
                    className={INPUT_CLASS}
                  />
                  {errors[key] && (
                    <p id={`${id}-${key}-error`} className="mt-1 text-xs font-medium">
                      {errors[key]}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <datalist id={`${id}-deps`}>
              {DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.name}
                </option>
              ))}
            </datalist>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={busy}>
                Créer le site
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
