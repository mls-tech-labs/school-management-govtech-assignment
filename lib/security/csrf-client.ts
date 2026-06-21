/**
 * `getCsrfToken()` — the ONLY call site in the codebase that reads
 * `document.cookie` for CSRF purposes (per spec FR-019a + SC-013).
 *
 * The CSRF token is stored in a NON-HttpOnly cookie named
 * `csrfToken` so the SPA can echo it back as the `X-CSRF-Token`
 * header on every state-changing request. SSR-safety: the
 * `typeof document === 'undefined'` short-circuit returns `null`
 * during server rendering so React's server build doesn't crash.
 *
 * This file is `.ts` (not `.tsx`) and contains no React code — it
 * is safe to import from both server and client bundles. The
 * caller is responsible for not invoking `getCsrfToken()` from a
 * Server Component; it is intended for `"use client"` modules.
 *
 * Single anchored regex per spec — no manual `cookie.split(';')`
 * (which would be slower and more error-prone). The match captures
 * everything up to the next `;` (or end-of-string).
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie;
  if (!raw) return null;
  const match = /(?:^|;\s*)csrfToken=([^;]+)/.exec(raw);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
