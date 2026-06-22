import { config } from "@/lib/config";

export const sessionCookieName: string = config.auth.sessionCookieName;
export const csrfCookieName = "csrfToken";

const BASE_COOKIE_OPTS = {
  path: "/",
  httpOnly: true,
  sameSite: "strict" as const,
  secure: config.auth.sessionCookieSecure,
  maxAge: config.auth.sessionTtlSeconds,
} as const;

export interface CookieOptions {
  path?: string;
  maxAge?: number;
}

function buildSessionSetCookie(
  name: string,
  value: string,
  opts: { maxAge?: number; path?: string } = {},
): string {
  const parts = [
    `${name}=${value}`,
    `Path=${opts.path ?? BASE_COOKIE_OPTS.path}`,
    `Max-Age=${opts.maxAge ?? BASE_COOKIE_OPTS.maxAge}`,
  ];
  if (BASE_COOKIE_OPTS.secure) parts.push("Secure");
  parts.push("HttpOnly", "SameSite=Strict");
  return parts.join("; ");
}

// `secure` is omitted when falsy so local dev over HTTP sees exactly
// what the browser will see.
function buildClearCookie(name: string, opts: { path?: string } = {}): string {
  const parts = [
    `${name}=`,
    `Path=${opts.path ?? BASE_COOKIE_OPTS.path}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (BASE_COOKIE_OPTS.secure) parts.push("Secure");
  parts.push("HttpOnly", "SameSite=Strict");
  return parts.join("; ");
}

export function setSessionCookie(
  res: Response,
  sessionId: string,
  opts: CookieOptions = {},
): void {
  res.headers.append("Set-Cookie", buildSessionSetCookie(sessionCookieName, sessionId, opts));
}

export function clearSessionCookie(res: Response, opts: CookieOptions = {}): void {
  res.headers.append("Set-Cookie", buildClearCookie(sessionCookieName, opts));
}

// CSRF cookie is the same as the session cookie EXCEPT HttpOnly=false
// so the SPA can echo the value back as the `X-CSRF-Token` header.
export function setCsrfCookie(
  res: Response,
  token: string,
  opts: CookieOptions = {},
): void {
  const parts = [
    `${csrfCookieName}=${token}`,
    `Path=${opts.path ?? BASE_COOKIE_OPTS.path}`,
    `Max-Age=${opts.maxAge ?? BASE_COOKIE_OPTS.maxAge}`,
  ];
  if (BASE_COOKIE_OPTS.secure) parts.push("Secure");
  parts.push("SameSite=Strict");
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

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const target = `${name}=`;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) return trimmed.slice(target.length);
  }
  return null;
}

export function readSessionCookie(req: Request): string | null {
  return readCookie(req, sessionCookieName);
}

export function readCsrfCookie(req: Request): string | null {
  return readCookie(req, csrfCookieName);
}
