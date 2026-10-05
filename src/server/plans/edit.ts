import "server-only";
import { z } from "zod";
import { toNumber } from "@/domain/derived";
import { DegenerateControlPointsError } from "@/domain/geometry";
import { controlPointsSchema, pixelToLngLat, solveCalibration } from "@/domain/plan/calibration";
import { distanceM } from "@/domain/equipment/catalog";
import type { SessionUser } from "../auth/session";
import { isWellFormedSiteId } from "../sites/detail";
import { Abort, assertAll, auditedTransaction, commentSchema, fail, lockSite, withForbidden, type Failure, type Tx } from "../sites/edit-common";

/**
 * Audited writes of the Plan tab: dock side of the volume, calibration of a
 * plan (with the recalculation of the equipments placed on it). The plan
 * itself is created by the document upload (category PLAN, see
 * documents/store.ts). Every function checks its permission; an archived
 * site is read-only.
 */

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,30}$/, { error: "Identifiant invalide." });

/** Refuses an unknown or archived site (inside the transaction, site row locked). */
export async function assertWritableSite(tx: Tx, siteId: string): Promise<void> {
  const site = await lockSite(tx, siteId);
  if (!site) throw new Abort(fail("not_found", "Site introuvable."));
  if (site.archived) throw new Abort(fail("archived", "Site archivé : consultation seule."));
}

const dockSideInput = z.object({ siteId: z.string(), dockSide: z.enum(["a", "b"], { error: "Côté des quais : A ou B." }), comment: commentSchema });

/**
 * Sets the long side carrying the docks (`site:write`). Creates the
 * `SiteGeometry` row (without footprint) when the site has none.
 * `volumeApproximate` is refreshed at the same time.
 * @param user - Acting user.
 * @param input - Site, side (`a` or `b`), optional reason.
 */
export async function setDockSide(user: SessionUser, input: z.input<typeof dockSideInput>): Promise<{ ok: true } | Failure> {
  return withForbidden(async () => {
    assertAll(user, ["site:write"]);
    const parsed = dockSideInput.safeParse(input);
    if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Requête invalide.");
    const { siteId, dockSide, comment } = parsed.data;
    if (!isWellFormedSiteId(siteId)) return fail("not_found", "Site introuvable.");
    const result = await auditedTransaction(user, comment, async (tx) => {
      await assertWritableSite(tx, siteId);
      const geometry = await tx.siteGeometry.findUnique({ where: { siteId }, select: { id: true, footprintGeoJson: true } });
      if (geometry) await tx.siteGeometry.update({ where: { id: geometry.id }, data: { dockSide, volumeApproximate: !geometry.footprintGeoJson } });
      else await tx.siteGeometry.create({ data: { siteId, dockSide, volumeApproximate: true } });
      return true as const;
    });
    return result === true ? { ok: true } : result;
  });
}

const calibrationInput = z.object({
  planId: ID,
  points: controlPointsSchema,
  opacity: z.number().min(0).max(1).optional(),
  /** Required when the RMS error exceeds 3 m (« Vérifiez les points »). */
  confirmLowQuality: z.boolean().optional(),
  comment: commentSchema,
});

/** Result of {@link savePlanCalibration}. */
export interface CalibrationSaved {
  ok: true;
  rmsErrorM: number;
  /** Equipments of the plan whose position was recalculated. */
  moved: number;
  /** Mean displacement of those equipments (m). */
  meanShiftM: number;
}

/**
 * Saves the calibration of a plan (`plan:calibrate`): control points,
 * transform, RMS error, rotation, date and author. The equipments placed on
 * this plan (`planX`/`planY`) get their latitude / longitude RECALCULATED in
 * the same transaction, under the same audit batch.
 * @param user - Acting user.
 * @param input - Plan, at least 3 control points, optional opacity and reason.
 */
export async function savePlanCalibration(user: SessionUser, input: z.input<typeof calibrationInput>): Promise<CalibrationSaved | Failure> {
  return withForbidden(async () => {
    assertAll(user, ["plan:calibrate"]);
    const parsed = calibrationInput.safeParse(input);
    if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "Points de contrôle invalides.");
    const { planId, points, opacity, confirmLowQuality, comment } = parsed.data;
    let calibration;
    try {
      calibration = solveCalibration(points);
    } catch (error) {
      if (error instanceof DegenerateControlPointsError) return fail("invalid", error.message);
      throw error;
    }
    if (calibration.quality === "check" && !confirmLowQuality) {
      return fail("warnings", `Erreur moyenne de ${calibration.rmsErrorM.toFixed(1)} m : vérifiez les points, ou confirmez l'enregistrement.`);
    }
    const { matrix } = calibration;
    return auditedTransaction(user, comment, async (tx) => {
      const plan = await tx.sitePlan.findUnique({ where: { id: planId }, select: { id: true, siteId: true } });
      if (!plan) throw new Abort(fail("not_found", "Plan introuvable."));
      await assertWritableSite(tx, plan.siteId);
      await tx.sitePlan.update({
        where: { id: plan.id },
        data: {
          controlPointsJson: JSON.stringify(points),
          transformJson: JSON.stringify({ matrix }),
          rmsErrorM: Math.round(calibration.rmsErrorM * 100) / 100,
          rotationDeg: Math.round(calibration.rotationDeg * 100) / 100,
          calibratedAt: new Date(),
          calibratedById: user.id,
          ...(opacity !== undefined ? { opacity: Math.round(opacity * 100) / 100 } : {}),
        },
      });
      // Recalibration: the equipments placed on this plan follow it.
      const equipments = await tx.equipment.findMany({
        where: { planId: plan.id, archivedAt: null, planX: { not: null }, planY: { not: null } },
        select: { id: true, planX: true, planY: true, latitude: true, longitude: true },
      });
      let shift = 0;
      for (const e of equipments) {
        const [lon, lat] = pixelToLngLat(matrix, [toNumber(e.planX)!, toNumber(e.planY)!]);
        const before = toNumber(e.longitude) !== null && toNumber(e.latitude) !== null ? ([toNumber(e.longitude)!, toNumber(e.latitude)!] as const) : null;
        if (before) shift += distanceM(before, [lon, lat]);
        await tx.equipment.update({ where: { id: e.id }, data: { latitude: round6(lat), longitude: round6(lon) } });
      }
      return { ok: true as const, rmsErrorM: calibration.rmsErrorM, moved: equipments.length, meanShiftM: equipments.length ? shift / equipments.length : 0 };
    });
  });
}

/** Coordinates are stored with 6 decimals (≈ 0.1 m). */
export const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
