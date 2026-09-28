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
  },
  // Keep the dev badge away from the navigation rail (bottom-left).
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
