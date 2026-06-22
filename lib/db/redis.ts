import Redis, { type Redis as RedisClient } from "ioredis";
import { config } from "@/lib/config";

let _client: RedisClient | null = null;

function buildClient(): RedisClient {
  return new Redis(config.auth.redisUrl, {
    // Per-command retry budget so a transient disconnect throws quickly;
    // the auth middleware maps the throw to 503.
    maxRetriesPerRequest: 3,
    // Per-command timeout (ms) — permanently-down Redis fails within ~2s.
    commandTimeout: 2000,
    enableReadyCheck: true,
    // Cap reconnect attempts so a permanently-down host doesn't sit
    // retrying forever in the background.
    retryStrategy(times: number): number | null {
      if (times > 10) return null;
      return Math.min(times * 100, 2000);
    },
  });
}

export function getRedis(): RedisClient {
  if (_client) return _client;
  _client = buildClient();
  return _client;
}

// True when the error is a Redis connection-state issue (vs. a normal
// command error). Used to map these to 503 instead of 500.
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
    if (e.message.includes("Stream isn't writeable")) return true;
    if (e.message.includes("Connection is closed")) return true;
  }
  return false;
}

// Test seam — replaces the singleton with an `ioredis-mock` instance.
export function __setRedisForTests(client: RedisClient | null): void {
  _client = client;
}
