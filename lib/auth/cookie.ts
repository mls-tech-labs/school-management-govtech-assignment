import { config } from "@/lib/config";

/**
 * Session-cookie helpers. The cookie carries an opaque
 * `crypto.randomBytes(32).toString("base64url")` token; the token is
 * the Redis key (`session:<token>`). No JWT, no signed envelope —
 * the session state lives in Redis, the cookie is just a pointer.
 *
 * Attributes (per spec FR-014, FR-015, FR-018 + Principle IV):
 *   - `HttpOnly` — always present (no client-side JS access).
 *   - `Secure`   — present when `SESSION_COOKIE_SECURE` is truthy
 *                  (defaults to `NODE_ENV === 'production'`;
 *                  relaxed in local-dev HTTP per Principle IV).
 *   - `SameSite=Strict` — always present (blocks cross-site sends).
 *   - `Path=/`   — cookie is sent on every path (covers all routes).
 *   - `Max-Age`  — equals `SESSION_TTL_SECONDS` (hard 30-minute TTL,
 *                  no sliding extension).
 *
 * The cookie NAME comes from `SESSION_COOKIE_NAME` so a single deploy
 * can rename the cookie without code changes (helps when multiple
 * instances share a domain in dev).
 */
export const sessionCookieName: string = config.auth.sessionCookieName;

/**
 * Cookie options shared between set/clear paths. Defined as a
 * frozen object so the same shape is reused across the
 * set/clear/read helpers (per spec — clearing the cookie must use
 * the same `Path`/`HttpOnly`/`Secure`/`SameSite` as the original).
 */
const BASE_COOKIE_OPTS = {
  path: "/",
  httpOnly: true,
  sameSite: "strict" as const,
  // The `Secure` flag is read once at module load — see Principle IV.
  secure: config.auth.sessionCookieSecure,
  // `maxAge` is in SECONDS for the standard `Set-Cookie` attribute.
  maxAge: config.auth.sessionTtlSeconds,
} as const;

export interface CookieOptions {
  path?: string;
  maxAge?: number;
}

/**
 * Format a `Set-Cookie` header value. Hand-rolled rather than using
 * a library so the attribute names match the spec EXACTLY (no
 * library differences in case or ordering).
 *
 * The `secure` / `httponly` flags are emitted ONLY when truthy —
 * this lets local dev (where `Secure` is false) see exactly what
 * the browser will see.
 */
function buildSetCookie(
  name: string,
  value: string,
  opts: { maxAge?: number; path?: string } = {},
  includeSecure: boolean = BASE_COOKIE_OPTS.secure,
  includeHttpOnly: boolean = true,
): string {
  const parts = [`${name}=${value}`];
  if (opts.path ?? BASE_COOKIE_OPTS.path) {
    parts.push(`Path=${opts.path ?? BASE_COOKIE_OPTS.path}`);
  }
  if (opts.maxAge ?? BASE_COOKIE_OPTS.maxAge) {
    parts.push(`Max-Age=${opts.maxAge ?? BASE_COOKIE_OPTS.maxAge}`);
  }
  if (includeSecure) parts.push("Secure");
  if (includeHttpOnly) parts.push("HttpOnly");
  parts.push("SameSite=Strict");
  return parts.join("; ");
}

/**
 * Set the session cookie on a response. `sessionId` is the opaque
 * token; the caller is responsible for writing the session record
 * to Redis first (so the cookie and the store are consistent).
 */
export function setSessionCookie(
  res: Response,
  sessionId: string,
  opts: CookieOptions = {},
): void {
  const cookie = buildSetCookie(sessionCookieName, sessionId, opts);
  // The Response class allows multiple `Set-Cookie` headers via
  // `Headers.append`. The first call replaces, the rest append;
  // in practice there is only one session-cookie header per response.
  res.headers.append("Set-Cookie", cookie);
}

/**
 * Clear the session cookie. Same `Path` / `HttpOnly` / `Secure` /
 * `SameSite` as the original (spec FR-018), but `Value=""`,
 * `Max-Age=0`, and a past `Expires`.
 */
export function clearSessionCookie(res: Response, opts: CookieOptions = {}): void {
  const parts = [
    `${sessionCookieName}=`,
    `Path=${opts.path ?? BASE_COOKIE_OPTS.path}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (BASE_COOKIE_OPTS.secure) parts.push("Secure");
  parts.push("HttpOnly");
  parts.push("SameSite=Strict");
  res.headers.append("Set-Cookie", parts.join("; "));
}

/**
 * Read the session cookie from an incoming request. Returns the raw
 * token (NOT decoded) or `null` if the cookie is absent. Cookie
 * parsing is intentionally minimal — we accept the first matching
 * cookie verbatim; the rest of the auth pipeline (Redis lookup)
 * determines validity.
 */
export function readSessionCookie(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const target = `${sessionCookieName}=`;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return trimmed.slice(target.length);
    }
  }
  return null;
}

/* ─── CSRF cookie (added by 005-security-hardening) ─────────────────────── */

/**
 * CSRF cookie helpers — same attribute set as the session cookie,
 * except `HttpOnly=false` (the SPA must be able to read the token
 * for the `X-CSRF-Token` header) and the name is `csrfToken`.
 *
 * These helpers are added by the 005 feature (per its Phase 2 T010
 * amendment) but live here so the 004 login / logout handlers can
 * mint / clear the cookie without a cross-module dependency on
 * `lib/security`.
 */
export const csrfCookieName = "csrfToken";

export function setCsrfCookie(
  res: Response,
  token: string,
  opts: CookieOptions = {},
): void {
  // Same name + path + Secure + SameSite + Max-Age as the session
  // cookie; only `HttpOnly` is dropped so the SPA can echo the
  // value back as the `X-CSRF-Token` header.
  const parts = [
    `${csrfCookieName}=${token}`,
    `Path=${opts.path ?? BASE_COOKIE_OPTS.path}`,
    `Max-Age=${opts.maxAge ?? BASE_COOKIE_OPTS.maxAge}`,
  ];
  if (BASE_COOKIE_OPTS.secure) parts.push("Secure");
  parts.push("SameSite=Strict");
  // NB: NO `HttpOnly` — the SPA reads this cookie from
  // `document.cookie` via `getCsrfToken()` to populate the
  // `X-CSRF-Token` header.
  res.headers.append("Set-Cookie", parts.join("; "));
}

export function clearCsrfCookie(res: Response, opts: CookieOptions = {}): void {
  const parts = [
    `${csrfCookieName}=`,
    `Path=${opts.path ?? BASE_COOKIE_OPTS.path}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (BASE_COOKIE_OPTS.secure) parts.push("Secure");
  parts.push("SameSite=Strict");
  res.headers.append("Set-Cookie", parts.join("; "));
}

/**
 * Read the CSRF cookie from an incoming request. Returns the raw
 * value or `null` if absent.
 */
export function readCsrfCookie(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const target = `${csrfCookieName}=`;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return trimmed.slice(target.length);
    }
  }
  return null;
}
