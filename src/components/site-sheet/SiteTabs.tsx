"use client";

import { useSearchParams } from "next/navigation";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { DEFAULT_TAB, parseTab, SITE_TABS, type SiteTab } from "@/domain/site-sheet/navigation";
import { replaceQuery } from "@/components/sites/url";
import { cn } from "@/lib/utils";

/**
 * Tabs of the site sheet (WAI-ARIA tabs pattern): arrows, Home and End move
 * and activate; the active tab lives in `?tab=` (client-side change, no
 * server round trip). Every panel is rendered: the inactive ones are hidden
 * on screen and all of them are printed, each with its title.
 */
export function SiteTabs({ panels }: { panels: Readonly<Record<SiteTab, ReactNode>> }) {
  const params = useSearchParams();
  const active = parseTab(params.get("tab"));
  const refs = useRef(new Map<SiteTab, HTMLButtonElement>());

  const select = (tab: SiteTab, focus = false) => {
    const next = new URLSearchParams(window.location.search);
    if (tab === DEFAULT_TAB) next.delete("tab");
    else next.set("tab", tab);
    replaceQuery(next.toString());
    if (focus) refs.current.get(tab)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = SITE_TABS.findIndex((t) => t.id === active);
    const last = SITE_TABS.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(SITE_TABS[target]!.id, true);
  };

  return (
    <div data-slot="site-tabs">
      <div role="tablist" aria-label="Sections de la fiche" className="flex gap-1 overflow-x-auto border-b border-border print:hidden">
        {SITE_TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) refs.current.set(tab.id, el);
                else refs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={onKeyDown}
              className={cn(
                "relative -mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                selected ? "border-accent font-medium text-text" : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {tab.labelFr}
            </button>
          );
        })}
      </div>
      {SITE_TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          tabIndex={0}
          data-tab={tab.id}
          className={cn("pt-5 outline-none focus-visible:outline-2 focus-visible:outline-ring print:block print:pt-6", tab.id !== active && "hidden")}
        >
          <h2 className="mb-4 hidden text-lg font-semibold print:block">{tab.labelFr}</h2>
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
