import { describe, it, expect } from "vitest";
import { buildCspHeader, buildCompanionHeaders } from "@/lib/security/headers";

describe("buildCspHeader", () => {
  it("returns the enforce header by default", () => {
    const out = buildCspHeader("default-src 'self'", false);
    expect(out.name).toBe("Content-Security-Policy");
    expect(out.value).toBe("default-src 'self'");
  });
  it("returns the report-only header when reportOnly is true", () => {
    const out = buildCspHeader("default-src 'self'", true);
    expect(out.name).toBe("Content-Security-Policy-Report-Only");
    expect(out.value).toBe("default-src 'self'");
  });
});

describe("buildCompanionHeaders", () => {
  it("includes HSTS in production when enabled", () => {
    const out = buildCompanionHeaders("production", true);
    expect(out["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(out["X-Content-Type-Options"]).toBe("nosniff");
    expect(out["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
  it("omits HSTS in development even when enabled", () => {
    const out = buildCompanionHeaders("development", true);
    expect(out["Strict-Transport-Security"]).toBeUndefined();
  });
  it("omits HSTS in production when disabled", () => {
    const out = buildCompanionHeaders("production", false);
    expect(out["Strict-Transport-Security"]).toBeUndefined();
  });
  it("always includes nosniff + Referrer-Policy", () => {
    expect(buildCompanionHeaders("production", true)["X-Content-Type-Options"]).toBe("nosniff");
    expect(buildCompanionHeaders("development", true)["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(buildCompanionHeaders("production", false)["X-Content-Type-Options"]).toBe("nosniff");
  });
});
