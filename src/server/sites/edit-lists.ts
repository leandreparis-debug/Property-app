import "server-only";
import { z } from "zod";
import { ExternalSystem } from "@/domain/enums";
import { LIST_SCHEMAS, type ListKind } from "@/domain/fields/lists";
import { fieldErrors } from "@/domain/fields/validation";
import type { SessionUser } from "../auth/session";
import { isWellFormedSiteId } from "./detail";
import { Abort, assertAll, auditedTransaction, commentSchema, fail, lockSite, withForbidden, type Failure, type Tx } from "./edit-common";

export type { ListKind } from "@/domain/fields/lists";

const baseInput = z.object({
  siteId: z.string().min(1).max(30),
  kind: z.enum(["icpeHeading", "buildingWork", "externalId"]),
  /** Row to modify or delete; absent to add a row. */
  id: z.string().min(1).max(30).optional(),
  comment: commentSchema,
});

/** Input of {@link saveListItem}: the row values as typed in the form. */
export type ListItemInput = z.input<typeof baseInput> & { values: Record<string, unknown> };

/** Result of the list actions. */
export type ListResult = { ok: true; id: string } | Failure;

const MODEL: Readonly<Record<ListKind, "icpeHeading" | "buildingWork" | "siteExternalId">> = {
  icpeHeading: "icpeHeading",
  buildingWork: "buildingWork",
  externalId: "siteExternalId",
};

type ListDelegate = {
  findFirst(args: unknown): Promise<{ id: string } | null>;
  create(args: unknown): Promise<{ id: string }>;
  update(args: unknown): Promise<{ id: string }>;
  delete(args: unknown): Promise<{ id: string }>;
};
const delegate = (tx: Tx, kind: ListKind) => (tx as unknown as Record<string, ListDelegate>)[MODEL[kind]]!;

/** Database data of a validated row. */
function dataOf(kind: ListKind, values: z.infer<(typeof LIST_SCHEMAS)[ListKind]>): Record<string, unknown> {
  if (kind === "buildingWork") {
    const v = values as z.infer<(typeof LIST_SCHEMAS)["buildingWork"]>;
    return { kind: v.kind, date: v.date.date, datePrecision: v.date.precision, description: v.description };
  }
  return values as Record<string, unknown>;
}

/**
 * Adds (`id` absent) or modifies one row of a list of the site — ICPE
 * headings, building works or external ids — audited, with the optional
 * reason. External ids are unique per system across ALL sites: a value
 * already used elsewhere is refused with the code of the owner site.
 * @param user - Acting user (`site:write`).
 * @param input - Site, list, optional row id, typed values, reason.
 */
export async function saveListItem(user: SessionUser, input: ListItemInput): Promise<ListResult> {
  return withForbidden(async () => {
    const base = baseInput.safeParse(input);
    if (!base.success) return fail("invalid", base.error.issues[0]?.message ?? "Requête invalide.");
    assertAll(user, ["site:write"]);
    const { siteId, kind, id, comment } = base.data;
    if (!isWellFormedSiteId(siteId)) return fail("not_found", "Site introuvable.");
    const parsed = LIST_SCHEMAS[kind].safeParse(input.values ?? {});
    if (!parsed.success) return fail("invalid", "Certaines valeurs sont invalides.", { fieldErrors: fieldErrors(parsed.error) });
    const data = dataOf(kind, parsed.data);

    const result = await auditedTransaction(user, comment, async (tx) => {
      const site = await lockSite(tx, siteId);
      if (!site) throw new Abort(fail("not_found", "Site introuvable."));
      if (site.archived) throw new Abort(fail("archived", "Site archivé : le désarchiver avant de le modifier."));
      if (kind === "externalId") {
        const v = parsed.data as z.infer<(typeof LIST_SCHEMAS)["externalId"]>;
        const owner = await tx.siteExternalId.findFirst({ where: { system: v.system, value: v.value, ...(id ? { NOT: { id } } : {}) }, select: { site: { select: { code: true } } } });
        if (owner) {
          const message = `La valeur « ${v.value} » (${ExternalSystem.label(v.system)}) est déjà utilisée par le site ${owner.site.code}.`;
          throw new Abort(fail("duplicate", message, { fieldErrors: { value: message } }));
        }
      }
      const rows = delegate(tx, kind);
      if (id) {
        const existing = await rows.findFirst({ where: { id, siteId } });
        if (!existing) throw new Abort(fail("not_found", "Ligne introuvable (supprimée entre-temps ?)."));
        await rows.update({ where: { id }, data });
        await tx.site.update({ where: { id: siteId }, data: { version: { increment: 1 } } });
        return id;
      }
      const created = await rows.create({ data: { ...data, siteId } });
      await tx.site.update({ where: { id: siteId }, data: { version: { increment: 1 } } });
      return created.id;
    });
    return typeof result === "string" ? { ok: true, id: result } : result;
  });
}

/**
 * Deletes one row of a list (audited, with the optional reason).
 * @param user - Acting user (`site:write`).
 * @param input - Site, list, row id, reason.
 */
export async function deleteListItem(user: SessionUser, input: z.input<typeof baseInput>): Promise<ListResult> {
  return withForbidden(async () => {
    const base = baseInput.safeParse(input);
    if (!base.success || !base.data.id) return fail("invalid", "Requête invalide.");
    assertAll(user, ["site:write"]);
    const { siteId, kind, id, comment } = base.data;
    const result = await auditedTransaction(user, comment, async (tx) => {
      const site = await lockSite(tx, siteId);
      if (!site) throw new Abort(fail("not_found", "Site introuvable."));
      if (site.archived) throw new Abort(fail("archived", "Site archivé : le désarchiver avant de le modifier."));
      const rows = delegate(tx, kind);
      const existing = await rows.findFirst({ where: { id, siteId } });
      if (!existing) throw new Abort(fail("not_found", "Ligne introuvable (supprimée entre-temps ?)."));
      await rows.delete({ where: { id } });
      await tx.site.update({ where: { id: siteId }, data: { version: { increment: 1 } } });
      return id!;
    });
    return typeof result === "string" ? { ok: true, id: result } : result;
  });
}
