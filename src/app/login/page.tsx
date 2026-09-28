import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VigieLogo } from "@/components/brand/VigieLogo";
import { MapStage } from "@/components/shell/MapStage";
import { APP_TAGLINE } from "@/config/app";
import { getCurrentUser } from "@/server/auth/current-user";
import { safeRedirectPath } from "@/server/auth/safe-redirect";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

/** Login page: glass panel centred on the map stage. Already signed in → `/`. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  if (await getCurrentUser()) redirect("/");
  const next = safeRedirectPath((await searchParams).next);

  return (
    <MapStage
      overlay={
        <main className="absolute inset-0 z-10 flex items-center justify-center px-4">
          <section aria-labelledby="login-title" className="glass w-full max-w-sm rounded-lg p-8 shadow-panel">
            <header className="mb-7 flex flex-col items-center gap-3 text-center">
              <h1 id="login-title">
                <VigieLogo variant="vertical" size={64} />
              </h1>
              <p className="text-sm text-text-muted">{APP_TAGLINE}</p>
            </header>
            <LoginForm next={next} />
          </section>
        </main>
      }
    />
  );
}
