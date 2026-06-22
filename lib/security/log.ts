import type { NextRequest } from "next/server";

// Structured rejection logging. Entries MUST NEVER contain session
// cookies, CSRF tokens, request bodies, or secrets.

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

function readOrigin(headers: Headers): string | null {
  const o = headers.get("origin");
  return typeof o === "string" && o.length > 0 ? o : null;
}

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
