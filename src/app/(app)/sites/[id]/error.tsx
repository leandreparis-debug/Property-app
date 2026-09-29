"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/empty/EmptyState";
import { PageContainer } from "@/components/shell/PageContainer";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/app";

/** Unexpected error while rendering the site sheet: generic message, never the technical detail. */
export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer className="flex items-center">
      <EmptyState icon={TriangleAlert} title="La fiche n'a pas pu être affichée" description={`Une erreur inattendue est survenue. Réessayez ; si le problème persiste, contactez l'administrateur de ${APP_NAME}.`}>
        <Button variant="secondary" onClick={reset}>
          Réessayer
        </Button>
      </EmptyState>
    </PageContainer>
  );
}
