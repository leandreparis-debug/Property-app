import "server-only";
import { z } from "zod";
import { toNumber } from "@/domain/derived";
import { equipmentTypeSchema, MAX_EQUIPMENT_DISTANCE_M, nextEquipmentLabel, withinSiteRadius } from "@/domain/equipment/catalog";
import { lngLatToPixel, parseStoredCalibration } from "@/domain/plan/calibration";
import type { SessionUser } from "../auth/session";
import { assertWritableSite, round6 } from "../plans/edit";
import { parseFootprint } from "../sites/build";
import { isWellFormedSiteId } from "../sites/detail";
import { Abort, assertAll, auditedTransaction, commentSchema, fail, withForbidden, type Failure, type Tx } from "../sites/edit-common";

/**
 * Audited equipment writes (`equipment:write`): create, move, update,
 * archive. Latitude / longitude are ALWAYS stored; when the equipment is
 * placed on a calibrated plan, `planX`/`planY` (pixels) are stored too, from
 * the inverse transform, so a recalibration moves it with the plan. Every
 * position must be within 1 km of the site; an archived site is read-only.
 */

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,30}$/, { error: "Identifiant invalide." });
const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)], { error: "Position invalide." });
const optionalText = (max: number, label: string) =>
  z
    .string()
    .max(max, { error: `${label} : ${max} caractères au maximum.` })
    .optional()
    .nullable()
    .transform((v) => (v?.trim() ? v.trim() : null));
const installedAt = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date de mise en service invalide (AAAA-MM-JJ)." })
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), { error: "Date de mise en service invalide." });

const attributes = {
  label: optionalText(200, "Libellé"),
  reference: optionalText(100, "Référence"),
  level: optionalText(50, "Niveau"),
  installedAt,
  notes: optionalText(4000, "Notes"),
};

