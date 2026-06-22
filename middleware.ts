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

function applyCompanionHeaders(res: NextResponse): void {
  const nodeEnv = process.env.NODE_ENV === "production" ? "production" : "development";
  const hstsEnabled =
    process.env.HSTS_ENABLED === "true" ||
    (process.env.HSTS_ENABLED !== "false" &&
      process.env.HSTS_ENABLED !== "0" &&
      process.env.NODE_ENV === "production");
  Object.assign(res.headers, buildCompanionHeaders(nodeEnv, hstsEnabled));
}

// Static CSP from env (no nonce — Next.js App Router doesn't attach
// nonces to its own inline scripts).
function applyCsp(res: NextResponse): void {
  const policy = process.env.CSP_POLICY ?? appConfig.security.cspPolicy;
  const reportOnly = process.env.CSP_REPORT_ONLY === "true";
  res.headers.set(
    reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    policy,
  );
}

export function middleware(req: NextRequest): NextResponse {
  const { security } = appConfig;
  const origin = req.headers.get("origin");

  // Preflight (OPTIONS) check.
  if (isPreflight(req)) {
    if (!origin) return corsRejected(req, "preflight_no_origin");
    if (origin === "null") return corsRejected(req, "origin_null");
    if (!matchOrigin(origin, security.corsAllowedOrigins)) {
      return corsRejected(req, "origin_not_allowed");
    }
    const res = new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin, security.corsAllowedHeaders, req) });
    applyCsp(res);
    applyCompanionHeaders(res);
    return res;
  }

  // Non-preflight CORS check (when Origin is present).
  if (origin) {
    if (origin === "null") return corsRejected(req, "origin_null");
    if (!matchOrigin(origin, security.corsAllowedOrigins)) {
      return corsRejected(req, "origin_not_allowed");
    }
    const res = NextResponse.next();
    Object.assign(res.headers, buildCorsHeaders(origin, security.corsAllowedHeaders, req));
    return runCsrfCheck(req, res);
  }

  // No Origin header → same-origin → fall through to CSRF check.
  return runCsrfCheck(req, NextResponse.next());
}

function runCsrfCheck(req: NextRequest, res: NextResponse): NextResponse {
  const method = req.method.toUpperCase();
  const path = req.nextUrl.pathname;

  applyCsp(res);
  applyCompanionHeaders(res);

  if (SAFE_METHODS.has(method)) return res;
  if (CSRF_EXEMPT_PATHS.has(path)) return res;

  const cookie = readCsrfCookie(req);
  const header = req.headers.get("x-csrf-token") ?? undefined;

  if (!cookie) return csrfRejected(req, "missing_csrf_cookie");
  if (!header) return csrfRejected(req, "missing_csrf_header");
  if (!compareCsrfTokens(cookie, header)) {
    // The compare helper already returns false on length mismatch;
    // the dedicated reason is needed for structured logging.
    return csrfRejected(req, cookie.length === header.length ? "csrf_mismatch" : "csrf_length_mismatch");
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
