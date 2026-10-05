import "server-only";
import { z } from "zod";
import { runWithAuditContext } from "./audit/context";
import { assertCan } from "./auth/permissions";
import type { SessionUser } from "./auth/session";
import { db } from "./db";
import { newBatchId } from "./sites/edit-common";

/**
 * Application settings (table `app_settings`, audited): a closed list of
 * keys, each with its zod schema and default value. Changed only with
 * `settings:manage`.
 */

/** Type of the value of each setting. */
export interface SettingValues {
  /** The spreadsheet import is locked: the database is the source of truth. */
  "import.locked": boolean;
}

/** A setting key. */
export type SettingKey = keyof SettingValues;

/** Every setting, its schema and its default. */
export const SETTINGS: { readonly [K in SettingKey]: { schema: z.ZodType<SettingValues[K]>; defaultValue: SettingValues[K] } } = {
  "import.locked": { schema: z.boolean(), defaultValue: false },
};

/** Message of the import lock (banner and CLI refusal). */
export const IMPORT_LOCKED_MESSAGE = "La base est la source de vérité. Ne plus réimporter le tableur.";

/**
 * Value of a setting (the default when absent or unreadable).
 * @param key - Setting key.
 */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
  const def = SETTINGS[key];
  const row = await db.appSetting.findUnique({ where: { key }, select: { valueJson: true } });
  if (!row) return def.defaultValue;
  try {
    const parsed = def.schema.safeParse(JSON.parse(row.valueJson));
    return parsed.success ? parsed.data : def.defaultValue;
  } catch {
    return def.defaultValue;
  }
}

/**
 * Changes a setting (`settings:manage`), audited with the actor and the optional reason.
 * @param actor - Administrator.
 * @param key - Setting key.
 * @param value - New value (checked by the setting's schema).
 * @param comment - Optional reason.
 */
export async function setSetting<K extends SettingKey>(actor: SessionUser, key: K, value: SettingValues[K], comment?: string | null): Promise<void> {
  assertCan(actor.role, "settings:manage");
  const valueJson = JSON.stringify(SETTINGS[key].schema.parse(value));
  await runWithAuditContext({ actorId: actor.id, source: "ui", batchId: newBatchId(), comment: comment?.trim().slice(0, 500) || null }, () =>
    db.appSetting.upsert({ where: { key }, create: { key, valueJson, updatedById: actor.id }, update: { valueJson, updatedById: actor.id } }),
  );
}

/** Whether real spreadsheet imports are locked. */
export function isImportLocked(): Promise<boolean> {
  return getSetting("import.locked");
}
