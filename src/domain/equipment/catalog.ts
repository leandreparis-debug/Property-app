/**
 * Catalog of the equipment types (step 10). The type is stored as a CODE in
 * `equipments.type` (NVarChar(40), no CHECK constraint): adding a type here
 * needs no migration. Future modules (N100, regulatory controls) attach to
 * `Equipment` rows, never to the catalog.
 *
 * Markers never use the status colors: categories differ by SHAPE, types by
 * ICON (hand-drawn pictograms, see components/plan/pictograms.ts).
 */
import { z } from "zod";

/** Marker shape of a category. */
export type MarkerShape = "circle" | "square" | "diamond" | "hexagon" | "pill";

/** An equipment category. */
export interface EquipmentCategory {
  code: "FIRE" | "ELECTRICAL" | "FLUIDS" | "ENVIRONMENT" | "PEOPLE";
  labelFr: string;
  shape: MarkerShape;
}

/** Categories, in display order. */
export const EQUIPMENT_CATEGORIES = [
  { code: "FIRE", labelFr: "Incendie", shape: "circle" },
  { code: "ELECTRICAL", labelFr: "Électricité", shape: "square" },
  { code: "FLUIDS", labelFr: "Fluides", shape: "diamond" },
  { code: "ENVIRONMENT", labelFr: "Environnement", shape: "hexagon" },
  { code: "PEOPLE", labelFr: "Sécurité des personnes", shape: "pill" },
] as const satisfies readonly EquipmentCategory[];

export type EquipmentCategoryCode = (typeof EQUIPMENT_CATEGORIES)[number]["code"];

/** An equipment type of the catalog. */
export interface EquipmentTypeDef {
  /** Stored code (upper snake case, ≤ 40 characters). */
  code: string;
  labelFr: string;
  /** Short name used for automatic labels (« RIA 4 »). */
  shortFr: string;
  category: EquipmentCategoryCode;
  /** Pictogram key (components/plan/pictograms.ts). */
  icon: string;
}

/** The catalog, grouped by category. */
export const EQUIPMENT_TYPES = [
  // Incendie
  { code: "FIRE_EXTINGUISHER", labelFr: "Extincteur", shortFr: "Extincteur", category: "FIRE", icon: "extinguisher" },
  { code: "FIRE_HOSE_REEL", labelFr: "Robinet d'incendie armé (RIA)", shortFr: "RIA", category: "FIRE", icon: "hose" },
  { code: "SPRINKLER_VALVE", labelFr: "Poste de contrôle sprinkler", shortFr: "Poste sprinkler", category: "FIRE", icon: "sprinkler" },
  { code: "FIRE_HYDRANT", labelFr: "Poteau ou bouche incendie", shortFr: "Poteau incendie", category: "FIRE", icon: "hydrant" },
  { code: "FIRE_WATER_RESERVE", labelFr: "Réserve d'eau incendie", shortFr: "Réserve incendie", category: "FIRE", icon: "reserve" },
  { code: "FIRE_ALARM_PANEL", labelFr: "Centrale SSI", shortFr: "Centrale SSI", category: "FIRE", icon: "alarm" },
  { code: "SMOKE_VENT", labelFr: "Exutoire de désenfumage", shortFr: "Exutoire", category: "FIRE", icon: "vent" },
  { code: "SMOKE_CONTROL", labelFr: "Commande de désenfumage", shortFr: "Commande désenfumage", category: "FIRE", icon: "lever" },
  { code: "FIRE_DOOR", labelFr: "Porte coupe-feu", shortFr: "Porte coupe-feu", category: "FIRE", icon: "door" },
  // Électricité
  { code: "MAIN_LV_PANEL", labelFr: "Tableau général basse tension (TGBT)", shortFr: "TGBT", category: "ELECTRICAL", icon: "panel" },
  { code: "TRANSFORMER", labelFr: "Poste de transformation", shortFr: "Poste de transformation", category: "ELECTRICAL", icon: "bolt" },
  { code: "GENERATOR", labelFr: "Groupe électrogène", shortFr: "Groupe électrogène", category: "ELECTRICAL", icon: "generator" },
  { code: "CHARGING_ROOM", labelFr: "Local de charge", shortFr: "Local de charge", category: "ELECTRICAL", icon: "battery" },
  // Fluides
  { code: "BOILER_ROOM", labelFr: "Chaufferie", shortFr: "Chaufferie", category: "FLUIDS", icon: "flame" },
  { code: "TANK", labelFr: "Cuve (fioul ou gaz)", shortFr: "Cuve", category: "FLUIDS", icon: "tank" },
  { code: "SHUTOFF_VALVE", labelFr: "Vanne de coupure", shortFr: "Vanne de coupure", category: "FLUIDS", icon: "valve" },
  // Environnement
  { code: "OIL_SEPARATOR", labelFr: "Séparateur d'hydrocarbures", shortFr: "Séparateur", category: "ENVIRONMENT", icon: "separator" },
  { code: "RETENTION_BASIN", labelFr: "Bassin de rétention", shortFr: "Bassin", category: "ENVIRONMENT", icon: "basin" },
  { code: "ISOLATION_VALVE", labelFr: "Vanne de barrage", shortFr: "Vanne de barrage", category: "ENVIRONMENT", icon: "gate" },
  // Sécurité des personnes
  { code: "DEFIBRILLATOR", labelFr: "Défibrillateur", shortFr: "Défibrillateur", category: "PEOPLE", icon: "heart" },
  { code: "ASSEMBLY_POINT", labelFr: "Point de rassemblement", shortFr: "Point de rassemblement", category: "PEOPLE", icon: "assembly" },
] as const satisfies readonly EquipmentTypeDef[];

