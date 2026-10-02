"use server";

/**
 * Server Actions of the site sheet editing. Each one reads the session user
 * (`requireUser`) and delegates to the audited functions of `edit*.ts`, which
 * check the permissions themselves: the interface only hides what is not
 * allowed. Next.js checks the origin of Server Action requests.
 */
import { requireUser } from "../auth/current-user";
import { archiveSite, createSite, deleteListItem, saveAnnualMetrics, saveListItem, saveSiteSection, unarchiveSite } from "./edit";
import type { CreateSiteInput, ListItemInput, SaveMetricsInput, SaveSectionInput } from "./edit";

/** Saves the modified fields of a section (see `saveSiteSection`). */
export async function saveSiteSectionAction(input: SaveSectionInput) {
  return saveSiteSection(await requireUser(), input);
}

/** Saves yearly metric cells (see `saveAnnualMetrics`). */
export async function saveAnnualMetricsAction(input: SaveMetricsInput) {
  return saveAnnualMetrics(await requireUser(), input);
}

/** Adds or modifies a list row (see `saveListItem`). */
export async function saveListItemAction(input: ListItemInput) {
  return saveListItem(await requireUser(), input);
}

/** Deletes a list row (see `deleteListItem`). */
export async function deleteListItemAction(input: Omit<ListItemInput, "values">) {
  return deleteListItem(await requireUser(), input);
}

/** Creates a site (see `createSite`). */
export async function createSiteAction(input: CreateSiteInput) {
  return createSite(await requireUser(), input);
}

/** Archives a site, reason mandatory (see `archiveSite`). */
export async function archiveSiteAction(input: { siteId: string; reason: string }) {
  return archiveSite(await requireUser(), input);
}

/** Restores an archived site (see `unarchiveSite`). */
export async function unarchiveSiteAction(input: { siteId: string; reason?: string | null }) {
  return unarchiveSite(await requireUser(), input);
}
