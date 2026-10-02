import Link from "next/link";
import { ShieldX } from "lucide-react";
import { EmptyState } from "@/components/empty/EmptyState";
import { Button } from "@/components/ui/button";

/** « Accès refusé » page (HTTP 403), rendered by `forbidden()`. */
export default function Forbidden() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <EmptyState
        icon={ShieldX}
        title="Accès refusé"
        description="Votre rôle ne permet pas d'accéder à cette page. Contactez un administrateur si vous pensez qu'il s'agit d'une erreur."
      >
        <Button asChild variant="secondary">
          <Link href="/">Retour à la carte</Link>
        </Button>
      </EmptyState>
    </main>
  );
}
