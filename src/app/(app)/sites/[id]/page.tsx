import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Warehouse } from "lucide-react";
import { EmptyState } from "@/components/empty/EmptyState";
import { PageContainer } from "@/components/shell/PageContainer";
import { requireUser } from "@/server/auth/current-user";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Fiche entrepôt" };

/** Site record — placeholder until step 8. */
export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const site = await db.site.findFirst({ where: { id, archivedAt: null }, select: { code: true, name: true } });
  if (!site) notFound();
  return (
    <PageContainer className="flex items-center">
      <EmptyState
        icon={Warehouse}
        title="Fiche entrepôt — disponible prochainement"
        description={
          <>
            <span className="text-text">{site.name}</span> · <span className="numeric">{site.code}</span>
          </>
        }
      />
    </PageContainer>
  );
}
