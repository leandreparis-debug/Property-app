import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { EmptyState } from "@/components/empty/EmptyState";
import { PageContainer } from "@/components/shell/PageContainer";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageContainer className="flex items-center">
      <EmptyState
        icon={MapPinOff}
        title="Page introuvable"
        description="L'adresse demandée n'existe pas ou n'est plus disponible."
      >
        <Button asChild variant="secondary">
          <Link href="/">Retour à la carte</Link>
        </Button>
      </EmptyState>
    </PageContainer>
  );
}
