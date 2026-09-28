import "server-only";
import { toDateOnly } from "@/domain/dates";
import type { MapSitesData } from "@/domain/map-dto";
import { db } from "../db";
import { buildMapSitesData, type MapSiteRow } from "./transform";

/**
 * Data of the national map: every NON-ARCHIVED site, read in one query with
 * the relations the compliance engine needs, then transformed by the pure
 * {@link buildMapSitesData}. The compliance status is computed on read and
 * never stored.
 *
 * @param today - Today's business date (injected; see todayDateOnly()).
 */
export async function getMapSites(today: Date): Promise<MapSitesData> {
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
      typology: true,
      operatingMode: true,
      logisticsOperator: true,
      latitude: true,
      longitude: true,
      lease: {
        select: { code: true, holdingEntity: true, endDate: true, nextExitDate: true, noticeDate: true, noticePeriodMonths: true, renewalConditionsSigned: true },
      },
      technical: { select: { surveyedTotalArea: true, totalWarehouseArea: true, socialOfficeArea: true, landArea: true, dockCount: true } },
      icpe: { select: { holder: true } },
      _count: { select: { icpeHeadings: true } },
      geometry: { select: { footprintGeoJson: true, heightM: true } },
    },
  });

  const mapped: MapSiteRow[] = rows.map((r) => ({
    ...r,
    hasCoordinates: r.latitude !== null && r.longitude !== null,
    lease: r.lease
      ? {
          ...r.lease,
          endDate: toDateOnly(r.lease.endDate),
          nextExitDate: toDateOnly(r.lease.nextExitDate),
          noticeDate: toDateOnly(r.lease.noticeDate),
        }
      : null,
    icpe: { holder: r.icpe?.holder ?? null, headingsCount: r._count.icpeHeadings },
  }));
  return buildMapSitesData(mapped, today);
}
