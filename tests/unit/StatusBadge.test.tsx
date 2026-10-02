// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/status/StatusBadge";
import { StatusLegend } from "@/components/status/StatusLegend";
import { COMPLIANCE_STATUSES, STATUS_META } from "@/lib/status";

afterEach(cleanup);

describe("StatusBadge", () => {
  it.each(COMPLIANCE_STATUSES)("renders the label and data-status for %s", (status) => {
    const { container } = render(<StatusBadge status={status} />);
    const label = STATUS_META[status].label;
    expect(screen.getByText(label)).toBeVisible();
    const badge = container.querySelector('[data-slot="status-badge"]');
    expect(badge).toHaveAttribute("data-status", status);
    // The label is part of the badge's accessible text content.
    expect(badge).toHaveTextContent(label);
  });

  it("keeps the colored dot out of the accessibility tree", () => {
    const { container } = render(<StatusBadge status="critical" />);
    expect(container.querySelector('[data-slot="status-dot"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it.each(COMPLIANCE_STATUSES)("exposes an accessible name when the label is hidden (%s)", (status) => {
    render(<StatusBadge status={status} hideLabel />);
    const badge = screen.getByRole("img", { name: STATUS_META[status].label });
    expect(badge).toHaveAttribute("data-status", status);
    expect(badge).toHaveAccessibleName(STATUS_META[status].label);
  });
});

describe("StatusLegend", () => {
  it("lists the four statuses, most severe first", () => {
    render(<StatusLegend />);
    const list = screen.getByRole("list", { name: /légende/i });
    const items = Array.from(list.querySelectorAll("li")).map((li) => li.textContent);
    expect(items).toEqual(["Critique", "À surveiller", "Non évalué", "Conforme"]);
  });
});
