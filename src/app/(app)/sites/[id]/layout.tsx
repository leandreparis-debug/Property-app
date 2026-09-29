import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { siteExists } from "@/server/sites/detail";

/**
 * Existence check of the site sheet, OUTSIDE the loading boundary
 * (loading.tsx): an unknown or malformed id answers a real HTTP 404
 * (« Site introuvable », sites/not-found.tsx) instead of a streamed 200.
 */
export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await siteExists(id))) notFound();
  return children;
}
