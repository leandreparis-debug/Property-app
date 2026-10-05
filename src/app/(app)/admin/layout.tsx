import { forbidden } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { PageContainer } from "@/components/shell/PageContainer";
import { adminSectionsFor } from "@/config/admin";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/auth/permissions";
import { getExportFreshness } from "@/server/ops/overview";

/**
 * Administration space: secondary navigation (sections the user may open)
 * and content. Without any administration permission: « Accès refusé »
 * (403). Each page checks its own permission again.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sections = adminSectionsFor(user.role);
  if (sections.length === 0) forbidden();
  const freshness = can(user.role, "settings:manage") ? await getExportFreshness() : null;
  return (
    <PageContainer>
      <div className="grid grid-cols-[232px_minmax(0,1fr)] gap-8">
        <aside className="pt-1">
          <AdminNav allowed={sections.map((s) => s.href)} warnings={freshness?.stale ? { "/admin/operations": "Export en retard" } : {}} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </PageContainer>
  );
}
