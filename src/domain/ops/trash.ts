/**
 * Planning of the trash purge (job `purge-trash`), PURE.
 *
 * A deleted document is moved to `STORAGE_ROOT/trash/documents/` under the
 * name `<horodatage ISO, « : » et « . » remplacés par « - »>-<nom stocké>`
 * (see `src/server/documents/store.ts`). The deletion date is read from that
 * prefix; the file's modification date is the fallback.
 */

/** A file found in the trash. */
export interface TrashEntry {
  /** Path relative to the storage root (`trash/documents/…`). */
  path: string;
  /** File name. */
  name: string;
  /** Size in bytes. */
  sizeBytes: number;
  /** Modification date of the file (fallback of the deletion date). */
  modifiedAt: Date;
}

/** A file to erase. */
export interface TrashPurgeItem extends TrashEntry {
  /** When it was moved to the trash. */
  trashedAt: Date;
  /** Id of the deleted document, when the name carries it. */
  documentId: string | null;
}

const PREFIX = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(.+)$/;

/**
 * Deletion date and original stored name encoded in a trash file name.
 * @returns `null` when the name has no timestamp prefix.
 */
export function parseTrashName(name: string): { trashedAt: Date; storedName: string } | null {
  const m = PREFIX.exec(name);
  if (!m) return null;
  const trashedAt = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return Number.isNaN(trashedAt.getTime()) ? null : { trashedAt, storedName: m[6]! };
}

/** Document id of a stored name (`doc<hex>.<ext>` → `doc<hex>`). */
export function documentIdOf(storedName: string): string | null {
  const id = storedName.replace(/\.[A-Za-z0-9]+$/, "");
  return /^[A-Za-z0-9_-]{1,30}$/.test(id) ? id : null;
}

/**
 * Files to erase: moved to the trash more than `retentionDays` days ago.
 * @param entries - Files found in the trash.
 * @param now - Current instant.
 * @param retentionDays - TRASH_RETENTION_DAYS.
 */
export function planTrashPurge(entries: readonly TrashEntry[], now: Date, retentionDays: number): TrashPurgeItem[] {
  const limit = now.getTime() - retentionDays * 86_400_000;
  return entries
    .map((entry): TrashPurgeItem => {
      const parsed = parseTrashName(entry.name);
      return {
        ...entry,
        trashedAt: parsed?.trashedAt ?? entry.modifiedAt,
        documentId: parsed ? documentIdOf(parsed.storedName) : null,
      };
    })
    .filter((item) => item.trashedAt.getTime() < limit)
    .sort((a, b) => a.trashedAt.getTime() - b.trashedAt.getTime());
}
