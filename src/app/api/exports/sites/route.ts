import { withApiAuth } from "@/server/auth/api";
import { exportSiteList } from "@/server/exports/on-demand";
import { contentDownload } from "@/server/http/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/exports/sites?format=xlsx|csv&<filtres> — exports the site list
 * as filtered on `/sites` (`export:read`); financial columns only with
 * `finance:read`. Attachment, `no-store`; traced in the audit journal.
 */
export const GET = withApiAuth(
  async (request, { user }) => {
    const params = new URL(request.url).searchParams;
    const format = params.get("format") === "csv" ? "csv" : "xlsx";
    const file = await exportSiteList(user, params, format);
    return contentDownload(file.content, file.fileName);
  },
  { permission: "export:read" },
);
