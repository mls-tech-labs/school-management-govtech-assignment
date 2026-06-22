import { randomBytes } from "node:crypto";
import { getRedis } from "@/lib/db/redis";
import { config } from "@/lib/config";

export interface SessionRecord {
  userId: number;
  ulid: string;
  createdAt: string;
  csrfToken: string;
}

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

// 32 bytes → 43-char base64url string; the token is the Redis key.
function mintSessionId(): string {
  return randomBytes(32).toString("base64url");
}

const SESSION_PREFIX = "session:";

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

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  if (!sessionId) return null;
  const raw = await getRedis().get(`${SESSION_PREFIX}${sessionId}`);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSessionRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Idempotent — DEL on a non-existent key is a no-op.
export async function destroySession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await getRedis().del(`${SESSION_PREFIX}${sessionId}`);
}
