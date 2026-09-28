import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Download, Filter, Plus, Search } from "lucide-react";
import { Panel } from "@/components/panel/Panel";
import { PageContainer } from "@/components/shell/PageContainer";
import { StatusBadge } from "@/components/status/StatusBadge";
import { StatusDot } from "@/components/status/StatusDot";
import { StatusLegend } from "@/components/status/StatusLegend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEnv } from "@/lib/env";
import {
  formatCurrency,
  formatDate,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatSurface,
} from "@/lib/format";
import { COMPLIANCE_STATUSES, STATUS_META } from "@/lib/status";

export const metadata: Metadata = { title: "Système de design" };

interface TokenSwatch {
  token: string;
  value: string;
  usage: string;
  /** Literal Tailwind class, so the utility is generated. */
  swatch: string;
}

const PALETTE: { group: string; tokens: TokenSwatch[] }[] = [
  {
    group: "Surfaces",
    tokens: [
      { token: "--color-bg", value: "#07090C", usage: "Fond global, derrière la carte", swatch: "bg-bg" },
      { token: "--color-surface-1", value: "#0D1117", usage: "Panneaux", swatch: "bg-surface-1" },
      { token: "--color-surface-2", value: "#131923", usage: "Survol, champs", swatch: "bg-surface-2" },
      { token: "--color-surface-3", value: "#1A2230", usage: "Éléments actifs", swatch: "bg-surface-3" },
    ],
  },
  {
    group: "Bordures",
    tokens: [
      { token: "--color-border", value: "#232C3B", usage: "Bordures standard", swatch: "bg-border" },
      { token: "--color-border-strong", value: "#33405A", usage: "Séparateurs marqués", swatch: "bg-border-strong" },
    ],
  },
  {
    group: "Texte",
    tokens: [
      { token: "--color-text", value: "#E6EAF2", usage: "Texte principal", swatch: "bg-text" },
      { token: "--color-text-muted", value: "#8B96A8", usage: "Texte secondaire, libellés", swatch: "bg-text-muted" },
      { token: "--color-text-subtle", value: "#5B6578", usage: "Métadonnées, désactivé", swatch: "bg-text-subtle" },
    ],
  },
  {
    group: "Interaction",
    tokens: [
      { token: "--color-accent", value: "#6E8BFF", usage: "Interactions, sélection, focus — jamais un statut", swatch: "bg-accent" },
    ],
  },
  {
    group: "Statut (réservé)",
    tokens: [
      { token: "--color-status-ok", value: "#2FB67C", usage: "Conforme", swatch: "bg-status-ok" },
      { token: "--color-status-warning", value: "#F2A93B", usage: "Écart à surveiller", swatch: "bg-status-warning" },
      { token: "--color-status-critical", value: "#F0524F", usage: "Écart critique", swatch: "bg-status-critical" },
      { token: "--color-status-unknown", value: "#5B6578", usage: "Statut non calculable", swatch: "bg-status-unknown" },
    ],
  },
];

const FORMAT_EXAMPLES: { call: string; result: string }[] = [
  { call: "formatCurrency(1250000)", result: formatCurrency(1_250_000) },
  { call: "formatCurrency(1234.5, { decimals: 2 })", result: formatCurrency(1234.5, { decimals: 2 }) },
  { call: "formatSurface(12450)", result: formatSurface(12_450) },
  { call: "formatEnergy(8500)", result: formatEnergy(8_500) },
  { call: "formatEnergy(125400)", result: formatEnergy(125_400) },
  { call: "formatPercent(3.2)", result: formatPercent(3.2) },
  { call: "formatPercent(-1.5)", result: formatPercent(-1.5) },
  { call: "formatDate('2026-03-12')", result: formatDate("2026-03-12") },
  { call: "formatNumber(1234567.891)", result: formatNumber(1_234_567.891) },
  { call: "formatNumber(null)", result: formatNumber(null) },
  { call: "formatSurface(NaN)", result: formatSurface(Number.NaN) },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`section-${title}`}>
      <h2 id={`section-${title}`} className="text-base font-semibold tracking-tight text-text">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StateLabel({ children }: { children: ReactNode }) {
  return <span className="w-28 shrink-0 text-xs text-text-muted">{children}</span>;
}

