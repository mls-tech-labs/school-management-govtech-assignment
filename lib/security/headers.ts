import type { NodeEnvironment } from "./types";

/**
 * `buildCspHeader(policy, reportOnly)` — produces the right
 * `Content-Security-Policy` or `Content-Security-Policy-Report-Only`
 * header for a given policy string + report-only flag.
 *
 * Per `specs/005-security-hardening/spec.md` FR-003 / FR-004, the
 * header name flips when `reportOnly=true` so an operator can
 * stage a new policy without enforcing it (browsers report
 * violations without blocking the response).
 */
export interface HeaderDescriptor {
  name: string;
  value: string;
}

export function buildCspHeader(
  policy: string,
  reportOnly: boolean,
): HeaderDescriptor {
  return {
    name: reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value: policy,
  };
}

/**
 * `buildCompanionHeaders(nodeEnv, hstsEnabled)` — the three
 * always-present companions of a security-hardened response:
 *
 *   1. `X-Content-Type-Options: nosniff`
 *      Prevents MIME-sniffing — defense against content-confusion
 *      attacks where an attacker uploads something the browser
 *      executes as a different type than declared.
 *
 *   2. `Referrer-Policy: strict-origin-when-cross-origin`
 *      Sends the FULL origin only on same-origin requests;
 *      downgrade to just origin on cross-origin; nothing on
 *      downgrade (HTTPS→HTTP). Defends against leaking internal
 *      URLs in `Referer` headers.
 *
 *   3. `Strict-Transport-Security: max-age=63072000; includeSubDomains`
 *      HSTS — present ONLY in production with `HSTS_ENABLED=true`.
 *      Two-year max-age matches the spec; `includeSubDomains`
 *      applies the policy to every subdomain. In dev over HTTP we
 *      omit it (browsers ignore HSTS over HTTP anyway, but emitting
 *      it would clutter the response and could confuse dev tools).
 */
export function buildCompanionHeaders(
  nodeEnv: NodeEnvironment,
  hstsEnabled: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
  if (nodeEnv === "production" && hstsEnabled) {
    headers["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains";
  }
  return headers;
}
