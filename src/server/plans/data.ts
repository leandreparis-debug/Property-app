import "server-only";
import { toNumber } from "@/domain/derived";
import type { FootprintRecord } from "@/domain/map-data";
import { imageCorners, parseStoredCalibration, type PlanControlPoint } from "@/domain/plan/calibration";
import type { Affine } from "@/domain/geometry";
import { db } from "../db";
import { footprintOf, parseDockSide } from "../sites/build";
import { isWellFormedSiteId } from "../sites/detail";

/** A plan as shown by the Plan tab (dates as ISO strings). */
export interface PlanView {
  id: string;
  documentId: string | null;
  title: string | null;
  /** Inline image URL (`/api/documents/[id]?inline=1`), or null. */
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  points: PlanControlPoint[];
  /** Transform pixel → Web Mercator, or null when not calibrated. */
  matrix: Affine | null;
  /** Image corners for the MapLibre `image` source (TL, TR, BR, BL), or null. */
  corners: [[number, number], [number, number], [number, number], [number, number]] | null;
  rmsErrorM: number | null;
  rotationDeg: number | null;
  opacity: number;
  isCurrent: boolean;
  createdAt: string;
  calibratedAt: string | null;
  calibratedByName: string | null;
}

/** An equipment (not archived) of the Plan tab. */
export interface EquipmentView {
  id: string;
  type: string;
  label: string | null;
  reference: string | null;
  level: string | null;
  /** YYYY-MM-DD, or null. */
  installedAt: string | null;
  notes: string | null;
  /** [lon, lat], or null for an equipment without position. */
  lngLat: [number, number] | null;
  planId: string | null;
  planX: number | null;
  planY: number | null;
}

/** Everything the Plan tab needs. */
export interface SitePlanData {
  site: { id: string; code: string; name: string; center: [number, number] | null; archived: boolean; dockSide: "a" | "b" };
  volume: FootprintRecord | null;
  /** Current plan, or null. */
  plan: PlanView | null;
  /** Every plan of the site, most recent first (the current one included). */
  history: PlanView[];
  equipments: EquipmentView[];
}

/**
 * Data of the Plan tab: site, generated volume, current plan with its
 * transform, plan history and non-archived equipments. One query per entity
 * (site with its technical data and geometry, plans, equipments).
 * @param siteId - Site id (untrusted).
 * @returns The data, or null for an unknown site.
 */
export async function getSitePlanData(siteId: string): Promise<SitePlanData | null> {
  if (!isWellFormedSiteId(siteId)) return null;
  const [site, plans, equipments] = await Promise.all([
    db.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        code: true,
        name: true,
        latitude: true,
        longitude: true,
        archivedAt: true,
        technical: { select: { surveyedTotalArea: true, totalWarehouseArea: true, heightM: true, cellCount: true, dockCount: true } },
        geometry: { select: { footprintGeoJson: true, heightM: true, dockSide: true } },
      },
    }),
    db.sitePlan.findMany({
      where: { siteId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        documentId: true,
        imageWidth: true,
        imageHeight: true,
        controlPointsJson: true,
        transformJson: true,
        rmsErrorM: true,
        rotationDeg: true,
        opacity: true,
        isCurrent: true,
        createdAt: true,
        calibratedAt: true,
        calibratedBy: { select: { name: true, email: true } },
        document: { select: { title: true, mimeType: true } },
      },
    }),
    db.equipment.findMany({
      where: { siteId, archivedAt: null },
      orderBy: [{ type: "asc" }, { label: "asc" }, { id: "asc" }],
      select: { id: true, type: true, label: true, reference: true, level: true, installedAt: true, notes: true, latitude: true, longitude: true, planId: true, planX: true, planY: true },
    }),
  ]);
  if (!site) return null;

  const lat = toNumber(site.latitude);
  const lon = toNumber(site.longitude);
  const history: PlanView[] = plans.map((p) => {
    const calibration = parseStoredCalibration(p.controlPointsJson, p.transformJson);
    const width = p.imageWidth;
    const height = p.imageHeight;
    return {
      id: p.id,
      documentId: p.documentId,
      title: p.document?.title ?? null,
      imageUrl: p.documentId && p.document?.mimeType?.startsWith("image/") ? `/api/documents/${p.documentId}?inline=1` : null,
      width,
      height,
      points: calibration?.points ?? [],
      matrix: calibration?.matrix ?? null,
      corners: calibration && width && height ? imageCorners(calibration.matrix, width, height) : null,
      rmsErrorM: toNumber(p.rmsErrorM),
      rotationDeg: toNumber(p.rotationDeg),
      opacity: toNumber(p.opacity) ?? 0.7,
      isCurrent: p.isCurrent,
      createdAt: p.createdAt.toISOString(),
      calibratedAt: p.calibratedAt?.toISOString() ?? null,
      calibratedByName: p.calibratedBy?.name ?? p.calibratedBy?.email ?? null,
    };
  });

  return {
    site: {
      id: site.id,
      code: site.code,
      name: site.name,
      center: lat !== null && lon !== null ? [lon, lat] : null,
      archived: site.archivedAt !== null,
      dockSide: parseDockSide(site.geometry?.dockSide),
    },
    volume: footprintOf({ id: site.id, code: site.code, latitude: site.latitude, longitude: site.longitude, technical: site.technical, geometry: site.geometry }),
    plan: history.find((p) => p.isCurrent) ?? null,
    history,
    equipments: equipments.map((e) => {
      const eLat = toNumber(e.latitude);
      const eLon = toNumber(e.longitude);
      return {
        id: e.id,
        type: e.type,
        label: e.label,
        reference: e.reference,
        level: e.level,
        installedAt: e.installedAt ? e.installedAt.toISOString().slice(0, 10) : null,
        notes: e.notes,
        lngLat: eLat !== null && eLon !== null ? [eLon, eLat] : null,
        planId: e.planId,
        planX: toNumber(e.planX),
        planY: toNumber(e.planY),
      };
    }),
  };
}

/**
 * Equipments of a site for the national map (read-only, zoom ≥ 17): type,
 * label and position only.
 * @param siteId - Site id (untrusted).
 */
export async function getSiteEquipmentsForMap(siteId: string): Promise<{ id: string; type: string; label: string | null; lngLat: [number, number] }[]> {
  if (!isWellFormedSiteId(siteId)) return [];
  const rows = await db.equipment.findMany({
    where: { siteId, archivedAt: null, site: { archivedAt: null }, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, type: true, label: true, latitude: true, longitude: true },
  });
  return rows.map((r) => ({ id: r.id, type: r.type, label: r.label, lngLat: [toNumber(r.longitude)!, toNumber(r.latitude)!] }));
}
