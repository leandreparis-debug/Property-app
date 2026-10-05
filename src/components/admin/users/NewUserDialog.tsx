"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { INPUT_CLASS } from "@/components/ui/input-class";
import { useToast } from "@/components/editing/feedback";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/domain/enums";
import { createUserAction } from "@/server/users/actions";
import { TemporaryPasswordDialog } from "./TemporaryPasswordDialog";

/** « Nouvel utilisateur »: email, name, role; the server generates the temporary password. */
export function NewUserDialog() {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus aria-hidden="true" />
        Nouvel utilisateur
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        slot="new-user-dialog"
        title="Nouvel utilisateur"
        description="Un mot de passe temporaire est généré et affiché une seule fois ; il devra être changé à la première connexion."
        confirmLabel="Créer le compte"
        onConfirm={async () => {
          const result = await createUserAction({ email, name, role });
          if (!result.ok) return result.message;
          setCreated({ email: result.email, password: result.temporaryPassword });
          setEmail("");
          setName("");
          setRole("viewer");
          toast("Compte créé", result.email);
          router.refresh();
          return null;
        }}
      >
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-email`} className="text-xs font-medium text-text-muted">
              Adresse email
            </label>
            <input id={`${id}-email`} type="email" required maxLength={254} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-name`} className="text-xs font-medium text-text-muted">
              Nom
            </label>
            <input id={`${id}-name`} maxLength={150} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-role`} className="text-xs font-medium text-text-muted">
              Rôle
            </label>
            <select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value)} className={INPUT_CLASS}>
              {UserRole.values.map((r) => (
                <option key={r} value={r}>
                  {UserRole.label(r)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ConfirmDialog>
      <TemporaryPasswordDialog email={created?.email ?? ""} password={created?.password ?? null} onClose={() => setCreated(null)} />
    </>
  );
}
