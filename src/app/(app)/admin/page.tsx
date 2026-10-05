import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminCard";
import { ExportFreshnessNotice } from "@/components/admin/ExportFreshnessNotice";
import { adminSectionsFor } from "@/config/admin";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/auth/permissions";
import { getExportFreshness } from "@/server/ops/overview";

export const metadata: Metadata = { title: "Administration" };

/** Overview of the administration space: one card per section the user may open. */
export default async function AdminPage() {
  const user = await requireUser();
  const sections = adminSectionsFor(user.role);
  const freshness = can(user.role, "settings:manage") ? await getExportFreshness() : null;
  return (
    <>
      <AdminPageHeader title="Administration" description="Exploitation au quotidien : tâches planifiées, comptes, journal d'audit, imports et enrichissement." />
      {freshness?.stale && <ExportFreshnessNotice latest={freshness.latest?.createdAt ?? null} className="mb-6" />}
      <ul className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {sections.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="group flex h-full flex-col gap-2 rounded-lg border border-border bg-surface-1 p-5 shadow-panel transition-colors hover:border-border-strong">
              <Icon className="size-5 text-accent" aria-hidden="true" />
              <span className="text-base font-semibold text-text">{label}</span>
              <span className="text-sm text-text-muted">{description}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-accent">
                Ouvrir <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
