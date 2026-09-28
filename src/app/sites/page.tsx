import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/empty/EmptyState";
import { PageContainer } from "@/components/shell/PageContainer";

export const metadata: Metadata = { title: "Sites" };

export default function SitesPage() {
  return (
    <PageContainer className="flex items-center">
      <EmptyState
        icon={Building2}
        title="Sites"
        description="La liste de tous les entrepôts, triable et filtrable : identification, surfaces, statut de conformité et accès à la fiche détaillée de chaque site."
      />
    </PageContainer>
  );
}
