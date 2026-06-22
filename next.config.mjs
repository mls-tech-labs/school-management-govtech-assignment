// NOTE: Next.js's `next.config.mjs` loader runs as native ESM, which
// requires explicit file extensions on every import. We side-step that
// by inlining the one pure function the config needs. The same logic
// lives in `lib/security/headers.ts` and is unit-tested in
// `tests/unit/security/headers.spec.ts`; the duplication is small
// and intentional (config files should be self-contained).

/**
 * Build the three companion security headers (nosniff + Referrer-Policy
 * always; HSTS only in production when explicitly enabled).
 */
function buildCompanionHeaders(nodeEnv, hstsEnabled) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
  if (nodeEnv === "production" && hstsEnabled) {
    headers["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains";
  }
  return headers;
}

/**
 * Next.js config — Stage 2 (005-security-hardening) emits ONLY
 * the static companion security headers (nosniff + Referrer-Policy
 * + conditional HSTS) here. The `Content-Security-Policy` header
 * is emitted by `middleware.ts` because the policy needs a
 * per-request nonce (Next.js's inline boot script body varies
 * per render, so a static hash can't work — see `middleware.ts`
 * and `lib/security/csp.ts` for the nonce pattern).
 */
const companionHeaders = Object.entries(
  buildCompanionHeaders(
    (process.env.NODE_ENV ?? "development") === "production"
      ? "production"
      : "development",
    process.env.HSTS_ENABLED === "true" ||
      ((process.env.HSTS_ENABLED === undefined || process.env.HSTS_ENABLED === "") &&
        process.env.NODE_ENV === "production"),
  ),
).map(([key, value]) => ({ key, value }));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output:'standalone',
  reactStrictMode: true,
  experimental: {
    // App Router is default in Next.js 15.
  },
  // Run typeORM-related files through the Next compiler only as plain TS;
  // they are consumed by Node (CLI scripts + Next.js server runtime), not bundled.
  serverExternalPackages: ["typeorm", "mysql2", "argon2"],
  async headers() {
    return [
      {
        // Apply to every URL — pages + API routes + static assets.
        // (The CSP is set by middleware, but the companion headers
        // are static so it's fine to emit them here too.)
        source: "/(.*)",
        headers: companionHeaders,
      },
    ];
  },
};

export default nextConfig;
