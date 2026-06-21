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

/**
 * `POST /api/v1.0/logout` — clears the session cookie + Redis
 * session record. EXEMPT from `withAuth` (per spec FR-011) — the
 * handler must run even without a session so the cookie can be
 * cleared.
 *
 * Idempotent (per spec FR-007):
 *   - With a valid session cookie → 200 OK + clearing `Set-Cookie`
 *     + Redis key deleted.
 *   - Without any cookie → 200 OK (no error).
 *   - With an unknown / forged cookie → 200 OK (no error — Redis
 *     `DEL` is a no-op on a non-existent key).
 *
 * Clears BOTH cookies (`pvt_edu_session` AND `csrfToken`) so the
 * SPA cannot accidentally leak the CSRF token after the user has
 * logged out.
 */
async function handleLogout(req: NextRequest): Promise<Response> {
  const sessionId = readSessionCookie(req);
  let prefix: string | null = null;

  if (sessionId) {
    prefix = sessionIdPrefixOf(sessionId);
    try {
      await destroySession(sessionId);
    } catch (err) {
      // Redis down — still return 200 OK (the cookie will be cleared
      // client-side; the session is effectively dead with its 30-min
      // TTL). Log the error for operator visibility.
      // eslint-disable-next-line no-console
      console.error("[POST /api/v1.0/logout] destroySession failed", err);
      return jsonError(503, "Service temporarily unavailable, please retry");
    }
  }

  const res = jsonOk({});
  clearSessionCookie(res);
  clearCsrfCookie(res);

  logAuthLogout({
    sessionIdPrefix: prefix,
    ip: getClientIp(req),
  });

  return res;
}

const post = withApiContract(handleLogout);

export async function POST(req: NextRequest): Promise<Response> {
  return post(req);
}
