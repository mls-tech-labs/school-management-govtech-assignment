import { NextRequest, NextResponse } from "next/server";
import { config as appConfig } from "@/lib/config";
import {
  matchOrigin,
  isPreflight,
  buildCorsHeaders,
} from "@/lib/security/cors";
import { logCorsRejection, logCsrfRejection } from "@/lib/security/log";
import { compareCsrfTokens } from "@/lib/security/csrf";
import { readCsrfCookie } from "@/lib/auth/cookie";
import { buildCompanionHeaders } from "@/lib/security/headers";

/**
 * `middleware.ts` — the Next.js middleware that runs BEFORE every
 * request reaches a route handler or a page render. Per
 * `specs/005-security-hardening` it enforces:
 *
 *   1. CORS allow-list (FR-001 / FR-001a / SC-002 / SC-003)
 *   2. CSRF double-submit (FR-006 / FR-008 / SC-004 / SC-012)
 *   3. `Content-Security-Policy` response header (FR-003 / FR-004)
 *      — the static policy from `CSP_POLICY` is emitted verbatim.
 *      We deliberately do NOT use a per-request nonce because
 *      Next.js App Router does NOT attach the nonce to its OWN
 *      inline scripts (RSC payload, hydration boot) — the
 *      framework limitation means nonces don't help and the
 *      `__CSP_NONCE__` placeholder would just be ignored by the
 *      browser. The default `CSP_POLICY` therefore includes
 *      `'unsafe-inline'` for `script-src` (a documented Next.js
 *      + strict-CSP trade-off) while keeping style-src,
 *      frame-ancestors, object-src, form-action, base-uri, and
 *      connect-src strict.
 *   4. Companion security headers (nosniff + Referrer-Policy + HSTS)
 */

const CSRF_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  "/api/v1.0/login",
  "/api/v1.0/logout",
  "/api/v1.0/me",
]);

const SAFE_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

function corsRejected(req: NextRequest, reason: "origin_not_allowed" | "preflight_no_origin" | "origin_null"): NextResponse {
  logCorsRejection(req, reason);
  return NextResponse.json(
    { error: "cors" },
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

function csrfRejected(
  req: NextRequest,
  reason:
    | "missing_csrf_cookie"
    | "missing_csrf_header"
    | "csrf_mismatch"
    | "csrf_length_mismatch",
): NextResponse {
  logCsrfRejection(req, reason);
  return NextResponse.json(
    { error: "csrf" },
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/** Attach the static companion headers (nosniff + Referrer-Policy + conditional HSTS). */
function applyCompanionHeaders(res: NextResponse): void {
  const nodeEnv = process.env.NODE_ENV === "production" ? "production" : "development";
  const hstsEnabled =
    process.env.HSTS_ENABLED === "true" ||
    (process.env.HSTS_ENABLED !== "false" &&
      process.env.HSTS_ENABLED !== "0" &&
      process.env.NODE_ENV === "production");
  const companions = buildCompanionHeaders(nodeEnv, hstsEnabled);
  for (const [key, value] of Object.entries(companions)) {
    res.headers.set(key, value);
  }
}

/**
 * Attach the CSP header to the response. Reads the raw policy from
 * `process.env.CSP_POLICY` (or falls back to the Joi default via
 * `appConfig.security.cspPolicy`) and emits it as a response header.
 * No nonce substitution — see the file-level comment for why.
 */
function applyCsp(res: NextResponse): void {
  const policy = process.env.CSP_POLICY ?? appConfig.security.cspPolicy;
  const reportOnly = process.env.CSP_REPORT_ONLY === "true";
  const name = reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
  res.headers.set(name, policy);
}

/**
 * `isSameOrigin(req, origin)` — true when the `Origin` header sent
 * by the browser matches the request's own host:port. Used by the
 * CORS gate to allow same-origin requests through unconditionally
 * — they don't need CORS at all, and modern browsers send the
 * `Origin` header on `fetch()` requests even for same-origin, so
 * we can't use "no `Origin` header" as a same-origin signal.
 */
function isSameOrigin(req: NextRequest, origin: string): boolean {
  try {
    // `req.nextUrl` is the request URL the middleware sees (full
    // URL with scheme, host, port, path). Compare the origin part
    // against the browser-supplied `Origin` header.
    const requestOrigin = req.nextUrl.origin.toLowerCase();
    return requestOrigin === origin.trim().toLowerCase();
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest): NextResponse {
  const { security } = appConfig;
  const origin = req.headers.get("origin");

  // ─── Step 1: CORS preflight (OPTIONS) check ───────────────────────────
  if (isPreflight(req)) {
    if (!origin) return corsRejected(req, "preflight_no_origin");
    if (origin === "null") return corsRejected(req, "origin_null");
    if (!matchOrigin(origin, security.corsAllowedOrigins)) {
      return corsRejected(req, "origin_not_allowed");
    }
    const headers = buildCorsHeaders(origin, security.corsAllowedHeaders, req);
    const res = new NextResponse(null, { status: 204, headers });
    applyCsp(res);
    applyCompanionHeaders(res);
    return res;
  }

  // ─── Step 2: Non-preflight CORS check ──────────────────────────────────
  if (origin) {
    if (origin === "null") return corsRejected(req, "origin_null");
    if (!matchOrigin(origin, security.corsAllowedOrigins)) {
      return corsRejected(req, "origin_not_allowed");
    }
    const corsHeaders = buildCorsHeaders(origin, security.corsAllowedHeaders, req);
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.headers.set(k, v);
    }
    return runCsrfCheck(req, res);
  }

  // No Origin header → same-origin → no CORS layer needed; fall through.
  return runCsrfCheck(req, NextResponse.next());
}

/**
 * `runCsrfCheck` — second half of the middleware pipeline. Invoked
 * AFTER the CORS gate (so a CORS-rejected request never reaches
 * the CSRF check).
 *
 * Also attaches the CSP + companion headers to the response. By the
 * time we reach this point we know the request is not CORS-rejected,
 * so we can apply the rest of the security-header stack.
 */
function runCsrfCheck(req: NextRequest, res: NextResponse): NextResponse {
  const method = req.method.toUpperCase();
  const path = req.nextUrl.pathname;

  // Apply CSP + companion headers to every response that gets this
  // far. Even CSRF-rejected responses should carry the headers so
  // the browser's CSP / HSTS posture is consistent.
  applyCsp(res);
  applyCompanionHeaders(res);

  if (SAFE_METHODS.has(method)) return res;
  if (CSRF_EXEMPT_PATHS.has(path)) return res;

  const cookie = readCsrfCookie(req);
  const header = req.headers.get("x-csrf-token") ?? undefined;

  if (!cookie) return csrfRejected(req, "missing_csrf_cookie");
  if (!header) return csrfRejected(req, "missing_csrf_header");

  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  if (a.length !== b.length) return csrfRejected(req, "csrf_length_mismatch");

  const ok = compareCsrfTokens(cookie, header);
  if (!ok) return csrfRejected(req, "csrf_mismatch");
  return res;
}

/**
 * Matcher — runs the middleware on every path EXCEPT static asset
 * chunks under `/_next/static`. Static assets don't need a CSP /
 * CORS / CSRF layer and skipping them saves the cost of running
 * the middleware on every chunk download.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - /_next/static (static files)
     * - /_next/image (image optimization files)
     * - /favicon.ico, /sitemap.xml, /robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
