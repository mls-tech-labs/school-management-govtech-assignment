import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getSession } from "@/lib/auth/session";
import { findUserById } from "@/lib/db/repositories/user";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1.0/me` — the bootstrap handshake used by the React
 * route guard (`lib/auth/route-guard.tsx`). EXEMPT from `withAuth`
 * (per spec FR-011) — the handler does its own session lookup.
 *
 * Response shape (per spec FR-009):
 *   { username, active, ulid, createdAt }
 *
 * The shape is LOCKED DOWN to exactly four top-level fields — no
 * `id`, no audit columns (per FR-020).
 *
 * Failure modes — all return `401 Unauthorized` with the same
 * `{ "error": "Unauthorized" }` envelope (per spec Edge Cases
 * "missing cookie / unknown cookie / expired cookie / Redis error"
 * are INDISTINGUISHABLE from the client's perspective):
 *   - No cookie.
 *   - Unknown cookie (forged / expired).
 *   - User row not found (referential drift — the session points
 *     to a deleted user).
 *   - Redis error.
 */
async function handleMe(req: NextRequest): Promise<Response> {
  const sessionId = readSessionCookie(req);
  if (!sessionId) return jsonError(401, "Unauthorized");

  let record;
  try {
    record = await getSession(sessionId);
  } catch (err) {
    // Per spec Edge Cases, Redis errors are indistinguishable from
    // a missing cookie at this layer — return 401 so the SPA
    // redirects to /login (which then attempts its own lookup).
    // eslint-disable-next-line no-console
    console.error("[GET /api/v1.0/me] session lookup failed", err);
    return jsonError(401, "Unauthorized");
  }

  if (record === null) return jsonError(401, "Unauthorized");

  let user;
  try {
    user = await findUserById(record.userId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[GET /api/v1.0/me] user lookup failed", err);
    return jsonError(401, "Unauthorized");
  }

  if (user === null) return jsonError(401, "Unauthorized");

  // Exactly four top-level fields per FR-009 + FR-020.
  return jsonOk({
    username: user.username,
    active: user.active,
    ulid: user.ulid,
    createdAt: user.createdAt.toISOString(),
  });
}

const get = withApiContract(handleMe);

export async function GET(req: NextRequest): Promise<Response> {
  return get(req);
}
