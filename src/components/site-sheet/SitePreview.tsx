"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapPinOff } from "lucide-react";
import { filterQuery } from "@/domain/filters/url";
import type { FootprintRecord } from "@/domain/map-data";
import { NationalMapLoader } from "@/components/map/NationalMapLoader";
import type { MapAssets } from "@/components/map/style/assets";

/**
 * Map preview of the site sheet (≈ 360 × 220): the `site` variant of the
 * national map, centred on the site (zoom 16, pitch 55), its footprint in
 * volume, aerial imagery when installed, fallback style otherwise, no
 * control. A click (or the link, for keyboard users) opens the main map.
 */
export function SitePreview({ code, center, footprint, assets }: { code: string; center: [number, number] | null; footprint: FootprintRecord | null; assets: MapAssets }) {
  const params = useSearchParams();
  const href = `/?${[filterQuery(params.toString()), `site=${encodeURIComponent(code)}`].filter(Boolean).join("&")}`;
  return (
    <div data-slot="site-preview" className="relative h-[220px] w-full shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2 sm:w-[360px] print:hidden">
      {center ? (
        <>
          <NationalMapLoader footprints={footprint ? [footprint] : []} assets={assets} isAdmin={false} exposeTestHook={false} variant="site" site={{ code, center }} />
          <Link
            href={href}
            className="glass absolute top-2 left-2 z-10 rounded-sm px-2 py-1 text-xs text-text-muted shadow-panel hover:text-text focus-visible:outline-2 focus-visible:outline-ring"
          >
            Ouvrir sur la carte
          </Link>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-text-muted">
          <MapPinOff className="size-5" aria-hidden="true" />
          Coordonnées non renseignées
        </div>
      )}
    </div>
  );
}
