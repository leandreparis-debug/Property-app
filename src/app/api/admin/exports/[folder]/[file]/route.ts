import { parseExportFolderName } from "@/domain/export/retention";
import { jsonError, withApiAuth } from "@/server/auth/api";
import { can } from "@/server/auth/permissions";
import { EXPORT_FILE_NAMES, EXPORTS_DIR } from "@/server/exports/store";
import { fileDownload } from "@/server/http/download";
import { resolveStoragePath } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ folder: string; file: string }> };

/**
 * GET /api/admin/exports/[folder]/[file] — downloads one file of a nightly
 * export. The export is COMPLETE (financial data included): `export:read`
 * AND `finance:read` are required. Folder and file names are checked against
 * the export naming and the closed list of files, then resolved under
 * STORAGE_ROOT; attachment, `no-store`.
 */
export const GET = withApiAuth<Context>(
  async (_request, { params, user }) => {
    if (!can(user.role, "finance:read")) return jsonError(403, "Accès refusé.");
    const { folder, file } = await params;
    if (!parseExportFolderName(folder) || !(EXPORT_FILE_NAMES as readonly string[]).includes(file)) return jsonError(404, "Fichier introuvable.");
    const response = await fileDownload(resolveStoragePath(EXPORTS_DIR, folder, file), `vigie-${folder}-${file}`);
    return response ?? jsonError(404, "Fichier introuvable.");
  },
  { permission: "export:read" },
);
