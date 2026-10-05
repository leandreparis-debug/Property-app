"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { StatusDot } from "@/components/status/StatusDot";
import { DEADLINE_LABELS, type DeadlineBucket, type SiteIndexEntry } from "@/domain/site-index";
import { COMPLIANCE_STATUSES, STATUS_META, type ComplianceStatus } from "@/lib/status";
import { useSiteIndex } from "@/components/sites/SiteIndexProvider";

/** Lease deadlines shown in « Échéances », most urgent first. */
const URGENT: readonly DeadlineBucket[] = ["overdue", "lt3m", "lt6m"];
/** Completeness below which a sheet is « à compléter ». */
export const INCOMPLETE_BELOW = 60;
/** Lines per card. */
const MAX_LINES = 3;

const deadlineStatus: Record<string, ComplianceStatus> = { overdue: "critical", lt3m: "critical", lt6m: "warning" };

/**
 * The three cards above the map: upcoming lease deadlines, sheets to
 * complete, and the compliance breakdown. Computed locally from the shared
 * site index; every line opens the site on the map.
 */
export function PortfolioBriefs() {
  const { entries } = useSiteIndex();
  const deadlines = useMemo(
    () =>
      entries
        .filter((e) => e.isActive && URGENT.includes(e.leaseDeadlineBucket))
        .sort((a, b) => URGENT.indexOf(a.leaseDeadlineBucket) - URGENT.indexOf(b.leaseDeadlineBucket) || a.name.localeCompare(b.name, "fr")),
    [entries],
  );
  const incomplete = useMemo(() => entries.filter((e) => e.completeness < INCOMPLETE_BELOW).sort((a, b) => a.completeness - b.completeness), [entries]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(COMPLIANCE_STATUSES.map((s) => [s, 0])) as Record<ComplianceStatus, number>;
    for (const e of entries) c[e.status]++;
    return c;
  }, [entries]);

  return (
    <div className="grid gap-4 lg:grid-cols-3" data-slot="portfolio-briefs">
      <Brief title="Échéances" hint="préavis et fins de bail sous 6 mois" link={{ href: "/sites?deadline=overdue,lt3m,lt6m&sort=deadline", label: "Voir tout" }} empty="Aucune échéance proche.">
        {deadlines.slice(0, MAX_LINES).map((e) => (
          <Line key={e.id} site={e} status={deadlineStatus[e.leaseDeadlineBucket] ?? "warning"} aside={DEADLINE_LABELS[e.leaseDeadlineBucket]} />
        ))}
        {deadlines.length > MAX_LINES && <More count={deadlines.length - MAX_LINES} />}
      </Brief>
      <Brief title="À compléter" hint={`fiches remplies à moins de ${INCOMPLETE_BELOW} %`} link={{ href: `/sites?compl=${INCOMPLETE_BELOW}`, label: "Voir tout" }} empty="Toutes les fiches sont bien renseignées.">
        {incomplete.slice(0, MAX_LINES).map((e) => (
          <Line key={e.id} site={e} status="unknown" aside={`${e.completeness} %`} />
        ))}
        {incomplete.length > MAX_LINES && <More count={incomplete.length - MAX_LINES} />}
      </Brief>
      <Brief title="Conformité" hint={`${entries.length} sites`} link={{ href: "/supervision", label: "Supervision" }}>
        {(["critical", "warning", "ok", "unknown"] as const).map((s) => (
          <li key={s}>
            <Link href={`/?status=${s}`} className="flex items-center gap-2.5 rounded-sm text-sm hover:text-accent">
              <StatusDot status={s} size="sm" />
              <span className="flex-1">{STATUS_META[s].label}</span>
              <span className="numeric font-semibold">{counts[s]}</span>
            </Link>
          </li>
        ))}
      </Brief>
    </div>
  );
}

function Brief({ title, hint, link, empty, children }: { title: string; hint: string; link: { href: string; label: string }; empty?: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-surface-1 px-5 py-4 shadow-panel">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">
          {title} <span className="font-normal text-text-muted">· {hint}</span>
        </h2>
        <Link href={link.href} className="shrink-0 text-xs font-semibold text-accent hover:underline">
          {link.label} ↗
        </Link>
      </div>
      {items.length ? <ul className="grid gap-2">{children}</ul> : <p className="text-sm text-text-muted">{empty}</p>}
    </section>
  );
}

function Line({ site, status, aside }: { site: SiteIndexEntry; status: ComplianceStatus; aside: string }) {
  return (
    <li>
      <Link href={`/?site=${encodeURIComponent(site.code)}`} className="flex items-center gap-2.5 rounded-sm text-sm hover:text-accent">
        <StatusDot status={status} size="sm" />
        <span className="min-w-0 flex-1 truncate">{site.name}</span>
        <span className="shrink-0 text-xs text-text-muted">{aside}</span>
      </Link>
    </li>
  );
}

function More({ count }: { count: number }) {
  return <li className="text-xs text-text-muted">et {count} autre{count > 1 ? "s" : ""}…</li>;
}
