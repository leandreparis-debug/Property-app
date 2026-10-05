import { AppShell } from "@/components/shell/AppShell";
import { SiteIndexProvider } from "@/components/sites/SiteIndexProvider";
import { todayDateOnly, toIsoDate } from "@/domain/dates";
import { requireUser } from "@/server/auth/current-user";
import { getSiteIndex } from "@/server/sites/index";

/**
 * Protected area. Every page below requires a valid session: the session is
 * validated against the database here (the middleware only checks that the
 * cookie exists). Without one, redirects to `/login?next=…`.
 *
 * The SITE INDEX is loaded here, once, and shared by the map, the list, the
 * search and the supervision (filtering is local, in the browser).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const today = todayDateOnly();
  const entries = await getSiteIndex(today);
  return (
    <SiteIndexProvider entries={entries} evaluatedOn={toIsoDate(today) ?? ""}>
      <AppShell user={user}>{children}</AppShell>
    </SiteIndexProvider>
  );
}
