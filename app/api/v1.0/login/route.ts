import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { loginRequestSchema } from "@/lib/auth/schemas";
import { verifyPassword } from "@/lib/auth/password";
import {
  readSessionCookie,
  setSessionCookie,
  setCsrfCookie,
} from "@/lib/auth/cookie";
import { createSession, destroySession } from "@/lib/auth/session";
import { findUserByUsername } from "@/lib/db/repositories/user";
import {
  logAuthLogin,
  sessionIdPrefixOf,
  type LoginFailureReason,
} from "@/lib/auth/log";
import { getClientIp } from "@/lib/auth/middleware";
import { mintCsrfToken } from "@/lib/security/csrf";
import { isRedisConnectionStateError } from "@/lib/db/redis";

export const dynamic = "force-dynamic";

// Identical envelope for every credential failure prevents username enumeration.
const INVALID_CREDENTIALS = "Invalid username or password" as const;

// EXEMPT from `withAuth` — public credential entry point.
async function handleLogin(req: NextRequest): Promise<Response> {
  // 1. Validate body.
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
  const { username, password } = value;

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

  if (user === null) return denyInvalidCredentials(req, username, "unknown_user");
  if (!(await verifyPassword(password, user.password, user.salt))) {
    return denyInvalidCredentials(req, username, "wrong_password");
  }
  if (user.active === false) {
    return denyInvalidCredentials(req, username, "inactive_user");
  }

  // 3. Session-fixation defence — destroy any pre-existing session BEFORE minting the new one.
  const preExisting = readSessionCookie(req);
  if (preExisting) {
    try {
      await destroySession(preExisting);
    } catch (err) {
      // Best-effort — log and continue; the new session will still be set.
      // eslint-disable-next-line no-console
      console.error("[POST /api/v1.0/login] pre-destroy failed", err);
    }
  }

  // 4. Mint session + CSRF token.
  const csrfToken = mintCsrfToken();
  let sessionId: string;
  try {
    const created = await createSession(Number(user.id), user.ulid, csrfToken);
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

  // 5. Build response with both cookies set.
  const res = jsonOk({});
  setSessionCookie(res, sessionId);
  setCsrfCookie(res, csrfToken);

  logAuthLogin({
    outcome: "success",
    username,
    ip: getClientIp(req),
    sessionIdPrefix: sessionIdPrefixOf(sessionId),
  });
  return res;
}

function denyInvalidCredentials(
  req: NextRequest,
  username: string,
  reason: LoginFailureReason,
) {
  logAuthLogin({ outcome: "failure", reason, username, ip: getClientIp(req) });
  return jsonError(401, INVALID_CREDENTIALS);
}

const post = withApiContract(handleLogin);
export async function POST(req: NextRequest): Promise<Response> {
  return post(req);
}
