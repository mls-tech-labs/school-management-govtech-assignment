import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import {
  readSessionCookie,
  clearSessionCookie,
  clearCsrfCookie,
} from "@/lib/auth/cookie";
import { destroySession } from "@/lib/auth/session";
import { logAuthLogout, sessionIdPrefixOf } from "@/lib/auth/log";
import { getClientIp } from "@/lib/auth/middleware";

export const dynamic = "force-dynamic";

// EXEMPT from `withAuth` — must run without a session so the cookie can be cleared.
// Idempotent: no cookie / unknown cookie → 200 OK (DEL is a no-op).
async function handleLogout(req: NextRequest): Promise<Response> {
  const sessionId = readSessionCookie(req);
  let prefix: string | null = null;

  if (sessionId) {
    prefix = sessionIdPrefixOf(sessionId);
    try {
      await destroySession(sessionId);
    } catch (err) {
      // Redis down — cookie still cleared client-side; session dies with TTL.
      // eslint-disable-next-line no-console
      console.error("[POST /api/v1.0/logout] destroySession failed", err);
      return jsonError(503, "Service temporarily unavailable, please retry");
    }
  }

  const res = jsonOk({});
  clearSessionCookie(res);
  clearCsrfCookie(res);

  logAuthLogout({ sessionIdPrefix: prefix, ip: getClientIp(req) });
  return res;
}

const post = withApiContract(handleLogout);
export async function POST(req: NextRequest): Promise<Response> {
  return post(req);
}
