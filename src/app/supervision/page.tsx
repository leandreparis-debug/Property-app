import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { EmptyState } from "@/components/empty/EmptyState";
import { PageContainer } from "@/components/shell/PageContainer";

export const metadata: Metadata = { title: "Supervision" };

export default function SupervisionPage() {
  return (
    <PageContainer className="flex items-center">
      <EmptyState
        icon={Activity}
        title="Supervision"
        description="La vue d'ensemble du parc : répartition des statuts de conformité, écarts critiques et points à surveiller, triés par gravité."
      />
    </PageContainer>
  );
}
