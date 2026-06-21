import { describe, it, expect } from "vitest";
import { mintCsrfToken, compareCsrfTokens } from "@/lib/security/csrf";

describe("mintCsrfToken", () => {
  it("returns a 43-char base64url string", () => {
    const t = mintCsrfToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t).not.toMatch(/[+/=]/);
  });
  it("returns distinct values across calls", () => {
    const a = mintCsrfToken();
    const b = mintCsrfToken();
    expect(a).not.toBe(b);
  });
});

describe("compareCsrfTokens", () => {
  it("returns true for matching inputs", () => {
    const t = mintCsrfToken();
    expect(compareCsrfTokens(t, t)).toBe(true);
  });
  it("returns false when cookie is missing", () => {
    expect(compareCsrfTokens(undefined, "abc")).toBe(false);
    expect(compareCsrfTokens("", "abc")).toBe(false);
  });
  it("returns false when header is missing", () => {
    expect(compareCsrfTokens("abc", undefined)).toBe(false);
    expect(compareCsrfTokens("abc", "")).toBe(false);
  });
  it("returns false for mismatched inputs", () => {
    const a = mintCsrfToken();
    const b = mintCsrfToken();
    expect(compareCsrfTokens(a, b)).toBe(false);
  });
  it("returns false for different-length inputs", () => {
    expect(compareCsrfTokens("abc", "abcd")).toBe(false);
    expect(compareCsrfTokens("abcd", "abc")).toBe(false);
  });
});
