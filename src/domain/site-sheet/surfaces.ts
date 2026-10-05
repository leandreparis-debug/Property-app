/**
 * Breakdown of the building surfaces (horizontal neutral bar of the Technical
 * tab): dry, temperature-controlled, packaging, charging rooms, technical
 * rooms, offices and social premises (BLS), guard house.
 */
import { toNumber, type NumericLike } from "../derived";

/** Surfaces of the breakdown, in display order. */
export const SURFACE_PARTS = [
  { key: "dryArea", labelFr: "Sec" },
  { key: "temperatureControlledArea", labelFr: "Température contrôlée" },
  { key: "packagingArea", labelFr: "Emballage" },
  { key: "chargingRoomArea", labelFr: "Locaux de charge" },
  { key: "technicalRoomsArea", labelFr: "Locaux techniques" },
  { key: "socialOfficeArea", labelFr: "BLS" },
  { key: "guardHouseArea", labelFr: "Poste de garde" },
] as const;

/** Key of a surface part. */
export type SurfacePartKey = (typeof SURFACE_PARTS)[number]["key"];

/** One segment of the breakdown. */
export interface SurfaceSegment {
  key: SurfacePartKey;
  labelFr: string;
  area: number;
  /** Share of the sum of the known parts, 0–1. */
  share: number;
}

/**
 * Segments of the known, strictly positive parts.
 * @param technical - Technical record.
 * @returns The segments (empty when no part is known).
 */
export function surfaceBreakdown(technical: Partial<Record<SurfacePartKey, NumericLike>> | null | undefined): SurfaceSegment[] {
  if (!technical) return [];
  const known = SURFACE_PARTS.flatMap((p) => {
    const area = toNumber(technical[p.key]);
    return area !== null && area > 0 ? [{ key: p.key, labelFr: p.labelFr, area }] : [];
  });
  const total = known.reduce((s, p) => s + p.area, 0);
  return known.map((p) => ({ ...p, share: total > 0 ? p.area / total : 0 }));
}
