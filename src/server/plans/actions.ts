"use server";

/**
 * Server Actions of the Plan tab. Each one reads the session user
 * (`requireUser`) and delegates to the audited functions of plans/edit.ts
 * and equipment/edit.ts, which check the permissions themselves.
 */
import { requireUser } from "../auth/current-user";
import { archiveEquipment, createEquipment, moveEquipment, updateEquipment } from "../equipment/edit";
import { savePlanCalibration, setDockSide } from "./edit";

type Input<F extends (user: never, input: never) => unknown> = Parameters<F>[1];

/** Saves the calibration of a plan (see `savePlanCalibration`). */
export async function savePlanCalibrationAction(input: Input<typeof savePlanCalibration>) {
  return savePlanCalibration(await requireUser(), input);
}

/** Sets the side of the docks (see `setDockSide`). */
export async function setDockSideAction(input: Input<typeof setDockSide>) {
  return setDockSide(await requireUser(), input);
}

/** Creates an equipment (see `createEquipment`). */
export async function createEquipmentAction(input: Input<typeof createEquipment>) {
  return createEquipment(await requireUser(), input);
}

/** Updates an equipment (see `updateEquipment`). */
export async function updateEquipmentAction(input: Input<typeof updateEquipment>) {
  return updateEquipment(await requireUser(), input);
}

/** Moves an equipment (see `moveEquipment`). */
export async function moveEquipmentAction(input: Input<typeof moveEquipment>) {
  return moveEquipment(await requireUser(), input);
}

/** Archives an equipment (see `archiveEquipment`). */
export async function archiveEquipmentAction(input: Input<typeof archiveEquipment>) {
  return archiveEquipment(await requireUser(), input);
}
