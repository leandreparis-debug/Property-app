import { Download, FileText, Globe, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { BreakdownBar, LeaseTimeline, TrendChart } from "@/components/charts";
import { EmptyState } from "@/components/empty/EmptyState";
import { StatusDot } from "@/components/status/StatusDot";
import { missingKeyFields, type ComplianceSite } from "@/domain/compliance";
import { BuildingWorkKind, DocumentCategory } from "@/domain/enums";
import { detectReference, getField, isFilledValue, REFERENCE_KIND_LABELS, sectionTitle, type FieldDefinition, type FieldEntity, type FieldId } from "@/domain/fields";
import { metricsByDomain, type MetricCode, type MetricDomain } from "@/domain/metrics";
import { leaseMilestones } from "@/domain/site-sheet/lease-timeline";
import { surfaceBreakdown } from "@/domain/site-sheet/surfaces";
import { decennialEstimate } from "@/domain/site-sheet/works";
import type { PublicDataItem } from "@/domain/site-sheet/public-data";
import { EMPTY_VALUE, formatCurrency, formatDate, formatDateWithPrecision, formatNumber, formatPercent, formatSurface } from "@/lib/format";
import { STATUS_META } from "@/lib/status";
import type { SiteDetail } from "@/server/sites/detail";
import { EmptyValue, FieldList, FieldValue, SheetSection, sectionItems, type FieldItem } from "./FieldList";
import { compactCurrency, compactNumber, formatMetricPerSqm, formatMetricValue } from "./metric-format";
import { MetricTable } from "./MetricTable";
import type { ProvenanceHint } from "./values";

/** What every panel needs. */
export interface SheetContext {
  detail: SiteDetail;
  today: Date;
  /** `finance:read`: lease financial terms, Financial tab, rent and occupancy cost. */
  canFinance: boolean;
  /** Provenance of a field of a record. */
  hint: (entity: FieldEntity, entityId: string | null | undefined, field: string) => ProvenanceHint | null;
  /** Provenance of a yearly metric value. */
  metricHint: (code: string, year: number) => ProvenanceHint | null;
}

/** Record of each registry entity. */
function recordOf(ctx: SheetContext, entity: FieldEntity): (Record<string, unknown> & { id: string }) | null {
  const d = ctx.detail;
  const map: Record<FieldEntity, unknown> = {
    Site: d.site,
    Lease: d.lease,
    ServiceContract: d.serviceContract,
    SiteTechnical: d.technical,
    SiteIcpe: d.icpe,
    SiteEnergyProfile: d.energyProfile,
  };
  return (map[entity] as (Record<string, unknown> & { id: string }) | null) ?? null;
}

function items(ctx: SheetContext, entity: FieldEntity, section: Parameters<typeof sectionItems>[0], keep?: (def: FieldDefinition) => boolean): FieldItem[] {
  const record = recordOf(ctx, entity);
  const all = sectionItems(section, record, (def) => ctx.hint(def.entity, record?.id, def.key));
  return keep ? all.filter((i) => keep(i.def)) : all;
}

function itemOf(ctx: SheetContext, id: FieldId): FieldItem {
  const def = getField(id);
  const record = recordOf(ctx, def.entity);
  const value = record?.[def.key];
  return { def, value, hint: isFilledValue(value) ? ctx.hint(def.entity, record?.id, def.key) : null };
}

/** « Accès restreint » (no `finance:read`). */
export function RestrictedFinance({ compact = false }: { compact?: boolean }) {
  return (
    <EmptyState
      icon={Lock}
      headingLevel="h3"
      title="Accès restreint"
      description="Les données financières ne sont pas accessibles avec votre rôle."
      className={compact ? "py-4" : "py-10"}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────

function Kpi({ label, value, detail, slot }: { label: string; value: ReactNode; detail?: ReactNode; slot: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4 print:border-neutral-300" data-slot="kpi" data-kpi={slot}>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="numeric mt-1 text-xl font-semibold tracking-tight">{value}</dd>
      {detail && <dd className="mt-1 text-xs text-text-muted">{detail}</dd>}
    </div>
  );
}

function lastKnown(series: SiteDetail["metrics"][MetricCode]): { year: number; value: number; perSqm: number | null } | null {
  const known = (series ?? []).filter((p) => p.value !== null);
  const last = known.at(-1);
  return last ? { year: last.year, value: last.value!, perSqm: last.perSqm } : null;
}

/** Energy (electricity + gas) per m² of the last year with a value. */
function energyPerSqm(detail: SiteDetail): { year: number; value: number } | null {
  const years = new Map<number, number>();
  for (const code of ["ELECTRICITY", "GAS"] as const) {
    for (const p of detail.metrics[code] ?? []) if (p.perSqm !== null) years.set(p.year, (years.get(p.year) ?? 0) + p.perSqm);
  }
  const year = Math.max(...years.keys());
  return Number.isFinite(year) ? { year, value: years.get(year)! } : null;
}

/** Missing weighted fields, grouped by section, most weighted first. */
function MissingFields({ detail }: { detail: SiteDetail }) {
  const s = detail.site;
  const site: ComplianceSite = {
    ...s,
    hasCoordinates: s.latitude !== null && s.longitude !== null,
    lease: detail.lease,
    technical: detail.technical,
    icpe: { holder: detail.icpe?.holder ?? null, headingsCount: detail.icpeHeadings.length },
  };
  const missing = missingKeyFields(site);
  if (missing.length === 0) return <p className="text-sm text-text-muted">Tous les champs pondérés sont renseignés.</p>;
  const groups = new Map<string, typeof missing>();
  for (const field of missing) {
    const section = getField(field.fields[0]).section;
    groups.set(section, [...(groups.get(section) ?? []), field]);
  }
  return (
    <div className="space-y-4" data-slot="missing-fields">
      {[...groups].map(([section, fields]) => (
        <div key={section}>
          <h4 className="mb-1.5 text-xs font-medium tracking-wide text-text-muted uppercase">{sectionTitle(section as never)}</h4>
          <ul className="space-y-1 text-sm">
            {fields.map((f) => {
              const source = [...new Set(f.fields.map((id) => getField(id).sourceColumn).filter(Boolean))];
              return (
                <li key={f.id} data-missing={f.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span>{f.labelFr}</span>
                  <span className="numeric text-xs text-text-muted">poids {f.weight}</span>
                  {source.length > 0 && <span className="font-mono text-[11px] text-text-muted">Tableur : {source.join(", ")}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Detailed compliance reasons. */
export function ReasonList({ detail }: { detail: SiteDetail }) {
  const { reasons } = detail.evaluation;
  if (reasons.length === 0) return <p className="text-sm text-text-muted">Aucune règle déclenchée.</p>;
  return (
    <ul className="space-y-2" data-slot="reasons">
      {reasons.map((r) => {
        const status = r.severity === "unknown" ? "unknown" : r.severity;
        return (
          <li key={r.ruleId} className="flex items-start gap-2 text-sm" data-rule={r.ruleId}>
            <StatusDot status={status} size="sm" className="mt-1.5" />
            <span>
              <span className="font-medium">{r.labelFr}</span>
              <span className="sr-only"> ({STATUS_META[status].label})</span>
              {r.detailFr && <span className="block text-text-muted">{r.detailFr}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function OverviewPanel(ctx: SheetContext) {
  const { detail, today, canFinance } = ctx;
  const rent = lastKnown(detail.metrics.RENT);
  const occupancy = detail.occupancyCost.at(-1);
  const energy = energyPerSqm(detail);
  const milestones = leaseMilestones(detail.lease, today, detail.evaluation.reasons);
  const organization = items(ctx, "Site", "organization", (d) => d.key !== "operatingMode" && d.key !== "logisticsOperator");
  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi slot="area" label="Surface de référence" value={formatSurface(detail.referenceArea)} detail={detail.technical?.surveyedTotalArea ? "relevé de géomètre" : detail.referenceArea !== null ? "surface d'entrepôt totale" : "non renseignée"} />
        {canFinance ? (
          <>
            <Kpi slot="rent" label={rent ? `Loyer ${rent.year}` : "Loyer"} value={rent ? formatCurrency(rent.value) : EMPTY_VALUE} detail={rent?.perSqm != null ? formatMetricPerSqm("€", rent.perSqm) : undefined} />
            <Kpi
              slot="occupancy"
              label={occupancy ? `Coût d'occupation ${occupancy.year} au m²` : "Coût d'occupation au m²"}
              value={occupancy?.perSqm != null ? formatMetricPerSqm("€", occupancy.perSqm) : EMPTY_VALUE}
              detail={occupancy?.partial ? "partiel" : undefined}
            />
          </>
        ) : (
          <div className="rounded-lg border border-border bg-surface-1 p-4 sm:col-span-2" data-kpi="restricted">
            <dt className="text-xs text-text-muted">Loyer et coût d&apos;occupation</dt>
            <dd className="mt-1 flex items-center gap-2 text-sm text-text-muted">
              <Lock className="size-4" aria-hidden="true" />
              Accès restreint
            </dd>
          </div>
        )}
        <Kpi slot="energy" label={energy ? `Énergie ${energy.year} au m²` : "Énergie au m²"} value={energy ? formatMetricPerSqm("kWh", energy.value) : EMPTY_VALUE} detail="électricité et gaz" />
      </dl>

      <SheetSection title="Frise du bail" id="overview-timeline">
        <LeaseTimeline milestones={milestones} today={today} status={detail.evaluation.status} />
      </SheetSection>

      <div className="grid gap-5 lg:grid-cols-2">
        <SheetSection title="Raisons du statut" id="overview-reasons">
          <ReasonList detail={detail} />
        </SheetSection>
        <SheetSection title="Champs manquants" id="overview-missing">
          <MissingFields detail={detail} />
        </SheetSection>
      </div>

      <SheetSection title={sectionTitle("identity")} id="overview-identity">
        <FieldList items={items(ctx, "Site", "identity")} />
      </SheetSection>
      <div className="grid gap-5 lg:grid-cols-2">
        <SheetSection title="Organisation" id="overview-organization">
          <FieldList items={organization} columns={1} />
        </SheetSection>
        <SheetSection title={sectionTitle("location")} id="overview-location">
          <FieldList items={items(ctx, "Site", "location")} columns={1} />
        </SheetSection>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lease
// ─────────────────────────────────────────────────────────────────────────────

export function LeasePanel(ctx: SheetContext) {
  const { detail, today, canFinance } = ctx;
  return (
    <div className="space-y-5">
      <SheetSection title="Frise du bail" id="lease-timeline">
        <LeaseTimeline milestones={leaseMilestones(detail.lease, today, detail.evaluation.reasons)} today={today} status={detail.evaluation.status} size="large" />
      </SheetSection>
      <SheetSection title={sectionTitle("lease")} id="lease-fields">
        {detail.lease ? <FieldList items={items(ctx, "Lease", "lease")} /> : <p className="text-sm text-text-muted">Aucun bail enregistré pour ce site.</p>}
      </SheetSection>
      <SheetSection title={sectionTitle("lease_financial")} id="lease-financial">
        {canFinance ? <FieldList items={items(ctx, "Lease", "lease_financial")} /> : <RestrictedFinance compact />}
      </SheetSection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Operations
// ─────────────────────────────────────────────────────────────────────────────

function metricRows(detail: SiteDetail, domain: MetricDomain) {
  return metricsByDomain(domain).map((metric) => ({ metric, series: detail.metrics[metric.code as MetricCode] ?? [] }));
}

function yearsOf(detail: SiteDetail, domain: MetricDomain, extra: readonly number[] = []): number[] {
  const years = new Set<number>(extra);
  for (const m of metricsByDomain(domain)) for (const p of detail.metrics[m.code as MetricCode] ?? []) years.add(p.year);
  return [...years].sort((a, b) => a - b);
}

function MetricBlock({ ctx, domain, caption, occupancy }: { ctx: SheetContext; domain: MetricDomain; caption: string; occupancy?: boolean }) {
  const years = yearsOf(ctx.detail, domain, occupancy ? ctx.detail.occupancyCost.map((o) => o.year) : []);
  if (years.length === 0) return <p className="text-sm text-text-muted">Aucun indicateur annuel renseigné.</p>;
  return <MetricTable caption={caption} rows={metricRows(ctx.detail, domain)} years={years} hintOf={ctx.metricHint} occupancy={occupancy ? ctx.detail.occupancyCost : undefined} />;
}

export function OperationsPanel(ctx: SheetContext) {
  const operator = items(ctx, "Site", "organization", (d) => d.key === "operatingMode" || d.key === "logisticsOperator");
  return (
    <div className="space-y-5">
      <SheetSection title="Exploitation" id="operations-operator">
        <FieldList items={operator} />
      </SheetSection>
      <SheetSection title={sectionTitle("service_contract")} id="operations-contract">
        {ctx.detail.serviceContract ? <FieldList items={items(ctx, "ServiceContract", "service_contract")} /> : <p className="text-sm text-text-muted">Aucun contrat de prestation enregistré.</p>}
      </SheetSection>
      <SheetSection title="Activité par année" id="operations-activity">
        <MetricBlock ctx={ctx} domain="ACTIVITY" caption="Effectif, chiffre d'affaires marchandise et colis par année" />
      </SheetSection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial
// ─────────────────────────────────────────────────────────────────────────────

export function FinancePanel(ctx: SheetContext) {
  if (!ctx.canFinance) return <RestrictedFinance />;
  const { detail } = ctx;
  const rent = (detail.metrics.RENT ?? []).map((p) => ({ year: p.year, value: p.value }));
  const occupancy = detail.occupancyCost.map((o) => ({ year: o.year, value: o.total }));
  return (
    <div className="space-y-5">
      <SheetSection title="Indicateurs financiers par année" id="finance-table">
        <MetricBlock ctx={ctx} domain="FINANCIAL" caption="Indicateurs financiers par année : valeur, valeur au m² et évolution sur un an" occupancy />
        {detail.referenceArea === null && <p className="mt-2 text-xs text-text-muted">Surface de référence inconnue : valeurs au m² non calculées.</p>}
      </SheetSection>
      <TrendChart
        title="Loyer et coût d'occupation"
        series={[
          { id: "rent", label: "Loyer", tone: "accent", points: rent },
          { id: "occupancy", label: "Coût d'occupation", tone: "neutral", points: occupancy },
        ]}
        format={(v) => formatCurrency(v)}
        axisFormat={compactCurrency}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Energy
// ─────────────────────────────────────────────────────────────────────────────

export function EnergyPanel(ctx: SheetContext) {
  const { detail } = ctx;
  const perSqm = (code: MetricCode) => (detail.metrics[code] ?? []).map((p) => ({ year: p.year, value: p.perSqm }));
  const water = (detail.metrics.WATER ?? []).map((p) => ({ year: p.year, value: p.value }));
  const kwh = (v: number) => formatMetricPerSqm("kWh", v);
  return (
    <div className="space-y-5">
      <SheetSection title={sectionTitle("energy")} id="energy-profile">
        <FieldList items={items(ctx, "SiteEnergyProfile", "energy")} />
      </SheetSection>
      <SheetSection title="Consommations par année" id="energy-table">
        <MetricBlock ctx={ctx} domain="ENERGY" caption="Consommations par année : valeur, valeur au m² et évolution sur un an" />
      </SheetSection>
      <div className="grid gap-5 xl:grid-cols-2">
        <TrendChart
          title="Électricité et gaz au m²"
          series={[
            { id: "electricity", label: "Électricité", tone: "accent", points: perSqm("ELECTRICITY") },
            { id: "gas", label: "Gaz", tone: "neutral", points: perSqm("GAS") },
          ]}
          format={kwh}
          axisFormat={(v) => formatNumber(v, { decimals: v % 1 === 0 ? 0 : 1 })}
        />
        <TrendChart title="Consommation d'eau" series={[{ id: "water", label: "Eau", tone: "accent", points: water }]} format={(v) => formatMetricValue("m³", v)} axisFormat={compactNumber} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Technical
// ─────────────────────────────────────────────────────────────────────────────

function WorksHistory({ detail, today }: { detail: SiteDetail; today: Date }) {
  if (detail.buildingWorks.length === 0) return <p className="text-sm text-text-muted">Aucun travaux enregistré.</p>;
  return (
    <ol className="space-y-3" data-slot="works">
      {detail.buildingWorks.map((w) => {
        const decennial = decennialEstimate(w, today);
        const kind = BuildingWorkKind.is(w.kind) ? BuildingWorkKind.label(w.kind) : w.kind;
        return (
          <li key={w.id} className="flex gap-3 border-l-2 border-border pl-3 text-sm" data-kind={w.kind}>
            <div className="min-w-0">
              <p>
                <span className="font-medium">{kind}</span>
                <span className="numeric text-text-muted"> — {w.date ? formatDateWithPrecision(w.date, w.datePrecision as never) : "date inconnue"}</span>
              </p>
              {w.description && <p className="whitespace-pre-line text-text-muted">{w.description}</p>}
              {decennial && (
                <p className="mt-1 text-xs" data-slot="decennial">
                  Fin de garantie décennale estimée : <span className="numeric font-medium">{formatDateWithPrecision(decennial.endDate, decennial.precision)}</span>
                  <span className="text-text-muted"> — estimation à partir de la date de travaux</span>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Footprint({ detail }: { detail: SiteDetail }) {
  const f = detail.footprint;
  if (!f) return <p className="text-sm text-text-muted">Aucune emprise de bâtiment enregistrée.</p>;
  const ratio = detail.referenceArea ? (f.areaM2 / detail.referenceArea) * 100 : null;
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2" data-slot="footprint">
      <div>
        <dt className="text-xs text-text-muted">Surface de l&apos;emprise (calculée)</dt>
        <dd className="numeric mt-0.5 text-sm">{formatSurface(f.areaM2)}</dd>
      </div>
      <div>
        <dt className="text-xs text-text-muted">Rapport à la surface de référence</dt>
        <dd className="numeric mt-0.5 text-sm">{ratio === null ? <EmptyValue /> : `${formatPercent(ratio, { signed: false, decimals: 0 })} de ${formatSurface(detail.referenceArea)}`}</dd>
      </div>
      <div>
        <dt className="text-xs text-text-muted">Hauteur du bâtiment</dt>
        <dd className="numeric mt-0.5 text-sm">
          {formatNumber(f.heightM)} m{f.heightEstimated && <span className="text-text-muted"> — estimée (valeur par défaut)</span>}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-text-muted">Origine de l&apos;emprise</dt>
        <dd className="mt-0.5 text-sm">
          {f.source === "enrichment" ? "Enrichissement (source publique)" : f.source === "manual" ? "Saisie manuelle" : f.source === "import" ? "Import du tableur" : EMPTY_VALUE}
          {f.fetchedAt && <span className="text-text-muted"> — {formatDate(f.fetchedAt)}</span>}
        </dd>
      </div>
    </dl>
  );
}

export function TechnicalPanel(ctx: SheetContext) {
  const { detail, today } = ctx;
  const segments = surfaceBreakdown(detail.technical).map((s) => ({ key: s.key, label: s.labelFr, value: s.area, share: s.share }));
  return (
    <div className="space-y-5">
      <SheetSection title={sectionTitle("technical_surfaces")} id="technical-surfaces">
        <FieldList items={items(ctx, "SiteTechnical", "technical_surfaces")} />
        {segments.length > 0 && (
          <div className="mt-5">
            <h4 className="mb-2 text-xs font-medium text-text-muted">Répartition des surfaces renseignées</h4>
            <BreakdownBar segments={segments} title="Répartition des surfaces" />
          </div>
        )}
      </SheetSection>
      <div className="grid gap-5 lg:grid-cols-2">
        <SheetSection title={sectionTitle("technical_capacities")} id="technical-capacities">
          <FieldList items={items(ctx, "SiteTechnical", "technical_capacities")} columns={1} />
        </SheetSection>
        <SheetSection title={sectionTitle("technical_misc")} id="technical-misc">
          <FieldList items={items(ctx, "SiteTechnical", "technical_misc")} columns={1} />
        </SheetSection>
      </div>
      <SheetSection title="Historique des travaux" id="technical-works">
        <WorksHistory detail={detail} today={today} />
      </SheetSection>
      <SheetSection title="Emprise du bâtiment" id="technical-footprint">
        <Footprint detail={detail} />
      </SheetSection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ICPE and risks
// ─────────────────────────────────────────────────────────────────────────────

/** ICPE regime written out in full. */
export const ICPE_REGIME_LABELS: Readonly<Record<string, string>> = {
  A: "Autorisation",
  E: "Enregistrement",
  D: "Déclaration",
  DC: "Déclaration avec contrôle",
  NC: "Non classé",
  UNKNOWN: "Non précisé",
};

function PublicItem({ item }: { item: PublicDataItem }) {
  switch (item.kind) {
    case "text":
      return <p className="text-sm">{item.text}</p>;
    case "list":
      return item.items.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {item.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <EmptyValue />
      );
    case "table":
      return item.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{item.labelFr}</caption>
            <thead>
              <tr className="text-left text-xs text-text-muted">
                {item.columns.map((c) => (
                  <th key={c} scope="col" className="py-1 pr-4 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {row.map((cell, j) => (
                    <td key={j} className="py-1 pr-4">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyValue />
      );
    case "pairs":
      return (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]" data-slot="public-pairs">
          {item.pairs.map(([k, v], i) => (
            <div key={`${k}-${i}`} className="contents">
              <dt className="font-mono text-xs text-text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      );
  }
}

export function IcpePanel(ctx: SheetContext) {
  const { detail } = ctx;
  return (
    <div className="space-y-5">
      <SheetSection title={sectionTitle("icpe")} id="icpe-fields">
        <FieldList items={items(ctx, "SiteIcpe", "icpe")} />
      </SheetSection>
      <SheetSection title="Rubriques ICPE" id="icpe-headings">
        {detail.icpeHeadings.length === 0 ? (
          <p className="text-sm text-text-muted">Aucune rubrique enregistrée.</p>
        ) : (
          <table className="w-full text-sm" data-slot="icpe-headings">
            <caption className="sr-only">Rubriques ICPE et régime</caption>
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th scope="col" className="py-1 pr-4 font-medium">Rubrique</th>
                <th scope="col" className="py-1 pr-4 font-medium">Régime</th>
                <th scope="col" className="py-1 font-medium">Libellé</th>
              </tr>
            </thead>
            <tbody>
              {detail.icpeHeadings.map((h) => (
                <tr key={h.id} className="border-t border-border">
                  <th scope="row" className="numeric py-1.5 pr-4 text-left font-medium">{h.code}</th>
                  <td className="py-1.5 pr-4">{ICPE_REGIME_LABELS[h.regime ?? "UNKNOWN"] ?? h.regime}</td>
                  <td className="py-1.5 text-text-muted">{h.label ?? <EmptyValue />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SheetSection>
      <section aria-labelledby="icpe-public" className="space-y-3">
        <h3 id="icpe-public" className="text-sm font-semibold">Données publiques</h3>
        {detail.publicData.length === 0 ? (
          <p className="text-sm text-text-muted">Aucune donnée publique enregistrée pour ce site.</p>
        ) : (
          detail.publicData.map((group) => (
            <section key={group.provider} aria-labelledby={`public-${group.provider}`} data-provider={group.provider} className="rounded-lg border border-border bg-surface-1 p-5 print:break-inside-avoid">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h4 id={`public-${group.provider}`} className="flex items-center gap-2 text-sm font-semibold">
                  <Globe className="size-4 text-text-muted" aria-hidden="true" />
                  {group.providerLabelFr}
                </h4>
                <p className="text-xs text-text-muted">
                  Source : {group.providerLabelFr}
                  {group.fetchedAt && <> — {formatDate(group.fetchedAt)}</>} — <span data-slot="public-disclaimer">Donnée publique indicative, non vérifiée</span>
                </p>
              </div>
              <div className="space-y-4">
                {group.items.map((item) => (
                  <div key={item.key} data-key={item.key}>
                    <h5 className="mb-1 text-xs text-text-muted">{item.labelFr}</h5>
                    <PublicItem item={item} />
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

/** Spreadsheet references shown in the Documents tab. */
const REFERENCE_FIELDS: readonly FieldId[] = ["Lease.documentReference", "SiteTechnical.plansReference", "Site.adminFileReference", "SiteIcpe.documentsReference"];

function formatSize(bytes: number | null): string {
  if (bytes === null) return EMPTY_VALUE;
  if (bytes < 1024) return `${formatNumber(bytes)} o`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, { decimals: 0 })} Ko`;
  return `${formatNumber(bytes / 1024 / 1024, { decimals: 1 })} Mo`;
}

function typeOf(mime: string | null): string {
  if (!mime) return "Fichier";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return `Image ${mime.slice(6).toUpperCase()}`;
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "Tableur";
  if (mime.includes("word")) return "Document texte";
  return mime;
}

export function DocumentsPanel(ctx: SheetContext) {
  const { detail } = ctx;
  const byCategory = new Map<string, SiteDetail["documents"]>();
  for (const d of detail.documents) byCategory.set(d.category, [...(byCategory.get(d.category) ?? []), d]);
  const order = DocumentCategory.values as readonly string[];
  const categories = [...byCategory.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return (
    <div className="space-y-5">
      {detail.documents.length === 0 ? (
        <EmptyState icon={FileText} headingLevel="h3" title="Aucun document enregistré" description="L'ajout de documents (bail, plans, dossiers ICPE…) sera disponible dans une prochaine version." className="py-8" />
      ) : (
        categories.map((category) => (
          <SheetSection key={category} title={DocumentCategory.is(category) ? DocumentCategory.label(category) : category} id={`documents-${category}`}>
            <ul className="divide-y divide-border" data-slot="documents" data-category={category}>
              {byCategory.get(category)!.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                  <span className="min-w-0 flex-1 font-medium">{d.title ?? "Sans titre"}</span>
                  <span className="text-text-muted">{typeOf(d.mimeType)}</span>
                  <span className="numeric text-text-muted">{formatSize(d.sizeBytes)}</span>
                  <span className="numeric text-text-muted">{formatDate(d.createdAt)}</span>
                  <span className="text-text-muted">{d.uploadedByName ?? EMPTY_VALUE}</span>
                  <a href={`/api/documents/${encodeURIComponent(d.id)}`} download className="inline-flex items-center gap-1 text-accent hover:underline print:hidden">
                    <Download className="size-4" aria-hidden="true" />
                    Télécharger<span className="sr-only"> {d.title ?? "le document"}</span>
                  </a>
                </li>
              ))}
            </ul>
          </SheetSection>
        ))
      )}
      <SheetSection title="Références du tableur" id="documents-references">
        <dl className="grid gap-y-3" data-slot="references">
          {REFERENCE_FIELDS.map((id) => {
            const item = itemOf(ctx, id);
            const ref = typeof item.value === "string" ? detectReference(item.value) : null;
            return (
              <div key={id} data-field={id} className="grid gap-1 sm:grid-cols-[16rem_1fr]">
                <dt className="text-xs text-text-muted">
                  {item.def.labelFr}
                  {ref && <span className="block text-[11px] text-text-muted">Type détecté : {REFERENCE_KIND_LABELS[ref.kind]}</span>}
                </dt>
                <dd className="text-sm">
                  <FieldValue def={item.def} value={item.value} hint={item.hint} />
                </dd>
              </div>
            );
          })}
        </dl>
      </SheetSection>
    </div>
  );
}
