import type { NodeEnvironment } from "./types";

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

// nosniff, Referrer-Policy, and (in production) HSTS.
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
