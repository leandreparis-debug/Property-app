import { categoryOf, equipmentType } from "@/domain/equipment/catalog";
import { cn } from "@/lib/utils";
import { markerSvg } from "./pictograms";

/**
 * An equipment marker (category shape + type pictogram) in the interface:
 * the same hand-drawn SVG as on the map. Decorative: the label is next to it.
 */
export function Pictogram({ type, className }: { type: string; className?: string }) {
  const svg = markerSvg(categoryOf(type)?.shape ?? "circle", equipmentType(type)?.icon ?? "");
  return <span aria-hidden="true" className={cn("inline-block size-7 shrink-0 [&>svg]:size-full", className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}
