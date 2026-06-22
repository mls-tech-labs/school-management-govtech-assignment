import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getSession } from "@/lib/auth/session";
import { findUserById } from "@/lib/db/repositories/user";

export const dynamic = "force-dynamic";

// EXEMPT from `withAuth` — does its own session lookup. Returns 401 for
// every miss (no cookie / unknown cookie / expired cookie / Redis error)
// so they are indistinguishable to the client.
async function handleMe(req: NextRequest): Promise<Response> {
  const sessionId = readSessionCookie(req);
  if (!sessionId) return jsonError(401, "Unauthorized");

  let record;
  try {
    record = await getSession(sessionId);
  } catch (err) {
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

  // Exactly four top-level fields — no id, no audit columns.
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
