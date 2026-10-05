import { jsonError, withApiAuth } from "@/server/auth/api";
import { fileDownload } from "@/server/http/download";
import { importReportPath } from "@/server/import/history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ run: string; file: string }> };

/**
 * GET /api/admin/imports/[run]/[file] — downloads one report file of an
 * import or a simulation (`import:run`). Closed list of files, path resolved
 * under STORAGE_ROOT; attachment, `no-store`.
 */
export const GET = withApiAuth<Context>(
  async (_request, { params }) => {
    const { run, file } = await params;
    const path = await importReportPath(run, file);
    const response = path ? await fileDownload(path, `import-${run}-${file}`) : null;
    return response ?? jsonError(404, "Rapport introuvable.");
  },
  { permission: "import:run" },
);
