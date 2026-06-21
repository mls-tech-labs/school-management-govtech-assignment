import { describe, it, expect } from "vitest";
import { mintCspNonce, buildCspHeader } from "@/lib/security/csp";

describe("mintCspNonce", () => {
  it("returns a base64url string", () => {
    const n = mintCspNonce();
    expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("is non-empty", () => {
    expect(mintCspNonce().length).toBeGreaterThan(0);
  });
  it("returns distinct values across calls", () => {
    const a = mintCspNonce();
    const b = mintCspNonce();
    expect(a).not.toBe(b);
  });
  it("encodes 16 raw bytes (22 base64url chars, no padding)", () => {
    expect(mintCspNonce()).toHaveLength(22);
  });
});

describe("buildCspHeader (nonce variant)", () => {
  // 22-char base64url nonce (matches the mint output length).
  const nonce = "abcdef1234567890abcdef";

  it("substitutes the __CSP_NONCE__ placeholder", () => {
    const template =
      "default-src 'self'; script-src 'self' __CSP_NONCE__; style-src 'self' 'unsafe-inline'";
    const { name, value } = buildCspHeader(template, nonce, false);
    expect(name).toBe("Content-Security-Policy");
    expect(value).toContain(`'nonce-${nonce}'`);
    expect(value).not.toContain("__CSP_NONCE__");
  });

  it("emits the report-only header name when reportOnly=true", () => {
    const { name } = buildCspHeader(
      "script-src 'self' __CSP_NONCE__",
      nonce,
      true,
    );
    expect(name).toBe("Content-Security-Policy-Report-Only");
  });

  it("appends nonce to script-src when the template has no placeholder", () => {
    const template = "default-src 'self'; script-src 'self'; style-src 'self'";
    const { value } = buildCspHeader(template, nonce, false);
    expect(value).toContain(`script-src 'self' 'nonce-${nonce}'`);
  });

  it("creates a script-src directive when the template has none", () => {
    const template = "default-src 'self'";
    const { value } = buildCspHeader(template, nonce, false);
    expect(value).toContain(`script-src 'self' 'nonce-${nonce}'`);
  });

  it("strips dangerous characters and caps length defensively", () => {
    // Inject single quote, semicolon, whitespace, `+`/`/`/`=`
    // (which are in the standard base64 alphabet but would let
    // an attacker break out of the quoted source) and arbitrary
    // alphanumeric text. After the strip + cap, ONLY the
    // base64url prefix (length ≤ 32) should survive.
    const dirty = `${nonce}';evil=true;//\n\t+rawbase64/with=padding`;
    const { value } = buildCspHeader(
      "script-src 'self' __CSP_NONCE__",
      dirty,
      false,
    );
    // The nonce source must end at the closing single quote —
    // no orphan single-quote in the middle that would re-open it.
    const match = value.match(/'nonce-([^']*)'/);
    expect(match).not.toBeNull();
    // The captured payload must be EXACTLY the original base64url
    // nonce (22 chars) — every dangerous char AND every trailing
    // alphanumeric payload was stripped by the length cap.
    expect(match![1]).toBe(nonce);
    expect(match![1].length).toBeLessThanOrEqual(32);
    // The dangerous text MUST NOT appear anywhere in the value.
    expect(value).not.toContain("evil");
    expect(value).not.toContain("rawbase64");
  });

  it("emits an empty nonce source rather than crashing on degenerate input", () => {
    // All non-base64url chars: the strip yields empty, and the
    // function must still produce a syntactically valid directive.
    const { value } = buildCspHeader(
      "script-src 'self' __CSP_NONCE__",
      "!@#$%^&*()",
      false,
    );
    expect(value).toContain("'nonce-'");
    // The CSP value must be a string (no exception thrown).
    expect(typeof value).toBe("string");
  });
});
