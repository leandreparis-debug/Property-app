import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { EmptyState } from "@/components/empty/EmptyState";
import { PageContainer } from "@/components/shell/PageContainer";

export const metadata: Metadata = { title: "Administration" };

export default function AdminPage() {
  return (
    <PageContainer className="flex items-center">
      <EmptyState
        icon={Settings}
        title="Administration"
        description="La gestion des utilisateurs et des rôles, l'import du tableur de référence et le journal d'audit des modifications."
      />
    </PageContainer>
  );
}
