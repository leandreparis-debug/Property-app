/**
 * DTO of the national map, sent to the browser. It carries MINIMAL data:
 * identity, location, compliance status and reasons, completeness and
 * reference area. Never any rent, amount or detailed lease data (a unit test
 * checks the list of keys).
 */
import type { DeadlineBucket } from "./site-index";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import type { ComplianceReason } from "./compliance/types";
import type { ComplianceStatus } from "@/lib/status";

/** Properties of a located site (point). */
export interface MapSiteProperties {
  id: string;
  code: string;
  name: string;
  city: string | null;
  departmentCode: string | null;
  region: string | null;
  isActive: boolean;
  status: ComplianceStatus;
  /** Sort rank (critical 3, warning 2, unknown 1, ok 0): higher is drawn on top. */
  statusRank: number;
  /** At most 3 reasons, most severe first. */
  reasons: ComplianceReason[];
  /** Total number of reasons (all of them are in `details`). */
  reasonCount: number;
  completeness: number;
  /** Reference area (m²), or null. */
  totalArea: number | null;
  /** Lease deadline bucket (label « Échéance » of the map pins). */
  deadline: DeadlineBucket;
  hasFootprint: boolean;
}

/** Properties of a building footprint. */
export interface MapFootprintProperties {
  id: string;
  code: string;
  status: ComplianceStatus;
  heightM: number;
  heightEstimated: boolean;
  /** Approximate volume (no footprint): drawn as a translucent wireframe. */
  approximate: boolean;
}

/**
 * Properties of a volume feature: a cell (`index` ≥ 0), or all the
 * firewalls / docks / roof edges of a site merged (`index` = -1).
 */
export interface MapVolumeProperties {
  siteId: string;
  code: string;
  part: "cell" | "firewall" | "dock" | "edge";
  index: number;
  heightM: number;
  baseM: number;
  approximate: boolean;
}

/** A site without coordinates. */
export interface UnlocatedSite {
  id: string;
  code: string;
  name: string;
  city: string | null;
  status: ComplianceStatus;
}

/** Data of the national map. */
export interface MapSitesData {
  /** Business date used for the evaluation (YYYY-MM-DD). */
  evaluatedOn: string;
  points: FeatureCollection<Point, MapSiteProperties>;
  footprints: FeatureCollection<Polygon | MultiPolygon, MapFootprintProperties>;
  /** 3D volumes of the footprints (computed by the server, see domain/volume). */
  volumes: FeatureCollection<Polygon | MultiPolygon, MapVolumeProperties>;
  unlocated: UnlocatedSite[];
  counts: Record<ComplianceStatus, number>;
  /** All reasons per site id (the points only carry the first 3). */
  reasonsById: Record<string, ComplianceReason[]>;
}

/** A point feature of the map. */
export type MapSiteFeature = Feature<Point, MapSiteProperties>;

/** Default height of a footprint without known height (m). */
export const DEFAULT_BUILDING_HEIGHT_M = 12;

/** Maximum number of reasons carried by a point. */
export const MAX_POINT_REASONS = 3;
