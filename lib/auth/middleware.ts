import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/response";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getSession, type SessionRecord } from "./session";
import { logAuthLogin, sessionIdPrefixOf } from "./log";
import { isRedisConnectionStateError } from "@/lib/db/redis";

// Routes that bypass the session check. Login/logout must run without
// a session; /me does its own lookup.
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

export type AuthedHandler<TCtx = unknown> = (
  req: AuthedRequest,
  ctx?: TCtx,
) => Promise<Response>;

export function withAuth<TCtx = unknown>(
  handler: AuthedHandler<TCtx>,
): AuthedHandler<TCtx> {
  return async (req: AuthedRequest, ctx?: TCtx): Promise<Response> => {
    const exemptKey = `${req.method.toUpperCase()} ${req.nextUrl.pathname}`;
    if (PUBLIC_PATHS.has(exemptKey)) return handler(req, ctx);

    const sessionId = readSessionCookie(req);
    if (!sessionId) return jsonError(401, "Unauthorized");

    let record: SessionRecord | null;
    try {
      record = await getSession(sessionId);
    } catch (err) {
      if (isRedisConnectionStateError(err)) {
        return jsonError(503, "Service temporarily unavailable, please retry");
      }
      // eslint-disable-next-line no-console
      console.error("[withAuth] unexpected session-lookup error", err);
      return jsonError(401, "Unauthorized");
    }

    if (record === null) return jsonError(401, "Unauthorized");

    req.auth = {
      userId: record.userId,
      ulid: record.ulid,
      sessionIdPrefix: sessionIdPrefixOf(sessionId) ?? "",
    };
    return handler(req, ctx);
  };
}

export function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

export function requireAuth(req: AuthedRequest): {
  userId: number;
  ulid: string;
  sessionIdPrefix: string;
} {
  if (!req.auth) throw new Error("requireAuth called on an unauthed request");
  return req.auth;
}

export { logAuthLogin };
