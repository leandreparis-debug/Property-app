import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminCard";
import { AuditTable } from "@/components/admin/AuditTable";
import { Button } from "@/components/ui/button";
import { INPUT_CLASS } from "@/components/ui/input-class";
import { auditQuery, decodeCursor, encodeCursor, ENTITY_LABELS, hasAuditFilters, parseAuditFilters } from "@/domain/audit/view";
import { AuditAction, AuditSource } from "@/domain/enums";
import { FIELD_REGISTRY } from "@/domain/fields";
import { formatNumber } from "@/lib/format";
import { auditActorOptions, countAudit, listAuditPage } from "@/server/audit/journal";
import { requirePagePermission } from "@/server/auth/current-user";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Journal d'audit" };

type Search = Record<string, string | string[] | undefined>;

const label = "text-xs font-medium text-text-muted";

/**
 * Audit journal (`audit:read`), read-only: keyset pagination on (date, id)
 * descending, 50 lines per page; combinable filters kept in the URL; values
 * of financial fields masked without `finance:read`.
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePagePermission("audit:read");
  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const cursorParam = Array.isArray(params.cursor) ? params.cursor[0] : params.cursor;
  const cursor = decodeCursor(cursorParam);
  const finance = can(user.role, "finance:read");
  const [page, total, actors, site] = await Promise.all([
    listAuditPage(filters, { finance, cursor }),
    countAudit(filters),
    auditActorOptions(),
    filters.siteId ? db.site.findUnique({ where: { id: filters.siteId }, select: { code: true, name: true } }) : null,
  ]);
  const filtered = hasAuditFilters(filters);
  const fieldOptions = [...new Map(FIELD_REGISTRY.map((f) => [f.key, f.labelFr])).entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      <AdminPageHeader title="Journal d'audit" description="Toutes les modifications : qui, quand, quoi, valeur avant et après. Lecture seule." />

      <form method="get" role="search" aria-label="Filtrer le journal" className="mb-4 grid grid-cols-4 gap-3 rounded-lg border border-border bg-surface-1 p-4 xl:grid-cols-6">
        <div className="grid gap-1">
          <label htmlFor="audit-from" className={label}>Du</label>
          <input id="audit-from" name="from" type="date" defaultValue={filters.from ?? ""} className={INPUT_CLASS} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="audit-to" className={label}>Au</label>
          <input id="audit-to" name="to" type="date" defaultValue={filters.to ?? ""} className={INPUT_CLASS} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="audit-actor" className={label}>Acteur</label>
          <select id="audit-actor" name="actor" defaultValue={filters.actor ?? ""} className={INPUT_CLASS}>
            <option value="">Tous</option>
            <option value="system">Système (sans acteur)</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="audit-source" className={label}>Source</label>
          <select id="audit-source" name="source" defaultValue={filters.source ?? ""} className={INPUT_CLASS}>
            <option value="">Toutes</option>
            {AuditSource.values.map((s) => (
              <option key={s} value={s}>
                {AuditSource.label(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="audit-action" className={label}>Action</label>
          <select id="audit-action" name="action" defaultValue={filters.action ?? ""} className={INPUT_CLASS}>
            <option value="">Toutes</option>
            {AuditAction.values.map((a) => (
              <option key={a} value={a}>
                {AuditAction.label(a)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="audit-entity" className={label}>Type d&apos;entité</label>
          <select id="audit-entity" name="entity" defaultValue={filters.entity ?? ""} className={INPUT_CLASS}>
            <option value="">Tous</option>
            {Object.entries(ENTITY_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="audit-site" className={label}>Site (code ou nom)</label>
          <input id="audit-site" name="site" defaultValue={filters.site ?? ""} maxLength={100} className={INPUT_CLASS} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="audit-field" className={label}>Champ</label>
          <input id="audit-field" name="field" list="audit-fields" defaultValue={filters.field ?? ""} maxLength={100} className={INPUT_CLASS} />
          <datalist id="audit-fields">
            {fieldOptions.map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </datalist>
        </div>
        <div className="grid gap-1">
          <label htmlFor="audit-batch" className={label}>Lot</label>
          <input id="audit-batch" name="batch" defaultValue={filters.batch ?? ""} maxLength={30} className={`${INPUT_CLASS} font-mono`} />
        </div>
        {filters.siteId && <input type="hidden" name="siteId" value={filters.siteId} />}
        <div className="col-span-full flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary">
            <Search aria-hidden="true" />
            Filtrer
          </Button>
          {filtered && (
            <Link href="/admin/audit" className="text-sm text-text-muted hover:text-text">
              Effacer les filtres
            </Link>
          )}
          {filters.siteId && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-strong" data-slot="audit-site-chip">
              Site : {site ? `${site.code} — ${site.name}` : filters.siteId}
              <Link href={`/admin/audit?${auditQuery({ ...filters, siteId: undefined })}`} aria-label="Retirer le filtre de site" className="rounded-full hover:text-text">
                <X className="size-3.5" aria-hidden="true" />
              </Link>
            </span>
          )}
          <span className="numeric ml-auto text-sm text-text-muted" data-slot="audit-count">
            {formatNumber(total)} ligne{total > 1 ? "s" : ""}
          </span>
        </div>
      </form>

      {!finance && <p className="mb-3 text-sm text-text-muted">Les valeurs des champs financiers sont masquées (permission finance:read requise).</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface-1 shadow-panel">
        <AuditTable rows={page.rows} filters={filters} />
      </div>

      <nav aria-label="Pagination du journal" className="mt-4 flex items-center justify-between text-sm">
        {cursor ? (
          <Link href={`/admin/audit?${auditQuery(filters)}`} className="text-accent hover:underline">
            Revenir aux plus récentes
          </Link>
        ) : (
          <span />
        )}
        {page.next && (
          <Link href={`/admin/audit?${auditQuery(filters, { cursor: encodeCursor(page.next) })}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline" rel="next">
            Lignes plus anciennes
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </nav>
    </>
  );
}
