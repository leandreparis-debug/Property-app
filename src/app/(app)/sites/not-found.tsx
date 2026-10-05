import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty/EmptyState";
import { PageContainer } from "@/components/shell/PageContainer";
import { Button } from "@/components/ui/button";

/** Unknown or malformed site id (HTTP 404, no technical detail). */
export default function SiteNotFound() {
  return (
    <PageContainer className="flex items-center">
      <EmptyState icon={SearchX} title="Site introuvable" description="Ce site n'existe pas ou n'est plus accessible.">
        <Button asChild variant="secondary">
          <Link href="/sites">Retour à la liste des sites</Link>
        </Button>
      </EmptyState>
    </PageContainer>
  );
}
