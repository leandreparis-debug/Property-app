import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Props of {@link MapStage}. */
export interface MapStageProps {
  /**
   * Content mounted in the map slot (`data-slot="map-canvas"`). At step 6 the
   * MapLibre canvas is passed here; until then the placeholder is shown.
   */
  children?: ReactNode;
  /** Floating overlays (panels, legends) layered above the map. */
  overlay?: ReactNode;
  /** Extra classes. */
  className?: string;
}

/**
 * Full-screen map stage, behind every floating element. Without `children` it
 * renders a visual placeholder: `bg` background, faint grid, dark radial
 * vignette and a « Carte — étape 6 » mention.
 */
export function MapStage({ children, overlay, className }: MapStageProps) {
  return (
    <div
      role="region"
      aria-label="Carte"
      data-slot="map-stage"
      className={cn("fixed inset-0 overflow-hidden bg-bg", className)}
    >
      <div data-slot="map-canvas" className="absolute inset-0">
        {children ?? <MapPlaceholder />}
      </div>
      {overlay}
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {/* Faint grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(230_234_242/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(230_234_242/0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      {/* Radial vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgb(7_9_12/0.55)_55%,var(--color-bg)_100%)]" />
      <p className="absolute inset-0 flex items-center justify-center text-2xl font-medium tracking-tight text-text-subtle select-none">
        Carte — étape 6
      </p>
    </div>
  );
}
