import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { EmptyState } from "@/components/empty/EmptyState";
import { PageContainer } from "@/components/shell/PageContainer";
import { requirePagePermission } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage() {
  await requirePagePermission("user:manage");
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
