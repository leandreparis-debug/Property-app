import { parseAuditFilters } from "@/domain/audit/view";
import { withApiAuth } from "@/server/auth/api";
import { exportAuditJournal } from "@/server/exports/on-demand";
import { contentDownload } from "@/server/http/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/exports/audit?<filtres> — exports the filtered audit journal as
 * CSV (`audit:read`), at most 50 000 lines (header `X-Vigie-Truncated: 1`
 * when the cap is reached), financial values masked without `finance:read`.
 * Attachment, `no-store`; traced in the audit journal.
 */
export const GET = withApiAuth(
  async (request, { user }) => {
    const filters = parseAuditFilters(Object.fromEntries(new URL(request.url).searchParams));
    const file = await exportAuditJournal(user, filters);
    const response = contentDownload(file.content, file.fileName);
    response.headers.set("X-Vigie-Rows", String(file.rows));
    if (file.truncated) response.headers.set("X-Vigie-Truncated", "1");
    return response;
  },
  { permission: "audit:read" },
);
