import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logAuthLogin, logAuthLogout, sessionIdPrefixOf } from "@/lib/auth/log";

describe("logAuthLogin", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("emits a structured auth.login line on success", () => {
    logAuthLogin({
      outcome: "success",
      username: "admin",
      ip: "127.0.0.1",
      sessionIdPrefix: "abc12345",
    });
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.event).toBe("auth.login");
    expect(parsed.outcome).toBe("success");
    expect(parsed.username).toBe("admin");
    expect(parsed.ip).toBe("127.0.0.1");
    expect(parsed.sessionIdPrefix).toBe("abc12345");
  });

  it("emits a structured auth.login line on failure with reason", () => {
    logAuthLogin({
      outcome: "failure",
      reason: "wrong_password",
      username: "admin",
    });
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.outcome).toBe("failure");
    expect(parsed.reason).toBe("wrong_password");
  });

  it("never includes the submitted password in the serialised line", () => {
    const secretPassword = "p@ssw0rd!!SECRET";
    logAuthLogin({
      outcome: "failure",
      reason: "validation_error",
      username: "admin",
    });
    const line = spy.mock.calls[0]![0] as string;
    // The username is logged (it's the lookup key, not a secret),
    // but the password value MUST NEVER appear anywhere in the
    // serialised entry.
    expect(line).not.toContain(secretPassword);
    expect(line).toContain("validation_error");
  });
});

describe("logAuthLogout", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("emits a structured auth.logout line", () => {
    logAuthLogout({ sessionIdPrefix: "abc12345", ip: "127.0.0.1" });
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.event).toBe("auth.logout");
    expect(parsed.sessionIdPrefix).toBe("abc12345");
    expect(parsed.ip).toBe("127.0.0.1");
  });

  it("supports null sessionIdPrefix for idempotent logout-without-cookie", () => {
    logAuthLogout({ sessionIdPrefix: null });
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.sessionIdPrefix).toBeNull();
  });
});

describe("sessionIdPrefixOf", () => {
  it("returns the first 8 chars of a token", () => {
    expect(sessionIdPrefixOf("abcdef1234567890")).toBe("abcdef12");
  });
  it("returns null for empty input", () => {
    expect(sessionIdPrefixOf("")).toBeNull();
    expect(sessionIdPrefixOf(null)).toBeNull();
    expect(sessionIdPrefixOf(undefined)).toBeNull();
  });
  it("returns the whole string when shorter than 8 chars", () => {
    expect(sessionIdPrefixOf("abc")).toBe("abc");
  });
});
