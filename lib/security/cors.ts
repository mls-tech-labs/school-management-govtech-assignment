import type { NextRequest } from "next/server";

const PREFLIGHT_METHODS =
  "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD" as const;

export function matchOrigin(origin: string | null, allowedCsv: string): boolean {
  if (!origin || typeof origin !== "string") return false;
  if (origin === "null" || origin.trim().length === 0) return false;
  const allowed = new Set(
    allowedCsv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
  return allowed.has(origin.trim().toLowerCase());
}

export function isPreflight(req: { method: string; headers: Headers }): boolean {
  if (req.method.toUpperCase() !== "OPTIONS") return false;
  const arm = req.headers.get("access-control-request-method");
  return typeof arm === "string" && arm.length > 0;
}

export function buildCorsHeaders(
  allowedOrigin: string,
  allowedHeaders: string,
  req: { method: string; headers: Headers },
): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  if (isPreflight(req)) {
    base["Access-Control-Allow-Headers"] = allowedHeaders;
    base["Access-Control-Allow-Methods"] = PREFLIGHT_METHODS;
  }
  return base;
}

export function buildCorsRejectionResponse(_req: NextRequest): Response {
  return new Response(JSON.stringify({ error: "cors" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
