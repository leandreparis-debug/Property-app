"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { MapSiteProperties } from "@/domain/map-dto";
import { StatusBadge } from "@/components/status/StatusBadge";

/** Props of {@link SiteHoverCard}. */
export interface SiteHoverCardProps {
  site: MapSiteProperties;
  /** Cursor position relative to the map container (px). */
  x: number;
  y: number;
}

const OFFSET = 16;
const MARGIN = 8;

/**
 * Floating preview of a hovered site: follows the cursor and never leaves the
 * map container (flips left/up near the edges). Name, code, city, status and
 * at most 2 reasons.
 */
export function SiteHoverCard({ site, x, y }: SiteHoverCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x + OFFSET, top: y + OFFSET });

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const { width, height } = el.getBoundingClientRect();
    const maxW = parent.clientWidth;
    const maxH = parent.clientHeight;
    let left = x + OFFSET;
    let top = y + OFFSET;
    if (left + width + MARGIN > maxW) left = x - OFFSET - width;
    if (top + height + MARGIN > maxH) top = y - OFFSET - height;
    setPosition({ left: Math.max(MARGIN, Math.min(left, maxW - width - MARGIN)), top: Math.max(MARGIN, Math.min(top, maxH - height - MARGIN)) });
  }, [x, y, site.id]);

  return (
    <div
      ref={ref}
      role="tooltip"
      data-slot="site-hover-card"
      className="glass pointer-events-none absolute z-30 w-64 rounded-lg px-3 py-2.5 text-text shadow-panel"
      style={{ left: position.left, top: position.top }}
    >
      <p className="truncate text-sm font-semibold tracking-tight">{site.name}</p>
      <p className="mt-0.5 truncate text-xs text-text-muted">
        <span className="numeric">{site.code}</span>
        {site.city ? ` · ${site.city}` : ""}
      </p>
      <StatusBadge status={site.status} className="mt-2" />
      {site.reasons.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-xs text-text-muted">
          {site.reasons.slice(0, 2).map((r) => (
            <li key={r.ruleId} className="leading-snug">
              {r.detailFr ?? r.labelFr}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
