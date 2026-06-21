import Redis, { type Redis as RedisClient } from "ioredis";
import { config } from "@/lib/config";

/**
 * Redis singleton — the session store for the auth feature.
 *
 * Per `specs/004-user-auth/spec.md` FR-013, the application refuses
 * to boot without a reachable `REDIS_URL` (fail-closed). The
 * singleton is exported as `redis` and consumed by
 * `lib/auth/session.ts`.
 *
 * Connection-lifecycle trade-offs (this used to be the source of a
 * subtle cold-start race):
 *
 *   - `enableOfflineQueue: true`  (ioredis default) — commands sent
 *     before the underlying TCP connection is `ready` are QUEUED
 *     and fire automatically once the connection establishes. This
 *     is the right default for any client that can receive
 *     requests before its first round-trip completes (which is
 *     every real-world case where the Redis host is on a
 *     different network or has any latency at all).
 *
 *   - `enableOfflineQueue: false` — every command sent before the
 *     `ready` event throws `Error: Stream isn't writeable…`. This
 *     fails fast but it also fails the FIRST request after a cold
 *     boot, which is exactly what hit us in the field: the
 *     `POST /api/v1.0/login` race against the TCP handshake to
 *     `hydra.mls-systems.net:6379` threw 500 on every cold start.
 *
 * We keep the fail-fast posture via:
 *   - `maxRetriesPerRequest: 3` — per-command retry budget; a
 *     transient disconnect throws after 3 attempts.
 *   - `commandTimeout: 2000` — every individual command gives up
 *     after 2 seconds (so a permanently-down Redis still surfaces
 *     as 503 within ~2s of the first request, per spec FR-013).
 *   - `retryStrategy` — backs off reconnect attempts and gives up
 *     after 10 attempts so a permanently-down host doesn't sit
 *     retrying forever in the background.
 *
 * Net effect: commands issued during the boot handshake are
 * safely queued; commands issued when Redis is permanently
 * unreachable fail fast with a clear error that the auth
 * middleware maps to 503.
 */
let _client: RedisClient | null = null;

function buildClient(): RedisClient {
  const client = new Redis(config.auth.redisUrl, {
    // Per-command retry budget so a transient disconnect throws
    // quickly; the auth middleware maps the throw to 503.
    maxRetriesPerRequest: 3,
    // Per-command timeout (ms) — a permanently-down Redis fails
    // within ~2s of the first request hitting this client.
    commandTimeout: 2000,
    // Keep `enableOfflineQueue: true` (the ioredis default) so
    // commands issued before the TCP handshake completes are
    // queued, not rejected. The "fail fast" posture is now
    // carried by `maxRetriesPerRequest` + `commandTimeout`.
    // `enableReadyCheck: true` ensures we wait for the server
    // to be responsive (not just the TCP socket) before
    // considering the connection "ready" and flushing the
    // offline queue.
    enableReadyCheck: true,
    // Cap reconnect attempts so the singleton doesn't sit
    // retrying forever in the background after Redis dies.
    retryStrategy(times: number): number | null {
      if (times > 10) return null;
      return Math.min(times * 100, 2000);
    },
  });
  return client;
}

/**
 * The shared Redis client. Reads `REDIS_URL` from `lib/config.ts`
 * (which throws on module load if the key is missing — fail-closed).
 */
export function getRedis(): RedisClient {
  if (_client) return _client;
  _client = buildClient();
  return _client;
}

/**
 * `isRedisConnectionStateError(err)` — true when the error is
 * caused by a Redis client / connection state issue (vs. a
 * normal command error like WRONGTYPE). Used by the auth
 * middleware + login route to map these to a 503 envelope
 * instead of a 500. The check covers:
 *
 *   - The "Stream isn't writeable" / "enableOfflineQueue"
 *     family of errors emitted when a command is sent before
 *     the client is ready.
 *   - The MaxRetriesPerRequestError emitted when a command
 *     exhausted its retry budget.
 *   - Connection-level errors (ECONNREFUSED, ETIMEDOUT).
 */
export function isRedisConnectionStateError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; name?: string };
  if (
    e.code === "ECONNREFUSED" ||
    e.code === "ETIMEDOUT" ||
    e.code === "EAI_AGAIN" ||
    e.code === "EPIPE"
  ) {
    return true;
  }
  if (e.name === "MaxRetriesPerRequestError") return true;
  if (typeof e.message === "string") {
    // The "Stream isn't writeable" error string from ioredis
    // — covers the cold-start race when `enableOfflineQueue`
    // is false (we no longer set that, but defensive in case
    // a future caller flips it).
    if (e.message.includes("Stream isn't writeable")) return true;
    if (e.message.includes("Connection is closed")) return true;
  }
  return false;
}

/**
 * Test seam — replaces the singleton with an `ioredis-mock` instance
 * (or any compatible `Redis`-shaped object) for the unit-test suite.
 * NOT used by application code.
 */
export function __setRedisForTests(client: RedisClient | null): void {
  _client = client;
}
