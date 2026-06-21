import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCsrfToken } from "@/lib/security/csrf-client";

/**
 * Minimal `document.cookie` polyfill — JSDOM 25 doesn't ship a writable
 * `document.cookie` by default, so we use a plain object + a getter.
 */
function withCookieJar(initial: Record<string, string> = {}, run: () => void) {
  const stored: Record<string, string> = { ...initial };
  Object.defineProperty(globalThis, "document", {
    value: {
      get cookie() {
        return Object.entries(stored)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
      },
    },
    configurable: true,
  });
  try {
    run();
  } finally {
    // @ts-expect-error - cleanup
    delete globalThis.document;
  }
}

describe("getCsrfToken", () => {
  beforeEach(() => {
    // @ts-expect-error - ensure undefined in SSR-like mode
    delete globalThis.document;
  });
  afterEach(() => {
    // @ts-expect-error - cleanup
    delete globalThis.document;
  });

  it("returns null when document is undefined (SSR safety)", () => {
    expect(getCsrfToken()).toBeNull();
  });

  it("returns null when csrfToken cookie is absent", () => {
    withCookieJar({}, () => {
      expect(getCsrfToken()).toBeNull();
    });
  });

  it("returns the cookie value when csrfToken is present", () => {
    withCookieJar({ csrfToken: "abc123" }, () => {
      expect(getCsrfToken()).toBe("abc123");
    });
  });

  it("handles a cookie jar with multiple cookies", () => {
    withCookieJar({ session: "session_value", csrfToken: "tok_xyz" }, () => {
      expect(getCsrfToken()).toBe("tok_xyz");
    });
  });
});