/** Center of a site: its coordinates, else the middle of its footprint's bounding box. */
async function siteCenter(tx: Tx, siteId: string): Promise<[number, number] | null> {
  const site = await tx.site.findUnique({ where: { id: siteId }, select: { latitude: true, longitude: true, geometry: { select: { footprintGeoJson: true } } } });
  const lat = toNumber(site?.latitude);
  const lon = toNumber(site?.longitude);
  if (lat !== null && lon !== null) return [lon, lat];
  const shape = parseFootprint(site?.geometry?.footprintGeoJson);
  if (!shape) return null;
  const positions = (shape.type === "Polygon" ? [shape.coordinates] : shape.coordinates).flat(2);
  const lons = positions.map((p) => p[0]!);
  const lats = positions.map((p) => p[1]!);
  return [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

async function assertWithinRadius(tx: Tx, siteId: string, position: readonly [number, number]): Promise<void> {
  const center = await siteCenter(tx, siteId);
  if (!center) throw new Abort(fail("refused", "Coordonnées du site non renseignées : impossible de positionner un équipement."));
  if (!withinSiteRadius(position, center)) throw new Abort(fail("refused", `Position hors du site : ${MAX_EQUIPMENT_DISTANCE_M / 1000} km au maximum autour du site.`));
}

/** Plan pixels of a position on a calibrated plan of the site (null when not placed on a plan). */
async function planPosition(tx: Tx, siteId: string, planId: string | null | undefined, position: readonly [number, number]) {
  if (!planId) return { planId: null, planX: null, planY: null };
  const plan = await tx.sitePlan.findUnique({ where: { id: planId }, select: { siteId: true, controlPointsJson: true, transformJson: true } });
  const calibration = plan && plan.siteId === siteId ? parseStoredCalibration(plan.controlPointsJson, plan.transformJson) : null;
  if (!calibration) throw new Abort(fail("invalid", "Plan non calibré : placez l'équipement sur la carte."));
  const [x, y] = lngLatToPixel(calibration.matrix, position);
  return { planId, planX: Math.round(x * 1e4) / 1e4, planY: Math.round(y * 1e4) / 1e4 };
}

async function lockEquipment(tx: Tx, equipmentId: string) {
  const equipment = await tx.equipment.findUnique({ where: { id: equipmentId }, select: { id: true, siteId: true, planId: true, archivedAt: true } });
  if (!equipment) throw new Abort(fail("not_found", "Équipement introuvable."));
  await assertWritableSite(tx, equipment.siteId);
  if (equipment.archivedAt) throw new Abort(fail("invalid", "Équipement archivé."));
  return equipment;
}

const invalid = (error: z.ZodError): Failure => fail("invalid", error.issues[0]?.message ?? "Valeurs invalides.");

const createInput = z.object({ siteId: z.string(), type: equipmentTypeSchema, lngLat, planId: ID.optional().nullable(), ...attributes, comment: commentSchema });

/**
 * Creates an equipment. Without label, the next automatic one (« RIA 4 »).
 * @param user - Acting user (`equipment:write`).
 * @param input - Site, type code, position, plan (when placed on a calibrated plan), attributes.
 * @returns The new id and label.
 */
export async function createEquipment(user: SessionUser, input: z.input<typeof createInput>): Promise<{ ok: true; id: string; label: string } | Failure> {
  return withForbidden(async () => {
    assertAll(user, ["equipment:write"]);
    const parsed = createInput.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { siteId, type, lngLat: position, planId, comment, ...attrs } = parsed.data;
    if (!isWellFormedSiteId(siteId)) return fail("not_found", "Site introuvable.");
    return auditedTransaction(user, comment, async (tx) => {
      await assertWritableSite(tx, siteId);
      await assertWithinRadius(tx, siteId, position);
      const onPlan = await planPosition(tx, siteId, planId, position);
      let label = attrs.label;
      if (!label) {
        const existing = await tx.equipment.findMany({ where: { siteId, type }, select: { label: true } });
        label = nextEquipmentLabel(type, existing.map((e) => e.label));
      }
      const created = await tx.equipment.create({
        data: { siteId, type, ...attrs, label, ...onPlan, latitude: round6(position[1]), longitude: round6(position[0]) },
        select: { id: true, label: true },
      });
      return { ok: true as const, id: created.id, label: created.label ?? label };
    });
  });
}

const moveInput = z.object({ equipmentId: ID, lngLat, comment: commentSchema });

/**
 * Moves an equipment (drag and drop or keyboard). When it is placed on a
 * calibrated plan, its plan pixels are recalculated too.
 * @param user - Acting user (`equipment:write`).
 * @param input - Equipment, new position, optional reason.
 */
export async function moveEquipment(user: SessionUser, input: z.input<typeof moveInput>): Promise<{ ok: true } | Failure> {
  return withForbidden(async () => {
    assertAll(user, ["equipment:write"]);
    const parsed = moveInput.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { equipmentId, lngLat: position, comment } = parsed.data;
    const result = await auditedTransaction(user, comment, async (tx) => {
      const equipment = await lockEquipment(tx, equipmentId);
      await assertWithinRadius(tx, equipment.siteId, position);
      const onPlan = await planPosition(tx, equipment.siteId, equipment.planId, position);
      await tx.equipment.update({ where: { id: equipment.id }, data: { ...onPlan, latitude: round6(position[1]), longitude: round6(position[0]) } });
      return true as const;
    });
    return result === true ? { ok: true } : result;
  });
}

const updateInput = z.object({ equipmentId: ID, type: equipmentTypeSchema.optional(), ...attributes, comment: commentSchema });

/**
 * Updates the attributes of an equipment (type, label, reference, level,
 * commissioning date, notes). Empty values clear the field.
 * @param user - Acting user (`equipment:write`).
 * @param input - Equipment and attributes.
 */
export async function updateEquipment(user: SessionUser, input: z.input<typeof updateInput>): Promise<{ ok: true } | Failure> {
  return withForbidden(async () => {
    assertAll(user, ["equipment:write"]);
    const parsed = updateInput.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { equipmentId, comment, type, ...attrs } = parsed.data;
    if (!attrs.label) return fail("invalid", "Libellé obligatoire.");
    const result = await auditedTransaction(user, comment, async (tx) => {
      const equipment = await lockEquipment(tx, equipmentId);
      await tx.equipment.update({ where: { id: equipment.id }, data: { ...attrs, ...(type ? { type } : {}) } });
      return true as const;
    });
    return result === true ? { ok: true } : result;
  });
}

const archiveInput = z.object({ equipmentId: ID, comment: commentSchema });

/**
 * Archives an equipment (`archivedAt`); it disappears from the plan and the
 * list, its history stays in the audit journal.
 * @param user - Acting user (`equipment:write`).
 * @param input - Equipment and optional reason.
 */
export async function archiveEquipment(user: SessionUser, input: z.input<typeof archiveInput>): Promise<{ ok: true } | Failure> {
  return withForbidden(async () => {
    assertAll(user, ["equipment:write"]);
    const parsed = archiveInput.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const result = await auditedTransaction(user, parsed.data.comment, async (tx) => {
      const equipment = await lockEquipment(tx, parsed.data.equipmentId);
      await tx.equipment.update({ where: { id: equipment.id }, data: { archivedAt: new Date() } });
      return true as const;
    });
    return result === true ? { ok: true } : result;
  });
}