export default function DesignSystemPage() {
  if (getEnv().NODE_ENV === "production") notFound();

  return (
    <PageContainer className="mx-auto flex max-w-6xl flex-col gap-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wider text-text-muted uppercase">
          Développement uniquement
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Système de design Atlas</h1>
        <p className="max-w-2xl text-sm text-text-muted">
          Tokens, typographie, composants et formats. Les couleurs vert, ambre et rouge sont
          réservées au statut de conformité et toujours accompagnées d&apos;un libellé.
        </p>
      </header>

      <Section title="Palette">
        <div className="grid gap-6">
          {PALETTE.map((group) => (
            <div key={group.group} className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-text-muted">{group.group}</h3>
              <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {group.tokens.map((t) => (
                  <li
                    key={t.token}
                    className="overflow-hidden rounded-md border border-border bg-surface-1"
                  >
                    <div className={`h-14 border-b border-border ${t.swatch}`} />
                    <div className="flex flex-col gap-1 p-3">
                      <code className="font-mono text-xs text-text">{t.token}</code>
                      <span className="numeric text-xs text-text-muted">{t.value}</span>
                      <span className="text-xs text-text-muted">{t.usage}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typographie">
        <div className="grid gap-4 rounded-lg border border-border bg-surface-1 p-6">
          <div className="flex items-baseline gap-6">
            <StateLabel>Sans — Geist</StateLabel>
            <p className="font-sans text-2xl font-semibold tracking-tight">
              Entrepôt de Saint-Quentin-Fallavier
            </p>
          </div>
          <div className="flex items-baseline gap-6">
            <StateLabel>Sans — corps</StateLabel>
            <p className="text-sm text-text-muted">
              Libellé secondaire, texte courant des panneaux et des formulaires.
            </p>
          </div>
          <div className="flex items-baseline gap-6">
            <StateLabel>Mono — Geist Mono</StateLabel>
            <p className="font-mono text-sm">SITE-0142 · 45.6412, 5.1203</p>
          </div>
          <div className="flex gap-6">
            <StateLabel>Chiffres tabulaires</StateLabel>
            <table className="numeric text-sm">
              <tbody>
                {[12_450, 1_118, 98_760, 7].map((n) => (
                  <tr key={n}>
                    <td className="pr-6 text-right">{formatSurface(n)}</td>
                    <td className="text-right text-text-muted">{formatCurrency(n * 91)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Boutons">
        <div className="grid gap-3 rounded-lg border border-border bg-surface-1 p-6">
          {(["default", "secondary", "outline", "ghost", "link"] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              <StateLabel>{variant}</StateLabel>
              <Button variant={variant}>Enregistrer</Button>
              <Button variant={variant}>
                <Plus aria-hidden="true" />
                Ajouter
              </Button>
              <Button variant={variant} size="sm">
                Petit
              </Button>
              <Button variant={variant} size="icon" aria-label="Filtrer">
                <Filter aria-hidden="true" />
              </Button>
              <Button variant={variant} disabled>
                Désactivé
              </Button>
            </div>
          ))}
          <p className="text-xs text-text-muted">
            Survol : passer la souris. Focus : naviguer avec Tab (anneau accent).
          </p>
        </div>
      </Section>

      <Section title="Champs">
        <div className="grid gap-5 rounded-lg border border-border bg-surface-1 p-6 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ds-default">Par défaut</Label>
            <Input id="ds-default" placeholder="Nom du site" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ds-filled">Rempli</Label>
            <Input id="ds-filled" defaultValue="Entrepôt de Brebières" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ds-disabled">Désactivé</Label>
            <Input id="ds-disabled" disabled defaultValue="Non modifiable" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ds-invalid">Invalide</Label>
            <Input
              id="ds-invalid"
              aria-invalid="true"
              aria-describedby="ds-invalid-msg"
              defaultValue="12 450 m2"
            />
            <p id="ds-invalid-msg" className="text-xs text-text">
              Saisir une surface numérique en m².
            </p>
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="ds-search">Avec icône</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <Input id="ds-search" className="pl-9" placeholder="Rechercher…" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Statuts">
        <div className="grid gap-4 rounded-lg border border-border bg-surface-1 p-6">
          <div className="flex flex-wrap items-center gap-6">
            <StateLabel>Pastilles</StateLabel>
            {COMPLIANCE_STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-2 text-sm text-text-muted">
                <StatusDot status={s} size="lg" />
                {STATUS_META[s].label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StateLabel>Badges</StateLabel>
            {COMPLIANCE_STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StateLabel>Badges compacts</StateLabel>
            {COMPLIANCE_STATUSES.map((s) => (
              <StatusBadge key={s} status={s} hideLabel />
            ))}
          </div>
          <div className="flex items-start gap-3">
            <StateLabel>Légende</StateLabel>
            <StatusLegend orientation="horizontal" />
          </div>
        </div>
      </Section>

      <Section title="Panneau">
        <div className="relative h-80 overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_30%_40%,var(--color-surface-3),var(--color-bg)_70%)] p-6">
          <Panel
            title="Entrepôt de Brebières"
            actions={
              <Button variant="ghost" size="icon" aria-label="Exporter">
                <Download aria-hidden="true" />
              </Button>
            }
            className="h-full max-w-sm"
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-text-muted">Statut</dt>
              <dd>
                <StatusBadge status="warning" />
              </dd>
              <dt className="text-text-muted">Surface</dt>
              <dd className="numeric">{formatSurface(48_320)}</dd>
              <dt className="text-text-muted">Loyer annuel</dt>
              <dd className="numeric">{formatCurrency(2_415_000)}</dd>
              <dt className="text-text-muted">Consommation</dt>
              <dd className="numeric">{formatEnergy(1_284_000)}</dd>
              <dt className="text-text-muted">Évolution</dt>
              <dd className="numeric">{formatPercent(-2.4)}</dd>
              <dt className="text-text-muted">Dernière visite</dt>
              <dd>{formatDate("2026-03-12")}</dd>
            </dl>
          </Panel>
        </div>
      </Section>

      <Section title="Formats (fr-FR)">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Appel
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Résultat
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface-1">
              {FORMAT_EXAMPLES.map((ex) => (
                <tr key={ex.call} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">{ex.call}</td>
                  <td className="numeric px-4 py-2">{ex.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </PageContainer>
  );
}