export type EquipmentTypeCode = (typeof EQUIPMENT_TYPES)[number]["code"];

const BY_CODE: ReadonlyMap<string, EquipmentTypeDef> = new Map(EQUIPMENT_TYPES.map((t) => [t.code, t]));
const CATEGORY_BY_CODE: ReadonlyMap<string, EquipmentCategory> = new Map(EQUIPMENT_CATEGORIES.map((c) => [c.code, c]));

/** zod schema of a type code (only codes of the catalog). */
export const equipmentTypeSchema = z.string().refine((v) => BY_CODE.has(v), { error: "Type d'équipement inconnu." });

/**
 * A type of the catalog.
 * @param code - Stored code.
 * @returns The definition, or `undefined` for a code unknown to the catalog
 *   (older data: displayed as « Autre équipement »).
 */
export function equipmentType(code: string): EquipmentTypeDef | undefined {
  return BY_CODE.get(code);
}

/**
 * Category of a type code (`FIRE` for unknown codes is NOT assumed: `undefined`).
 * @param code - Type code.
 */
export function categoryOf(code: string): EquipmentCategory | undefined {
  const type = BY_CODE.get(code);
  return type ? CATEGORY_BY_CODE.get(type.category) : undefined;
}

/** French label of a type code (the code itself when unknown). */
export function equipmentTypeLabel(code: string): string {
  return BY_CODE.get(code)?.labelFr ?? "Autre équipement";
}

/**
 * Next automatic label of a type: short name followed by the smallest number
 * greater than every number already used by this type's labels
 * (« RIA 1 », « RIA 2 », « RIA 7 » → « RIA 8 »).
 * @param code - Type code.
 * @param existingLabels - Labels of the site's equipments of this type (archived included).
 */
export function nextEquipmentLabel(code: string, existingLabels: readonly (string | null)[]): string {
  const short = BY_CODE.get(code)?.shortFr ?? "Équipement";
  const escaped = short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}\\s+(\\d+)$`, "i");
  let max = 0;
  for (const label of existingLabels) {
    const n = label ? pattern.exec(label.trim())?.[1] : undefined;
    if (n) max = Math.max(max, Number(n));
  }
  return `${short} ${max + 1}`;
}

/** Maximum distance of an equipment from its site (m). */
export const MAX_EQUIPMENT_DISTANCE_M = 1000;

/**
 * Great-circle distance between two positions (m), haversine on the mean sphere.
 * @param a - [lon, lat] in degrees.
 * @param b - [lon, lat] in degrees.
 */
export function distanceM(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6_371_008.8;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Is a position within {@link MAX_EQUIPMENT_DISTANCE_M} of the site?
 * @param position - [lon, lat] of the equipment.
 * @param site - [lon, lat] of the site.
 */
export function withinSiteRadius(position: readonly [number, number], site: readonly [number, number]): boolean {
  return distanceM(position, site) <= MAX_EQUIPMENT_DISTANCE_M;
}
