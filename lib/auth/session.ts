import { randomBytes } from "node:crypto";
import { getRedis } from "@/lib/db/redis";
import { config } from "@/lib/config";

/**
 * Session record shape — the JSON value stored at `session:<token>`.
 *
 * Per `specs/004-user-auth/data-model.md` §3.2:
 *   - `userId`   — surrogate `users.id` (BIGINT UNSIGNED); the
 *                  authoritative reference; used for the
 *                  `GET /api/v1.0/me` lookup.
 *   - `ulid`     — `users.ulid` row handle (cross-cutting ULID
 *                  column, per FR-021); exposed in the `/me`
 *                  response.
 *   - `createdAt`— ISO-8601 timestamp at which the session was
 *                  minted (informational; the hard TTL is enforced
 *                  via the Redis key expiry).
 *   - `csrfToken`— the CSRF double-submit token, minted by the
 *                  login handler and stored alongside the session
 *                  so the middleware can do a single Redis `GET`
 *                  per protected request (per 005 T013 — one
 *                  Redis round-trip is the whole point of co-locating
 *                  the two tokens).
 */
export interface SessionRecord {
  userId: number;
  ulid: string;
  createdAt: string;
  csrfToken: string;
}

/**
 * Type guard — narrows an unknown parsed JSON to a `SessionRecord`
 * shape. Used after `JSON.parse` to defend against a malformed
 * value in Redis (e.g. a stale key from an older schema).
 */
function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.userId === "number" &&
    typeof v.ulid === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.csrfToken === "string"
  );
}

/**
 * Mint a fresh opaque session token. 32 random bytes → 43-char
 * base64url string (no `+`, `/`, or `=`). The token is the Redis
 * key, so it must be unguessable; `randomBytes(32)` gives 256 bits
 * of CSPRNG entropy.
 */
function mintSessionId(): string {
  return randomBytes(32).toString("base64url");
}

const SESSION_PREFIX = "session:";

/**
 * `createSession(user, csrfToken)` — mint a fresh opaque token,
 * write the JSON record to Redis with the configured TTL.
 *
 * The TTL is HARDCODED to `SESSION_TTL_SECONDS` — there is NO
 * sliding extension (per spec FR-015 + Edge Cases).
 */
export async function createSession(
  userId: number,
  ulid: string,
  csrfToken: string,
): Promise<{ sessionId: string; record: SessionRecord }> {
  const sessionId = mintSessionId();
  const record: SessionRecord = {
    userId,
    ulid,
    createdAt: new Date().toISOString(),
    csrfToken,
  };
  const key = `${SESSION_PREFIX}${sessionId}`;
  await getRedis().set(
    key,
    JSON.stringify(record),
    "EX",
    config.auth.sessionTtlSeconds,
  );
  return { sessionId, record };
}

/**
 * `getSession(sessionId)` — read the session record. Returns
 * `null` on miss (unknown token, expired key, malformed JSON).
 *
 * Per spec Edge Cases: "missing cookie / unknown cookie / expired
 * cookie" are INDISTINGUISHABLE from the client's perspective —
 * every miss becomes a `401 Unauthorized` envelope.
 */
export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  if (!sessionId) return null;
  const raw = await getRedis().get(`${SESSION_PREFIX}${sessionId}`);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSessionRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * `destroySession(sessionId)` — delete the session key from Redis.
 * Idempotent: `DEL` of a non-existent key is a no-op (returns 0).
 * This is what makes `POST /api/v1.0/logout` idempotent (per
 * spec FR-007).
 */
export async function destroySession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await getRedis().del(`${SESSION_PREFIX}${sessionId}`);
}
