import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/server/auth/current-user";

/**
 * Protected area. Every page below requires a valid session: the session is
 * validated against the database here (the middleware only checks that the
 * cookie exists). Without one, redirects to `/login?next=…`.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
