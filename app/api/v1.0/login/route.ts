import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { loginRequestSchema } from "@/lib/auth/schemas";
import { verifyPassword } from "@/lib/auth/password";
import {
  readSessionCookie,
  setSessionCookie,
} from "@/lib/auth/cookie";
import {
  createSession,
  destroySession,
} from "@/lib/auth/session";
import { findUserByUsername } from "@/lib/db/repositories/user";
import { logAuthLogin, sessionIdPrefixOf } from "@/lib/auth/log";
import { getClientIp } from "@/lib/auth/middleware";
import { mintCsrfToken } from "@/lib/security/csrf";
import { setCsrfCookie } from "@/lib/auth/cookie";
import { isRedisConnectionStateError } from "@/lib/db/redis";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1.0/login` — credential entry point. EXEMPT from
 * `withAuth` (per spec FR-011); the handler does its own credential
 * verification.
 *
 * Wire shape:
 *   { username: string, password: string }
 *
 * Response:
 *   - `200 OK` + empty body + `Set-Cookie: pvt_edu_session=...`
 *     + `Set-Cookie: csrfToken=...` (both minted by the login
 *     handler and shared with the session record).
 *   - `400 Bad Request` + `{ "error": "<message>" }` when Joi
 *     rejects the body.
 *   - `401 Unauthorized` + `{ "error": "Invalid username or password" }`
 *     for every credential failure (unknown user / wrong password /
 *     inactive user). The same generic envelope is used for all
 *     three — server-side logs distinguish the reasons per FR-027.
 *   - `500 Internal Server Error` for unhandled exceptions (caught
 *     by `withApiContract`).
 *
 * Session-fixation defence (per spec FR-006 + Clarifications
 * Session 2026-06-21 round 1, Q4):
 *   - Read any pre-existing `pvt_edu_session` cookie from the
 *     REQUEST.
 *   - If present, `destroySession(preExisting)` BEFORE minting the
 *     new one — the pre-seeded `session:<token>` Redis key is gone
 *     by the time the new `Set-Cookie` is on the response.
 */
async function handleLogin(req: NextRequest): Promise<Response> {
  // 1. Parse + validate body.
  const raw = await req.json().catch(() => null);
  const { value, error } = loginRequestSchema.validate(raw, {
    abortEarly: false,
  });
  if (error || !value) {
    const first = error?.details[0]?.message ?? "Invalid request body";
    logAuthLogin({
      outcome: "failure",
      reason: "validation_error",
      username: "",
      ip: getClientIp(req),
    });
    return jsonError(400, first);
  }

  const { username, password } = value as { username: string; password: string };

  // 2. Look up the user.
  let user;
  try {
    user = await findUserByUsername(username);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[POST /api/v1.0/login] DB error", err);
    logAuthLogin({
      outcome: "failure",
      reason: "internal_error",
      username,
      ip: getClientIp(req),
    });
    return jsonError(500, "Internal server error");
  }

  if (user === null) {
    logAuthLogin({
      outcome: "failure",
      reason: "unknown_user",
      username,
      ip: getClientIp(req),
    });
    // Identical envelope for every credential failure — prevents
    // username enumeration (spec Edge Cases / security floor).
    return jsonError(401, "Invalid username or password");
  }

  // 3. Verify password.
  const ok = await verifyPassword(password, user.password, user.salt);
  if (!ok) {
    logAuthLogin({
      outcome: "failure",
      reason: "wrong_password",
      username,
      ip: getClientIp(req),
    });
    return jsonError(401, "Invalid username or password");
  }

  // 4. Check active flag.
  if (user.active === false) {
    logAuthLogin({
      outcome: "failure",
      reason: "inactive_user",
      username,
      ip: getClientIp(req),
    });
    return jsonError(401, "Invalid username or password");
  }

  // 5. Session-fixation defence — destroy any pre-existing session
  // BEFORE minting the new one. The new opaque token is
  // `crypto.randomBytes(32).toString("base64url")` (256 bits of
  // CSPRNG entropy; same source as `mintCsrfToken`).
  const preExisting = readSessionCookie(req);
  if (preExisting) {
    try {
      await destroySession(preExisting);
    } catch (err) {
      // Best-effort — if Redis is down the destroy will fail but
      // the new session will be set anyway. Log and continue.
      // eslint-disable-next-line no-console
      console.error("[POST /api/v1.0/login] pre-destroy failed", err);
    }
  }

  // 6. Mint a fresh session + CSRF token. Both are stored in the
  // session record (one Redis write); the CSRF token is also
  // mirrored to a non-HttpOnly cookie so the SPA can echo it as
  // the `X-CSRF-Token` header on every state-changing request.
  //
  // A connection-state error here is a transient / cold-start
  // issue with Redis (per `lib/db/redis.ts → isRedisConnectionStateError`)
  // — the credentials are valid, the user is real, but we can't
  // mint a session right now. Map to 503 so the SPA shows a
  // retry-friendly message rather than 500 ("something broke").
  const csrfToken = mintCsrfToken();
  let sessionId: string;
  try {
    const created = await createSession(
      Number(user.id),
      user.ulid,
      csrfToken,
    );
    sessionId = created.sessionId;
  } catch (err) {
    if (isRedisConnectionStateError(err)) {
      logAuthLogin({
        outcome: "failure",
        reason: "redis_unavailable",
        username,
        ip: getClientIp(req),
      });
      return jsonError(503, "Service temporarily unavailable, please retry");
    }
    throw err;
  }

  // 7. Build the response with both cookies set.
  const res = jsonOk({});
  setSessionCookie(res, sessionId);
  setCsrfCookie(res, csrfToken);

  // 8. Structured success log.
  logAuthLogin({
    outcome: "success",
    username,
    ip: getClientIp(req),
    sessionIdPrefix: sessionIdPrefixOf(sessionId),
  });

  return res;
}

const post = withApiContract(handleLogin);

export async function POST(req: NextRequest): Promise<Response> {
  return post(req);
}

// `randomBytes` import is reserved for any future entropy source —
// the session token currently comes from `createSession`'s internal
// `randomBytes(32).toString("base64url")` call.
void randomBytes;
