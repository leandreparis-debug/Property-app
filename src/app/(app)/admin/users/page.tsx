import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminCard";
import { UserStatusLabel } from "@/components/admin/UserStatusLabel";
import { NewUserDialog } from "@/components/admin/users/NewUserDialog";
import { UserActions } from "@/components/admin/users/UserActions";
import { INPUT_CLASS } from "@/components/ui/input-class";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/domain/enums";
import { formatDate, formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/current-user";
import { listUsers } from "@/server/users/admin";

export const metadata: Metadata = { title: "Utilisateurs" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Accounts (`user:manage`): list with search and role / status filters (in
 * the URL), creation with a temporary password, role change, deactivation,
 * reactivation, password reset and session revocation. No deletion.
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePagePermission("user:manage");
  const params = await searchParams;
  const q = one(params.q).slice(0, 100);
  const role = UserRole.is(one(params.role)) ? one(params.role) : "";
  const status = one(params.status) === "active" || one(params.status) === "inactive" ? (one(params.status) as "active" | "inactive") : undefined;
  const users = await listUsers({ q, role, status });
  const filtered = Boolean(q || role || status);

  return (
    <>
      <AdminPageHeader title="Utilisateurs" description="Comptes locaux, rôles et accès. Un compte n'est jamais supprimé : il se désactive." actions={<NewUserDialog />} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search" aria-label="Filtrer les comptes">
        <div className="grid gap-1">
          <label htmlFor="users-q" className="text-xs font-medium text-text-muted">
            Nom ou email
          </label>
          <input id="users-q" name="q" defaultValue={q} maxLength={100} className={`${INPUT_CLASS} w-64`} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="users-role" className="text-xs font-medium text-text-muted">
            Rôle
          </label>
          <select id="users-role" name="role" defaultValue={role} className={`${INPUT_CLASS} w-44`}>
            <option value="">Tous</option>
            {UserRole.values.map((r) => (
              <option key={r} value={r}>
                {UserRole.label(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="users-status" className="text-xs font-medium text-text-muted">
            Statut
          </label>
          <select id="users-status" name="status" defaultValue={status ?? ""} className={`${INPUT_CLASS} w-40`}>
            <option value="">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Désactivés</option>
          </select>
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Filtrer
        </Button>
        {filtered && (
          <Link href="/admin/users" className="px-2 py-2 text-sm text-text-muted hover:text-text">
            Effacer les filtres
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-panel">
        <table className="w-full text-sm" data-slot="users-table">
          <caption className="sr-only">
            Comptes ({users.length}){filtered ? ", filtrés" : ""}
          </caption>
          <thead className="bg-surface-2">
            <tr className="text-left text-xs text-text-muted">
              <th scope="col" className="px-4 py-2.5 font-semibold">Nom</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Email</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Rôle</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Statut</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Dernière connexion</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Créé le</th>
              <th scope="col" className="w-14 px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-muted">
                  Aucun compte ne correspond aux filtres.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border align-top" data-email={u.email}>
                <td className="px-4 py-2.5 font-medium">
                  {u.name ?? "—"}
                  {u.id === actor.id && <span className="ml-1.5 text-xs font-normal text-text-muted">(vous)</span>}
                </td>
                <td className="px-4 py-2.5 text-text-muted">{u.email}</td>
                <td className="px-4 py-2.5">{UserRole.is(u.role) ? UserRole.label(u.role) : u.role}</td>
                <td className="px-4 py-2.5">
                  <UserStatusLabel isActive={u.isActive} mustChangePassword={u.mustChangePassword} />
                </td>
                <td className="numeric px-4 py-2.5 whitespace-nowrap text-text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Jamais"}</td>
                <td className="numeric px-4 py-2.5 whitespace-nowrap text-text-muted">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-1.5 text-right">
                  <UserActions user={{ id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive }} self={u.id === actor.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
