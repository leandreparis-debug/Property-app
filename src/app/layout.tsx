import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { APP_DESCRIPTION, APP_NAME } from "@/config/app";
import { cn } from "@/lib/utils";
// Brand typeface of the logo, self-hosted (no request to the internet).
import "@fontsource/unbounded/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07090C",
};

/** Root layout: document, fonts and theme only. The application shell lives in `(app)/layout.tsx`. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers opts every page into dynamic rendering, which
  // is required for Next.js to stamp the per-request CSP nonce on its scripts.
  await headers();

  return (
    <html lang="fr" className={cn("dark", GeistSans.variable, GeistMono.variable)}>
      <body>{children}</body>
    </html>
  );
}
