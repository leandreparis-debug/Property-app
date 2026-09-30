import type { Metadata } from "next";
import Link from "next/link";
import { Archive } from "lucide-react";
import { NewSiteDialog } from "@/components/editing/NewSiteDialog";
import { PageContainer } from "@/components/shell/PageContainer";
import { SitesTable } from "@/components/sites/SitesTable";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/auth/permissions";
import { getArchivedSites } from "@/server/sites/index";

export const metadata: Metadata = { title: "Sites" };

/**
 * Dense list of the sites (shared filters, sort in the URL), with « Nouveau
 * site » (`site:write`) and, for administrators, « Afficher les sites
 * archivés » (`?archived=1`).
 */
export default async function SitesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const canArchive = can(user.role, "site:archive");
  const showArchived = canArchive && (await searchParams).archived === "1";
  const archived = showArchived ? await getArchivedSites() : [];
  return (
    <PageContainer className="pt-5 pb-4">
      <h1 className="sr-only">{showArchived ? "Sites archivés" : "Sites"}</h1>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2" data-slot="sites-toolbar">
        {canArchive && (
          <Link href={showArchived ? "/sites" : "/sites?archived=1"} className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm text-text-muted hover:text-text" aria-pressed={showArchived} role="button">
            <Archive className="size-4" aria-hidden="true" />
            {showArchived ? "Revenir aux sites actifs" : "Afficher les sites archivés"}
          </Link>
        )}
        {can(user.role, "site:write") && !showArchived && <NewSiteDialog />}
      </div>
      {showArchived ? (
        <section aria-label="Sites archivés" className="rounded-lg border border-border bg-surface-1 p-4" data-slot="archived-sites">
          {archived.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun site archivé.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Sites archivés, du plus récent au plus ancien</caption>
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th scope="col" className="py-1 pr-4 font-medium">Code</th>
                  <th scope="col" className="py-1 pr-4 font-medium">Nom</th>
                  <th scope="col" className="py-1 pr-4 font-medium">Ville</th>
                  <th scope="col" className="py-1 font-medium">Archivé le</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((s) => (
                  <tr key={s.id} className="border-t border-border" data-code={s.code}>
                    <td className="py-1.5 pr-4 font-mono">{s.code}</td>
                    <td className="py-1.5 pr-4">
                      <Link href={`/sites/${s.id}`} className="text-accent hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-4 text-text-muted">{s.city ?? "—"}</td>
                    <td className="numeric py-1.5 text-text-muted">{formatDate(s.archivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <SitesTable />
      )}
    </PageContainer>
  );
}
