"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type PasswordFormState } from "./actions";

const FIELDS = [
  { name: "current", label: "Mot de passe actuel", autoComplete: "current-password", hint: null },
  { name: "next", label: "Nouveau mot de passe", autoComplete: "new-password", hint: "12 caractères au moins, sans votre identifiant ; une phrase de passe convient très bien." },
  { name: "confirm", label: "Confirmer le nouveau mot de passe", autoComplete: "new-password", hint: null },
] as const;

/** Current password, new password and confirmation; the server checks the policy. */
export function PasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordFormState, FormData>(changePasswordAction, { error: null });
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {FIELDS.map((f, i) => (
        <div key={f.name} className="grid gap-2">
          <Label htmlFor={`pw-${f.name}`}>{f.label}</Label>
          <Input
            id={`pw-${f.name}`}
            name={f.name}
            type="password"
            autoComplete={f.autoComplete}
            autoFocus={i === 0}
            required
            maxLength={1024}
            aria-invalid={state.field === f.name ? true : undefined}
            aria-describedby={[f.hint ? `pw-${f.name}-hint` : "", state.field === f.name ? "pw-error" : ""].filter(Boolean).join(" ") || undefined}
          />
          {f.hint && (
            <p id={`pw-${f.name}-hint`} className="text-xs text-text-muted">
              {f.hint}
            </p>
          )}
        </div>
      ))}
      <div aria-live="polite" className="min-h-5">
        {state.error && (
          <p id="pw-error" role="alert" className="text-sm font-medium text-text">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
        {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        {pending ? "Enregistrement…" : "Changer le mot de passe"}
      </Button>
    </form>
  );
}
