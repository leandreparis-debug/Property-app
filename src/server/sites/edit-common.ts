import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { todayDateOnly } from "@/domain/dates";
import { fieldsOfSection, type FieldSection } from "@/domain/fields";
import type { CrossFieldFinding } from "@/domain/fields/validation";
import type { FormValue, WireValue } from "@/domain/fields/wire";
import type { ComplianceStatus } from "@/lib/status";
import { runWithAuditContext } from "../audit/context";
import { can, ForbiddenError, type Action } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import { getSiteDetail } from "./detail";

/** Helpers shared by the edit modules (sections, metrics, lists, lifecycle). */

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
/** Maximum length of the reason of a change. */
export const COMMENT_MAX = 500;

/** A failed operation (French message for the user). */
export interface Failure {
  ok: false;
  reason: "forbidden" | "not_found" | "archived" | "invalid" | "refused" | "conflict" | "cross_errors" | "warnings" | "duplicate";
  message: string;
  /** Per-field messages (`key` → message). */
  fieldErrors?: Record<string, string>;
  conflicts?: ConflictInfo[];
  warnings?: CrossFieldFinding[];
}

/** A field changed by someone else since the form was opened. */
export interface ConflictInfo {
  field: string;
  labelFr: string;
  /** What the user typed. */
  yours: FormValue;
  yoursText: string;
  /** Current value (to send back as `from` for « Remplacer par la mienne »). */
  theirs: WireValue;
  theirsText: string;
  /** Who changed it and when (last audit line of the field). */
  by: string | null;
  at: string | null;
  comment: string | null;
}

/** New status of the site after a save. */
export interface StatusChange {
  before: ComplianceStatus;
  after: ComplianceStatus;
}

export const fail = (reason: Failure["reason"], message: string, extra: Partial<Failure> = {}): Failure => ({ ok: false, reason, message, ...extra });

/** Random id of one save (all its audit lines share it). */
export function newBatchId(): string {
  return `ui_${randomBytes(12).toString("hex")}`;
}

export const commentSchema = z
  .string()
  .max(COMMENT_MAX, { error: `Motif : ${COMMENT_MAX} caractères au maximum.` })
  .optional()
  .nullable()
  .transform((v) => (v?.trim() ? v.trim() : null));

/** Throws {@link ForbiddenError} unless the user has every action. */
export function assertAll(user: SessionUser, actions: readonly Action[]): void {
  for (const action of actions) if (!can(user.role, action)) throw new ForbiddenError(action);
}

/** Permissions needed to edit a section: `site:write`, plus `finance:read` for financial data. */
export function sectionPermissions(section: FieldSection): Action[] {
  return fieldsOfSection(section).some((f) => f.financial) ? ["site:write", "finance:read"] : ["site:write"];
}

/** Current compliance status of a site. */
export async function statusOf(siteId: string): Promise<ComplianceStatus> {
  return (await getSiteDetail(siteId, todayDateOnly()))?.evaluation.status ?? "unknown";
}

/**
 * Locks the site row for the transaction (UPDLOCK): concurrent saves on the
 * same site are serialized, so the conflict check and the write are atomic.
 * @returns The site, or `null` when unknown.
 */
export async function lockSite(tx: Tx, siteId: string): Promise<{ id: string; code: string; archived: boolean } | null> {
  const rows = await tx.$queryRaw<{ id: string; code: string; archived_at: Date | null }[]>`
    SELECT id, code, archived_at FROM sites WITH (UPDLOCK, ROWLOCK) WHERE id = ${siteId}`;
  const row = rows[0];
  return row ? { id: row.id, code: row.code, archived: row.archived_at !== null } : null;
}

export async function withForbidden<T>(fn: () => Promise<T | Failure>): Promise<T | Failure> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ForbiddenError) return fail("forbidden", "Action non autorisée pour votre rôle.");
    throw error;
  }
}

export class Abort extends Error {
  constructor(readonly failure: Failure) {
    super(failure.message);
  }
}

/** Runs `fn` in an audited transaction; an {@link Abort} rolls back and becomes the result. */
export async function auditedTransaction<T>(user: SessionUser, comment: string | null, fn: (tx: Tx) => Promise<T>): Promise<T | Failure> {
  try {
    return await runWithAuditContext({ actorId: user.id, source: "ui", batchId: newBatchId(), comment }, () => db.$transaction((tx) => fn(tx)));
  } catch (error) {
    if (error instanceof Abort) return error.failure;
    throw error;
  }
}

