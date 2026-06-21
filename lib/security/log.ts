import type { NextRequest } from "next/server";

/**
 * Structured rejection logging for the security-hardening middleware.
 *
 * Two reasons are emitted as distinct event discriminators so an
 * operator can filter the log stream independently for CORS vs CSRF
 * rejections:
 *   - `cors_rejected`  — origin not on the allow-list, or preflight
 *                        missing `Origin`, or `Origin: null`.
 *   - `csrf_rejected`  — state-changing request without a matching
 *                        `csrfToken` cookie + `X-CSRF-Token` header pair.
 *
 * SECURITY — per SC-011 (FR-027/FR-028 extension) + the
 * never-leak-secrets contract:
 *   - The structured entry MUST NEVER contain:
 *       * the session cookie value,
 *       * the CSRF token value,
 *       * the request body,
 *       * the response body,
 *       * any password, hash, or salt.
 *   - Correlation is achieved by including `method` + `path` +
 *     `reason` + `origin` (when present) + `timestamp`.
 *
 * Pure pass-through to `console.log(JSON.stringify(...))` so the
 * unit tests can spy on `console.log` and assert on the serialised
 * output.
 */

export type RejectionReason =
  | "origin_not_allowed"
  | "preflight_no_origin"
  | "origin_null"
  | "missing_csrf_cookie"
  | "missing_csrf_header"
  | "csrf_mismatch"
  | "csrf_length_mismatch";

interface BaseFields {
  event: string;
  method: string;
  path: string;
  reason: RejectionReason;
  timestamp: string;
  origin?: string | null;
}

/**
 * Emit a structured `cors_rejected` log entry.
 */
export function logCorsRejection(
  req: NextRequest | { method: string; nextUrl: { pathname: string }; headers: Headers },
  reason: Extract<RejectionReason, "origin_not_allowed" | "preflight_no_origin" | "origin_null">,
): void {
  const entry: BaseFields = {
    event: "cors_rejected",
    method: req.method,
    path: req.nextUrl.pathname,
    reason,
    timestamp: new Date().toISOString(),
    origin: readOrigin(req.headers),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

/**
 * Emit a structured `csrf_rejected` log entry.
 */
export function logCsrfRejection(
  req: NextRequest | { method: string; nextUrl: { pathname: string }; headers: Headers },
  reason: Extract<
    RejectionReason,
    "missing_csrf_cookie" | "missing_csrf_header" | "csrf_mismatch" | "csrf_length_mismatch"
  >,
): void {
  const entry: BaseFields = {
    event: "csrf_rejected",
    method: req.method,
    path: req.nextUrl.pathname,
    reason,
    timestamp: new Date().toISOString(),
    origin: readOrigin(req.headers),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

function readOrigin(headers: Headers): string | null {
  const o = headers.get("origin");
  return typeof o === "string" && o.length > 0 ? o : null;
}
