import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/response";
import {
  readSessionCookie,
} from "@/lib/auth/cookie";
import { getSession, type SessionRecord } from "./session";
import { logAuthLogin, sessionIdPrefixOf } from "./log";
import { isRedisConnectionStateError } from "@/lib/db/redis";

/**
 * `withAuth(handler)` — the single source of truth for the
 * authentication boundary (Constitution Principle IV).
 *
 * Composition order per `research.md` §11:
 *   1. (Pre-handler middleware — CORS + CSRF — runs in
 *      `middleware.ts` BEFORE this wrapper, see 005 T013.)
 *   2. `withApiContract(handler)` from `lib/api/route.ts` —
 *      applies the cross-cutting 415 + 500 envelope guards.
 *   3. **`withAuth(handler)`** (this file) — the auth boundary.
 *      Reads the session cookie, looks up the session record in
 *      Redis, and either attaches the user identity to the request
 *      or short-circuits with `401` / `503`.
 *
 * The exempt list (per spec FR-011) is EXACTLY:
 *   - `POST /api/v1.0/login`   (public — credential entry)
 *   - `GET  /api/v1.0/me`      (public — bootstrap handshake for
 *                               the React route guard; the handler
 *                               does its OWN session lookup)
 *   - `POST /api/v1.0/logout`  (public — must run without a
 *                               session so the cookie can be
 *                               cleared)
 *
 * No other endpoint is exempt. Every protected request to an
 * authenticated endpoint that does not carry a valid session
 * cookie returns `401 Unauthorized` with
 * `{ "error": "Unauthorized" }`.
 */

export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "POST /api/v1.0/login",
  "GET /api/v1.0/me",
  "POST /api/v1.0/logout",
]);

export interface AuthedRequest extends NextRequest {
  auth?: {
    userId: number;
    ulid: string;
    sessionIdPrefix: string;
  };
}

/**
 * `AuthedHandler` — the inner-handler shape `withAuth` wraps. Accepts
 * an optional typed second `ctx` argument so Stage 3 dynamic-route
 * handlers (`/api/v1.0/{teachers,classes}/[ulid]`) can receive their
 * `{ params }` context. The default `TCtx` is `unknown` for legacy
 * handlers (no ctx needed).
 */
export type AuthedHandler<TCtx = unknown> = (
  req: AuthedRequest,
  ctx?: TCtx,
) => Promise<Response>;

/**
 * `withAuth(handler)` — wraps an authenticated route handler. On
 * hit, attaches `req.auth = { userId, ulid, sessionIdPrefix }`
 * and calls the inner handler. On miss / error, returns the
 * appropriate error envelope without ever calling the handler.
 *
 * The optional second `ctx` argument is forwarded to the inner
 * handler so Stage 3 dynamic-route handlers (`/api/v1.0/{teachers,
 * classes}/[ulid]`) can receive their `{ params }` context.
 */
export function withAuth<TCtx = unknown>(
  handler: AuthedHandler<TCtx>,
): AuthedHandler<TCtx> {
  return async (req: AuthedRequest, ctx?: TCtx): Promise<Response> => {
    const method = req.method.toUpperCase();
    const path = req.nextUrl.pathname;
    const exemptKey = `${method} ${path}`;
    if (PUBLIC_PATHS.has(exemptKey)) {
      return handler(req, ctx);
    }

    const sessionId = readSessionCookie(req);
    if (!sessionId) {
      return jsonError(401, "Unauthorized");
    }

    let record: SessionRecord | null;
    try {
      record = await getSession(sessionId);
    } catch (err) {
      if (isRedisConnectionStateError(err)) {
        // Per spec Edge Cases — Redis-down is `503 Service Unavailable`
        // so the SPA can show a retry-friendly error instead of
        // being told to log in (which would fail for the same reason).
        return jsonError(503, "Service temporarily unavailable, please retry");
      }
      // Unknown error — log structured entry, return 401 (don't leak
      // the failure cause to the client).
      // eslint-disable-next-line no-console
      console.error("[withAuth] unexpected session-lookup error", err);
      return jsonError(401, "Unauthorized");
    }

    if (record === null) {
      return jsonError(401, "Unauthorized");
    }

    req.auth = {
      userId: record.userId,
      ulid: record.ulid,
      sessionIdPrefix: sessionIdPrefixOf(sessionId) ?? "",
    };

    return handler(req, ctx);
  };
}

/**
 * `getClientIp(req)` — best-effort extraction of the originating IP
 * for structured logging. Honors `x-forwarded-for` (first hop) and
 * falls back to `null` when no header is present.
 */
export function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

/**
 * `requireAuth(req)` — programmatic guard for handlers that want
 * to assert the request was authed by `withAuth` (e.g. handlers
 * that need to look up the user record). Throws if the request was
 * not wrapped. The route layer in 001 / 002 does NOT call this
 * directly — they go through `withAuth` — but `/api/v1.0/me`
 * does (after the session lookup it does manually, since `/me`
 * is in the PUBLIC_PATHS exempt list).
 */
export function requireAuth(req: AuthedRequest): {
  userId: number;
  ulid: string;
  sessionIdPrefix: string;
} {
  if (!req.auth) {
    throw new Error("requireAuth called on an unauthed request");
  }
  return req.auth;
}

/**
 * `logAuthEvent` — re-export of the structured auth-event logger
 * so handlers don't need a second import. Pure pass-through.
 */
export { logAuthLogin };
