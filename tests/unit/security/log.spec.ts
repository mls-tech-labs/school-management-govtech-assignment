import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logCorsRejection, logCsrfRejection } from "@/lib/security/log";

const REQ = {
  method: "POST",
  nextUrl: { pathname: "/api/v1.0/teachers" },
  headers: new Headers({ origin: "http://evil.example.com" }),
};

describe("logCorsRejection", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("emits exactly one structured line with the cors_rejected event", () => {
    logCorsRejection(REQ as never, "origin_not_allowed");
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]![0] as string;
    expect(typeof line).toBe("string");
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe("cors_rejected");
    expect(parsed.method).toBe("POST");
    expect(parsed.path).toBe("/api/v1.0/teachers");
    expect(parsed.reason).toBe("origin_not_allowed");
    expect(parsed.origin).toBe("http://evil.example.com");
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("never includes secrets in the structured line", () => {
    const dirty = {
      method: "POST",
      nextUrl: { pathname: "/api/v1.0/teachers" },
      headers: new Headers({
        origin: "http://evil.example.com",
        cookie: "pvt_edu_session=secretvalue",
        "x-csrf-token": "secretcsrf",
      }),
    };
    logCorsRejection(dirty as never, "origin_not_allowed");
    const line = spy.mock.calls[0]![0] as string;
    expect(line).not.toContain("secretvalue");
    expect(line).not.toContain("secretcsrf");
    // Re-parse to confirm no extra fields with sensitive content.
    const parsed = JSON.parse(line);
    const serialised = JSON.stringify(parsed);
    expect(serialised).not.toContain("secretvalue");
    expect(serialised).not.toContain("secretcsrf");
  });
});

describe("logCsrfRejection", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("emits exactly one structured line with the csrf_rejected event", () => {
    logCsrfRejection(REQ as never, "csrf_mismatch");
    const line = spy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe("csrf_rejected");
    expect(parsed.reason).toBe("csrf_mismatch");
  });

  it("never includes the CSRF token value in the structured line", () => {
    const dirty = {
      method: "POST",
      nextUrl: { pathname: "/api/v1.0/teachers" },
      headers: new Headers({
        cookie: "csrfToken=secretcsrf",
        "x-csrf-token": "secretcsrf",
      }),
    };
    logCsrfRejection(dirty as never, "csrf_mismatch");
    const line = spy.mock.calls[0]![0] as string;
    expect(line).not.toContain("secretcsrf");
  });
});
