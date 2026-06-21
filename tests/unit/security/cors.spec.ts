import { describe, it, expect } from "vitest";
import {
  matchOrigin,
  isPreflight,
  buildCorsHeaders,
} from "@/lib/security/cors";

describe("matchOrigin", () => {
  it("returns false for null origin", () => {
    expect(matchOrigin(null, "http://a.com")).toBe(false);
  });
  it("returns false for empty origin", () => {
    expect(matchOrigin("", "http://a.com")).toBe(false);
  });
  it("returns false for 'null' string origin", () => {
    expect(matchOrigin("null", "http://a.com")).toBe(false);
  });
  it("returns false for empty allow list", () => {
    expect(matchOrigin("http://a.com", "")).toBe(false);
  });
  it("returns true for exact match", () => {
    expect(matchOrigin("http://a.com", "http://a.com")).toBe(true);
  });
  it("matches case-insensitively", () => {
    expect(matchOrigin("HTTP://A.COM", "http://a.com")).toBe(true);
    expect(matchOrigin("http://a.com", "HTTP://A.COM")).toBe(true);
  });
  it("trims whitespace from CSV", () => {
    expect(matchOrigin("http://a.com", " http://a.com , http://b.com ")).toBe(
      true,
    );
  });
  it("matches one of multiple CSV entries", () => {
    expect(
      matchOrigin("http://b.com", "http://a.com,http://b.com,http://c.com"),
    ).toBe(true);
  });
  it("returns false for a non-listed origin", () => {
    expect(matchOrigin("http://evil.com", "http://a.com")).toBe(false);
  });
});

describe("isPreflight", () => {
  it("returns true for OPTIONS + Access-Control-Request-Method", () => {
    const h = new Headers({ "access-control-request-method": "POST" });
    expect(isPreflight({ method: "OPTIONS", headers: h })).toBe(true);
  });
  it("returns false for OPTIONS without ARM", () => {
    const h = new Headers();
    expect(isPreflight({ method: "OPTIONS", headers: h })).toBe(false);
  });
  it("returns false for GET even with ARM", () => {
    const h = new Headers({ "access-control-request-method": "POST" });
    expect(isPreflight({ method: "GET", headers: h })).toBe(false);
  });
});

describe("buildCorsHeaders", () => {
  it("returns full preflight set for OPTIONS", () => {
    const h = new Headers({ "access-control-request-method": "POST" });
    const out = buildCorsHeaders(
      "http://a.com",
      "Content-Type, X-CSRF-Token",
      { method: "OPTIONS", headers: h },
    );
    expect(out["Access-Control-Allow-Origin"]).toBe("http://a.com");
    expect(out["Access-Control-Allow-Credentials"]).toBe("true");
    expect(out["Access-Control-Allow-Headers"]).toBe(
      "Content-Type, X-CSRF-Token",
    );
    expect(out["Access-Control-Allow-Methods"]).toContain("POST");
    expect(out["Vary"]).toBe("Origin");
  });
  it("returns slim set for non-preflight", () => {
    const h = new Headers();
    const out = buildCorsHeaders("http://a.com", "Content-Type", {
      method: "GET",
      headers: h,
    });
    expect(out["Access-Control-Allow-Origin"]).toBe("http://a.com");
    expect(out["Access-Control-Allow-Credentials"]).toBe("true");
    expect(out["Vary"]).toBe("Origin");
    expect(out["Access-Control-Allow-Methods"]).toBeUndefined();
    expect(out["Access-Control-Allow-Headers"]).toBeUndefined();
  });
});
