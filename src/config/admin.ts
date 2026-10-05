import { Activity, FileClock, FileSpreadsheet, Globe2, Users, type LucideIcon } from "lucide-react";
import { can, type Action } from "@/server/auth/permissions";
import type { UserRole } from "@/domain/enums";

/** A section of the administration space. */
export interface AdminSection {
  href: "/admin/operations" | "/admin/users" | "/admin/audit" | "/admin/imports" | "/admin/enrichment";
  /** French label. */
  label: string;
  /** One-line French description. */
  description: string;
  icon: LucideIcon;
  /** Permission required to see AND open the section (checked on the server). */
  permission: Action;
}

/** Sections of the administration space, in display order. */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { href: "/admin/operations", label: "Exploitation", description: "Tâches planifiées, exports et espace disque.", icon: Activity, permission: "settings:manage" },
  { href: "/admin/users", label: "Utilisateurs", description: "Comptes, rôles et accès.", icon: Users, permission: "user:manage" },
  { href: "/admin/audit", label: "Journal d'audit", description: "Toutes les modifications, qui, quand, quoi.", icon: FileClock, permission: "audit:read" },
  { href: "/admin/imports", label: "Imports", description: "Historique des imports du tableur et verrou.", icon: FileSpreadsheet, permission: "import:run" },
  { href: "/admin/enrichment", label: "Enrichissement", description: "Paquets appliqués et revue des divergences.", icon: Globe2, permission: "enrichment:apply" },
];

/** Every permission that opens at least one administration section. */
export const ADMIN_PERMISSIONS: readonly Action[] = [...new Set(ADMIN_SECTIONS.map((s) => s.permission))];

/**
 * Sections a role may open.
 * @param role - Current user's role.
 */
export function adminSectionsFor(role: UserRole): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => can(role, s.permission));
}
