import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MapStage } from "@/components/shell/MapStage";
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
            <header className="mb-7 flex flex-col gap-1.5">
              <div
                aria-hidden="true"
                className="mb-3 flex size-10 items-center justify-center rounded-md border border-border-strong bg-surface-2 text-base font-semibold text-text"
              >
                A
              </div>
              <h1 id="login-title" className="text-2xl font-semibold tracking-tight text-text">
                Atlas
              </h1>
              <p className="text-sm text-text-muted">Référentiel des entrepôts</p>
            </header>
            <LoginForm next={next} />
          </section>
        </main>
      }
    />
  );
}
