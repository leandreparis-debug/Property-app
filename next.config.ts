import type { NextConfig } from "next";

/** Static security headers, applied to every response (CSP is set in middleware). */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "browsing-topics=()",
      "camera=()",
      "display-capture=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/**
 * Host of APP_URL, trusted for Server Actions. Behind a proxy that rewrites
 * the Host header (GitHub Codespaces, reverse proxy), Next.js would otherwise
 * refuse the actions; APP_URL is already the only accepted origin.
 */
function appHost(): string[] {
  try {
    return process.env.APP_URL ? [new URL(process.env.APP_URL).host] : [];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Native argon2 binding: loaded by Node, never bundled.
  serverExternalPackages: ["@node-rs/argon2"],
  // Embedded common-password list, read from disk at runtime.
  outputFileTracingIncludes: { "/**": ["./src/server/auth/common-passwords.txt"] },
  experimental: {
    // forbidden() → app/forbidden.tsx (« Accès refusé », HTTP 403).
    authInterrupts: true,
    serverActions: { allowedOrigins: appHost() },
  },
  // Keep the dev badge away from the navigation rail (bottom-left).
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
