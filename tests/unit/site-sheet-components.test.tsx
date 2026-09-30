// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaseTimeline, TrendChart } from "@/components/charts";
import { SiteTabs } from "@/components/site-sheet/SiteTabs";
import { leaseMilestones } from "@/domain/site-sheet/lease-timeline";

// useSearchParams follows the real URL (replaceQuery writes it with history.replaceState).
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

afterEach(cleanup);

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("TrendChart", () => {
  const series = [
    { id: "rent", label: "Loyer", tone: "accent" as const, points: [{ year: 2021, value: 100 }, { year: 2022, value: 120 }, { year: 2024, value: 130 }, { year: 2025, value: null }, { year: 2026, value: 150 }] },
  ];

  it("never interpolates a missing year: one polyline per run of consecutive years", () => {
    const { container } = render(<TrendChart title="Loyer" series={series} format={(v) => `${v} €`} />);
    expect(container.querySelectorAll("polyline")).toHaveLength(1); // 2021–2022 only; 2024 and 2026 are isolated points
    expect(container.querySelectorAll("circle")).toHaveLength(4);
    // Every calendar year of the range is on the axis, gaps included.
    expect([...container.querySelectorAll("g[data-year]")].map((g) => g.getAttribute("data-year"))).toEqual(["2021", "2022", "2023", "2024", "2025", "2026"]);
  });

  it("has a title, a legend and a data table behind « Voir les données »", () => {
    render(<TrendChart title="Loyer et coût d'occupation" series={series} format={(v) => `${v} €`} />);
    expect(screen.getByRole("figure", { name: "Loyer et coût d'occupation" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Légende" }).textContent).toContain("Loyer");
    const table = screen.getByRole("table", { name: /données/ });
    expect(table.textContent).toContain("150 €");
    expect(table.textContent).toContain("Non renseigné");
    const button = screen.getByRole("button", { name: "Voir les données" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Masquer les données" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("uses the accent color for the main series and never a status color", () => {
    const { container } = render(<TrendChart title="x" series={[...series, { id: "o", label: "Autre", tone: "neutral", points: [{ year: 2021, value: 1 }, { year: 2022, value: 2 }] }]} format={String} />);
    const html = container.innerHTML;
    expect(html).toContain("var(--color-accent)");
    expect(html).not.toContain("status");
  });

  it("without any value: a sober message", () => {
    render(<TrendChart title="Eau" series={[{ id: "w", label: "Eau", tone: "accent", points: [] }]} format={String} />);
    expect(screen.getByText("Aucune valeur renseignée.")).toBeTruthy();
  });
});

describe("LeaseTimeline", () => {
  const lease = { initialEffectiveDate: d("2014-01-01"), lastAmendmentDate: null, noticeDate: d("2026-07-28"), noticePeriodMonths: 6, nextExitDate: d("2027-01-28"), endDate: d("2027-01-28") };
  const today = d("2026-09-29");

  it("today in accent, past milestones dimmed, arbitration outlined with the status color only when a lease rule triggers", () => {
    const { container, rerender } = render(<LeaseTimeline milestones={leaseMilestones(lease, today, [{ ruleId: "LEASE_ARBITRATION_OVERDUE" }])} today={today} status="critical" />);
    expect(container.querySelector('[data-slot="timeline-today"] line')?.getAttribute("stroke")).toBe("var(--color-accent)");
    expect(container.querySelector('[data-milestone="initialEffective"]')?.getAttribute("opacity")).toBe("0.45");
    expect(container.querySelector('[data-milestone="end"]')?.getAttribute("opacity")).toBe("1");
    expect(container.querySelector('[data-milestone="arbitration"] circle[stroke="var(--color-status-critical)"]')).not.toBeNull();

    rerender(<LeaseTimeline milestones={leaseMilestones(lease, today, [{ ruleId: "LOW_COMPLETENESS" }])} today={today} status="warning" />);
    expect(container.innerHTML).not.toContain("--color-status");
  });

  it("lists the milestones as text; without milestones, a compact empty state", () => {
    const { container } = render(<LeaseTimeline milestones={leaseMilestones(lease, today)} today={today} status="ok" />);
    expect(container.querySelector('[data-slot="timeline-list"]')?.textContent).toContain("Fin de bail");
    cleanup();
    render(<LeaseTimeline milestones={[]} today={today} status="ok" />);
    expect(screen.getByRole("heading", { name: "Aucune date de bail renseignée" })).toBeTruthy();
  });
});

describe("SiteTabs", () => {
  const panels = { overview: "A", lease: "B", operations: "C", finance: "D", energy: "E", technical: "F", plan: "P", icpe: "G", documents: "H" };

  it("ARIA tabs: arrows, Home and End move and activate; the tab lives in ?tab=", () => {
    window.history.replaceState(null, "", "/sites/x?region=Bretagne");
    const { rerender } = render(<SiteTabs panels={panels} />);
    const overview = screen.getByRole("tab", { name: "Vue d'ensemble" });
    expect(overview.getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel", { name: "Vue d'ensemble" });
    expect(panel.textContent).toContain("A");
    expect(panel.classList.contains("hidden")).toBe(false);

    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(window.location.search).toBe("?region=Bretagne&tab=lease");
    rerender(<SiteTabs panels={panels} />);
    expect(screen.getByRole("tab", { name: "Bail" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Bail" }));

    fireEvent.keyDown(screen.getByRole("tab", { name: "Bail" }), { key: "End" });
    expect(window.location.search).toBe("?region=Bretagne&tab=documents");
    rerender(<SiteTabs panels={panels} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Documents" }), { key: "ArrowRight" });
    expect(window.location.search).toBe("?region=Bretagne"); // wraps to overview, the default is omitted
    rerender(<SiteTabs panels={panels} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Vue d'ensemble" }), { key: "ArrowLeft" });
    expect(window.location.search).toBe("?region=Bretagne&tab=documents");
    rerender(<SiteTabs panels={panels} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Documents" }), { key: "Home" });
    expect(window.location.search).toBe("?region=Bretagne");
  });

  it("an unknown ?tab= opens the overview; every panel is rendered (printed), inactive ones hidden", () => {
    window.history.replaceState(null, "", "/sites/x?tab=nope");
    const { container } = render(<SiteTabs panels={panels} />);
    expect(screen.getByRole("tab", { name: "Vue d'ensemble" }).getAttribute("aria-selected")).toBe("true");
    const all = container.querySelectorAll('[role="tabpanel"]');
    expect(all).toHaveLength(9);
    expect([...all].filter((p) => p.classList.contains("hidden"))).toHaveLength(8);
    expect([...all].every((p) => p.classList.contains("print:block"))).toBe(true);
    expect(screen.getAllByRole("tab").filter((t) => t.tabIndex === 0)).toHaveLength(1);
  });
});
