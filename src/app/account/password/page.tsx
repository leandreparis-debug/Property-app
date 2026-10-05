import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VigieLogo } from "@/components/brand/VigieLogo";
import { MapStage } from "@/components/shell/MapStage";
import { getCurrentUser } from "@/server/auth/current-user";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Changer le mot de passe" };

/**
 * Password change. Mandatory after a temporary password given by an
 * administrator (every page and API redirects or refuses until it is done);
 * also reachable from the user menu.
 */
export default async function PasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount%2Fpassword");
  return (
    <MapStage
      overlay={
        <main className="absolute inset-0 z-10 flex items-center justify-center px-4">
          <section aria-labelledby="password-title" className="glass w-full max-w-md rounded-lg p-8 shadow-panel">
            <header className="mb-6 flex flex-col items-center gap-3 text-center">
              <VigieLogo variant="vertical" size={48} />
              <h1 id="password-title" className="text-xl font-bold text-text">
                Changer le mot de passe
              </h1>
              <p className="text-sm text-text-muted">
                {user.mustChangePassword
                  ? "Votre mot de passe est temporaire : choisissez-en un nouveau pour continuer."
                  : `Compte ${user.email}. Toutes vos autres sessions seront fermées.`}
              </p>
            </header>
            <PasswordForm />
            <div className="mt-5 flex justify-center gap-4 text-sm">
              {!user.mustChangePassword && (
                <Link href="/" className="text-accent hover:underline">
                  Retour à la carte
                </Link>
              )}
              <form method="post" action="/api/auth/logout">
                <button type="submit" className="text-text-muted hover:text-text hover:underline">
                  Se déconnecter
                </button>
              </form>
            </div>
          </section>
        </main>
      }
    />
  );
}
