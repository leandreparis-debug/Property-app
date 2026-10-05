"use client";

import { KeyRound, LogOut, MoreHorizontal, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { INPUT_CLASS } from "@/components/ui/input-class";
import { useToast } from "@/components/editing/feedback";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserRole } from "@/domain/enums";
import { changeUserRoleAction, resetUserPasswordAction, revokeUserSessionsAction, setUserActiveAction } from "@/server/users/actions";
import { TemporaryPasswordDialog } from "./TemporaryPasswordDialog";

/** Props of {@link UserActions}. */
export interface UserActionsProps {
  user: { id: string; email: string; name: string | null; role: string; isActive: boolean };
  /** The row is the signed-in administrator (role change and deactivation hidden; the server refuses them anyway). */
  self: boolean;
}

type Pending = "role" | "toggle" | "reset" | "revoke" | null;

const sessionsText = (n: number) => (n === 0 ? "aucune session ouverte" : `${n} session${n > 1 ? "s" : ""} fermée${n > 1 ? "s" : ""}`);

/** Actions of an account: role, deactivation / reactivation, temporary password, session revocation. */
export function UserActions({ user, self }: UserActionsProps) {
  const id = useId().replace(/:/g, "");
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState<string | null>(null);
  const who = user.name || user.email;
  const close = (open: boolean) => !open && setPending(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions sur le compte ${user.email}`} data-slot="user-actions">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!self && (
            <DropdownMenuItem onSelect={() => setPending("role")}>
              <ShieldCheck aria-hidden="true" />
              Changer le rôle…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setPending("reset")}>
            <KeyRound aria-hidden="true" />
            Réinitialiser le mot de passe
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPending("revoke")}>
            <LogOut aria-hidden="true" />
            Révoquer les sessions
          </DropdownMenuItem>
          {!self && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPending("toggle")}>
                {user.isActive ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
                {user.isActive ? "Désactiver le compte" : "Réactiver le compte"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={pending === "role"}
        onOpenChange={close}
        title={`Changer le rôle de ${who}`}
        description="Ses sessions ouvertes seront fermées : le nouveau rôle s'applique à sa prochaine connexion."
        confirmLabel="Changer le rôle"
        onConfirm={async () => {
          const result = await changeUserRoleAction({ userId: user.id, role });
          if (!result.ok) return result.message;
          toast("Rôle modifié", `${who} : ${UserRole.is(role) ? UserRole.label(role) : role} — ${sessionsText(result.sessionsRevoked)}`);
          router.refresh();
          return null;
        }}
      >
        <label htmlFor={`${id}-role`} className="text-xs font-medium text-text-muted">
          Nouveau rôle
        </label>
        <select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value)} className={INPUT_CLASS}>
          {UserRole.values.map((r) => (
            <option key={r} value={r}>
              {UserRole.label(r)}
            </option>
          ))}
        </select>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === "toggle"}
        onOpenChange={close}
        title={user.isActive ? `Désactiver le compte de ${who} ?` : `Réactiver le compte de ${who} ?`}
        description={
          user.isActive
            ? "La personne ne pourra plus se connecter et ses sessions seront fermées. Le compte n'est pas supprimé : son historique reste dans le journal d'audit."
            : "La personne pourra de nouveau se connecter avec son mot de passe."
        }
        confirmLabel={user.isActive ? "Désactiver" : "Réactiver"}
        onConfirm={async () => {
          const result = await setUserActiveAction({ userId: user.id, active: !user.isActive });
          if (!result.ok) return result.message;
          toast(user.isActive ? "Compte désactivé" : "Compte réactivé", who);
          router.refresh();
          return null;
        }}
      />

      <ConfirmDialog
        open={pending === "reset"}
        onOpenChange={close}
        title={`Réinitialiser le mot de passe de ${who} ?`}
        description="Un mot de passe temporaire remplace l'actuel ; il sera affiché une seule fois. Les sessions ouvertes sont fermées et le compte est déverrouillé."
        confirmLabel="Réinitialiser"
        onConfirm={async () => {
          const result = await resetUserPasswordAction({ userId: user.id });
          if (!result.ok) return result.message;
          setPassword(result.temporaryPassword);
          router.refresh();
          return null;
        }}
      />

      <ConfirmDialog
        open={pending === "revoke"}
        onOpenChange={close}
        title={`Révoquer les sessions de ${who} ?`}
        description="Toutes ses sessions ouvertes sont fermées : la personne devra se reconnecter."
        confirmLabel="Révoquer"
        onConfirm={async () => {
          const result = await revokeUserSessionsAction({ userId: user.id });
          if (!result.ok) return result.message;
          toast("Sessions révoquées", `${who} : ${sessionsText(result.sessionsRevoked)}`);
          router.refresh();
          return null;
        }}
      />

      <TemporaryPasswordDialog email={user.email} password={password} onClose={() => setPassword(null)} />
    </>
  );
}
