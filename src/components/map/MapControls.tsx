"use client";

import { Box, Compass, Crosshair, List, Map as MapIcon, Minus, Plus, Square } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Props of {@link MapControls}. */
export interface MapControlsProps {
  is3d: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggle3d: () => void;
  onNorth: () => void;
  onNational: () => void;
  /** Reframe on the filtered results. */
  onFitResults: () => void;
  listOpen: boolean;
  onToggleList: () => void;
  /** Shift left when a right panel is open. */
  shifted: boolean;
}

function Control({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn(
            "flex size-9 items-center justify-center rounded-md text-text-muted transition-colors outline-none hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent",
            pressed && "bg-accent/15 text-accent",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Custom map toolbar (glass panel on the right, vertically centred). */
export function MapControls(props: MapControlsProps) {
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Contrôles de la carte"
      data-slot="map-controls"
      className={cn(
        "glass absolute top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-lg p-1.5 shadow-panel transition-[right] duration-200 motion-reduce:transition-none",
        props.shifted ? "right-[398px]" : "right-3",
      )}
    >
      <Control label="Zoom avant" onClick={props.onZoomIn}>
        <Plus className="size-4" />
      </Control>
      <Control label="Zoom arrière" onClick={props.onZoomOut}>
        <Minus className="size-4" />
      </Control>
      <div className="my-0.5 h-px w-6 bg-border" />
      <Control label={props.is3d ? "Vue 2D" : "Vue 3D"} onClick={props.onToggle3d}>
        {props.is3d ? <Square className="size-4" /> : <Box className="size-4" />}
      </Control>
      <Control label="Réorienter vers le nord" onClick={props.onNorth}>
        <Compass className="size-4" />
      </Control>
      <Control label="Vue nationale" onClick={props.onNational}>
        <MapIcon className="size-4" />
      </Control>
      <Control label="Cadrer les résultats" onClick={props.onFitResults}>
        <Crosshair className="size-4" />
      </Control>
      <div className="my-0.5 h-px w-6 bg-border" />
      <Control label="Liste des sites" onClick={props.onToggleList} pressed={props.listOpen}>
        <List className="size-4" />
      </Control>
    </div>
  );
}
