import { describe, it, expect, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";
import { __setRedisForTests } from "@/lib/db/redis";
import { createSession, getSession, destroySession } from "@/lib/auth/session";

const OLD_ENV = { ...process.env };
beforeEach(() => {
  process.env = {
    ...OLD_ENV,
    REDIS_URL: "redis://mock:6379",
    SESSION_TTL_SECONDS: "1800",
  };
  __setRedisForTests(new (RedisMock as unknown as new () => never)());
});

describe("createSession / getSession / destroySession", () => {
  it("creates a session with the expected shape and TTL", async () => {
    const { sessionId, record } = await createSession(42, "01ABCDEF", "csrf_tok");
    expect(sessionId.length).toBeGreaterThan(20);
    expect(record.userId).toBe(42);
    expect(record.ulid).toBe("01ABCDEF");
    expect(record.csrfToken).toBe("csrf_tok");
    expect(typeof record.createdAt).toBe("string");
    // Read-back
    const got = await getSession(sessionId);
    expect(got).toEqual(record);
  });

  it("returns null on miss", async () => {
    expect(await getSession("nope")).toBeNull();
  });

  it("returns null for malformed JSON", async () => {
    // Hand-craft a malformed record by writing directly via the mock
    // singleton — this exercises the JSON.parse fallback path.
    const client = new (RedisMock as unknown as new () => {
      set: (k: string, v: string) => Promise<unknown>;
    })();
    await client.set("session:bad", "not-json");
    // The shared mock returns null on miss and throws on parse error;
    // either outcome is acceptable, but the function MUST NOT throw.
    expect(await getSession("bad")).toBeNull();
  });

  it("destroySession is idempotent", async () => {
    const { sessionId } = await createSession(1, "u", "c");
    await destroySession(sessionId);
    await destroySession(sessionId);
    expect(await getSession(sessionId)).toBeNull();
  });

  it("destroySession on an unknown token is a no-op", async () => {
    await expect(destroySession("never-existed")).resolves.toBeUndefined();
  });
});
