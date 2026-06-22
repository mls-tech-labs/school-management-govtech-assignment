import { jsonError } from "./response";

// 415 gate for body-carrying requests. GET/HEAD/DELETE have no body
// to describe so Content-Type is irrelevant (per RFC 7231 §3.1.1.1).
export function requireJson(req: Request): Response | null {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") {
    return null;
  }
  const raw = req.headers.get("content-type");
  if (!raw) return jsonError(415, "Content-Type must be application/json");
  const ct = raw.split(";")[0]?.trim().toLowerCase();
  if (ct !== "application/json") {
    return jsonError(415, "Content-Type must be application/json");
  }
  return null;
}
