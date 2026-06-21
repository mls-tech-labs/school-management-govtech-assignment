import { describe, it, expect } from "vitest";
import {
  setSessionCookie,
  clearSessionCookie,
  readSessionCookie,
  setCsrfCookie,
  clearCsrfCookie,
  readCsrfCookie,
} from "@/lib/auth/cookie";

function makeRes(): Response {
  return new Response("body");
}

function readSetCookies(res: Response): string[] {
  const out: string[] = [];
  res.headers.forEach((v, k) => {
    if (k.toLowerCase() === "set-cookie") out.push(v);
  });
  return out;
}

describe("setSessionCookie", () => {
  it("includes Path, Max-Age, HttpOnly, SameSite", () => {
    const res = makeRes();
    setSessionCookie(res, "tok_abc");
    const cookies = readSetCookies(res);
    expect(cookies.length).toBeGreaterThanOrEqual(1);
    const c = cookies.join(";");
    expect(c).toContain("pvt_edu_session=tok_abc");
    expect(c).toContain("Path=/");
    expect(c).toContain("Max-Age=1800");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Strict");
  });
});

describe("clearSessionCookie", () => {
  it("clears with Max-Age=0 and past Expires", () => {
    const res = makeRes();
    clearSessionCookie(res);
    const cookies = readSetCookies(res);
    const c = cookies.join(";");
    expect(c).toContain("pvt_edu_session=");
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("Expires=Thu, 01 Jan 1970");
    expect(c).toContain("Path=/");
    expect(c).toContain("HttpOnly");
  });
});

describe("readSessionCookie", () => {
  it("returns the token when present", () => {
    const req = new Request("http://x/", {
      headers: { cookie: "pvt_edu_session=tok_xyz; foo=bar" },
    });
    expect(readSessionCookie(req)).toBe("tok_xyz");
  });
  it("returns null when missing", () => {
    const req = new Request("http://x/");
    expect(readSessionCookie(req)).toBeNull();
  });
  it("returns null when other cookies are present", () => {
    const req = new Request("http://x/", { headers: { cookie: "foo=bar" } });
    expect(readSessionCookie(req)).toBeNull();
  });
});

describe("CSRF cookie helpers", () => {
  it("setCsrfCookie omits HttpOnly but includes Path/Max-Age/SameSite", () => {
    const res = makeRes();
    setCsrfCookie(res, "csrf_abc");
    const c = readSetCookies(res).join(";");
    expect(c).toContain("csrfToken=csrf_abc");
    expect(c).toContain("Path=/");
    expect(c).toContain("Max-Age=1800");
    expect(c).toContain("SameSite=Strict");
    expect(c).not.toContain("HttpOnly");
  });
  it("clearCsrfCookie clears with Max-Age=0", () => {
    const res = makeRes();
    clearCsrfCookie(res);
    const c = readSetCookies(res).join(";");
    expect(c).toContain("csrfToken=");
    expect(c).toContain("Max-Age=0");
  });
  it("readCsrfCookie returns null when missing", () => {
    expect(readCsrfCookie(new Request("http://x/"))).toBeNull();
  });
  it("readCsrfCookie returns the token when present", () => {
    const req = new Request("http://x/", {
      headers: { cookie: "csrfToken=tok_c; pvt_edu_session=tok_s" },
    });
    expect(readCsrfCookie(req)).toBe("tok_c");
  });
});
