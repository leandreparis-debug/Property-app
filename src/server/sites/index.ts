import "server-only";
import { toDateOnly, toIsoDate } from "@/domain/dates";
import type { FootprintRecord } from "@/domain/map-data";
import type { SiteIndexEntry } from "@/domain/site-index";
import { db } from "../db";
import { buildSiteIndex, footprintsFromRows, type SiteRow } from "./build";

/**
 * Reads every NON-ARCHIVED site in ONE query, with the relations needed by
 * the compliance engine, the index and the map footprints.
 */
export async function querySiteRows(): Promise<SiteRow[]> {
  const rows = await db.site.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      addressLine: true,
      postalCode: true,
      city: true,
      departmentCode: true,
      region: true,
      portfolio: true,
      occupyingBu: true,
      typology: true,
      operatingMode: true,
      logisticsOperator: true,
      latitude: true,
      longitude: true,
      externalIds: { select: { system: true, value: true } },
      lease: {
        select: { code: true, holdingEntity: true, endDate: true, nextExitDate: true, noticeDate: true, noticePeriodMonths: true, renewalConditionsSigned: true },
      },
      technical: { select: { surveyedTotalArea: true, totalWarehouseArea: true, socialOfficeArea: true, landArea: true, dockCount: true } },
      icpe: { select: { holder: true } },
      _count: { select: { icpeHeadings: true } },
      geometry: { select: { footprintGeoJson: true, heightM: true } },
    },
  });
  return rows.map(({ _count, ...r }) => ({
    ...r,
    hasCoordinates: r.latitude !== null && r.longitude !== null,
    lease: r.lease
      ? { ...r.lease, endDate: toDateOnly(r.lease.endDate), nextExitDate: toDateOnly(r.lease.nextExitDate), noticeDate: toDateOnly(r.lease.noticeDate) }
      : null,
    icpe: { holder: r.icpe?.holder ?? null, headingsCount: _count.icpeHeadings },
  }));
}

/**
 * The site index (statuses computed on read, for `today`).
 * @param today - Today's business date (injected; see todayDateOnly()).
 */
export async function getSiteIndex(today: Date): Promise<SiteIndexEntry[]> {
  return buildSiteIndex(await querySiteRows(), today);
}

/** Index and footprints in one query (map page). */
export async function getSiteData(today: Date): Promise<{ index: SiteIndexEntry[]; footprints: FootprintRecord[]; evaluatedOn: string }> {
  const rows = await querySiteRows();
  return { index: buildSiteIndex(rows, today), footprints: footprintsFromRows(rows), evaluatedOn: toIsoDate(today) ?? "" };
}

/** Building footprints of the non-archived sites (map pages). */
export async function getFootprints(): Promise<FootprintRecord[]> {
  const rows = await db.siteGeometry.findMany({
    where: { site: { archivedAt: null }, footprintGeoJson: { not: null } },
    select: { siteId: true, footprintGeoJson: true, heightM: true, site: { select: { code: true } } },
  });
  return footprintsFromRows(rows.map((r) => ({ id: r.siteId, code: r.site.code, geometry: { footprintGeoJson: r.footprintGeoJson, heightM: r.heightM } })));
}

/** An archived site (list reserved to administrators). */
export interface ArchivedSite {
  id: string;
  code: string;
  name: string;
  city: string | null;
  archivedAt: Date;
}

/** Archived sites, most recently archived first (`/sites?archived=1`, administrators). */
export async function getArchivedSites(): Promise<ArchivedSite[]> {
  const rows = await db.site.findMany({ where: { archivedAt: { not: null } }, select: { id: true, code: true, name: true, city: true, archivedAt: true }, orderBy: { archivedAt: "desc" } });
  return rows.map((r) => ({ ...r, archivedAt: r.archivedAt! }));
}
