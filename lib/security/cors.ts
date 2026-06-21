import type { NextRequest } from "next/server";

/**
 * CORS allow-list matching + response-header assembly.
 *
 * Per spec FR-001 / FR-001a / SC-002 / SC-003:
 *   - The allow-list is a comma-separated CSV read from the
 *     `CORS_ALLOWED_ORIGINS` env var (fail-closed empty default).
 *   - Origins are compared case-insensitively (host casing does not
 *     matter per the WHATWG URL parser; we trim whitespace too so
 *     an operator can paste a list with trailing commas / spaces).
 *   - `null` and empty-string origins are ALWAYS rejected (defense
 *     against sandboxed iframe + `Origin: null` exploits).
 *   - `Access-Control-Allow-Credentials: true` is always emitted
 *     because the session cookie is credentialed.
 *   - `Vary: Origin` is always emitted so CDNs do not cache a
 *     response with the wrong `Access-Control-Allow-Origin`.
 */

const PREFLIGHT_METHODS =
  "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD" as const;

/**
 * `matchOrigin(origin, allowedCsv)` — pure membership check.
 * Returns `true` iff `origin` (case-insensitive, trimmed) appears
 * in the parsed allow-list. `null` / empty / undefined origins
 * always return `false`.
 */
export function matchOrigin(origin: string | null, allowedCsv: string): boolean {
  if (!origin || typeof origin !== "string") return false;
  if (origin === "null" || origin.trim().length === 0) return false;
  const allowed = new Set(
    allowedCsv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
  return allowed.has(origin.trim().toLowerCase());
}

/**
 * `isPreflight(req)` — true when the request is a CORS preflight
 * (method `OPTIONS` + a non-empty `Access-Control-Request-Method`
 * header).
 */
export function isPreflight(req: { method: string; headers: Headers }): boolean {
  if (req.method.toUpperCase() !== "OPTIONS") return false;
  const arm = req.headers.get("access-control-request-method");
  return typeof arm === "string" && arm.length > 0;
}

/**
 * `buildCorsHeaders(allowedOrigin, allowedHeaders, req)` — assembles
 * the response header set for an ALLOWED origin.
 *
 * For preflight (`isPreflight(req) === true`), the full set:
 *   - `Access-Control-Allow-Origin` (echoes the request origin)
 *   - `Access-Control-Allow-Credentials: true`
 *   - `Access-Control-Allow-Headers` (echoes `CORS_ALLOWED_HEADERS`)
 *   - `Access-Control-Allow-Methods` (the standard verb set)
 *   - `Vary: Origin`
 *
 * For non-preflight, the slim set:
 *   - `Access-Control-Allow-Origin`
 *   - `Access-Control-Allow-Credentials: true`
 *   - `Vary: Origin`
 */
export function buildCorsHeaders(
  allowedOrigin: string,
  allowedHeaders: string,
  req: { method: string; headers: Headers },
): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  if (isPreflight(req)) {
    base["Access-Control-Allow-Headers"] = allowedHeaders;
    base["Access-Control-Allow-Methods"] = PREFLIGHT_METHODS;
  }
  return base;
}

/**
 * `buildCorsRejectionResponse(req)` — assemble the `403` envelope
 * for a rejected origin. Per spec, the response carries ONLY
 * `{ "error": "cors" }` and no CORS echo headers (so the browser
 * does not accept the response).
 */
export function buildCorsRejectionResponse(req: NextRequest): Response {
  return new Response(JSON.stringify({ error: "cors" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
