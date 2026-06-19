import { jsonError } from "./response";

/**
 * 415 gate per `specs/003-backend-api-db/spec.md` FR-010.
 *
 * Returns a `415 Unsupported Media Type` response if the request `Content-Type`
 * is not `application/json` (or `application/json; charset=...`). Returns
 * `null` if the gate passes.
 *
 * GET requests (no body) are allowed through regardless of Content-Type.
 */
export function requireJson(req: Request): Response | null {
  if (req.method === "GET" || req.method === "HEAD") return null;

  const raw = req.headers.get("content-type");
  if (!raw) {
    return jsonError(415, "Content-Type must be application/json");
  }
  // Accept "application/json" with or without charset / parameters.
  const ct = raw.split(";")[0]?.trim().toLowerCase();
  if (ct !== "application/json") {
    return jsonError(415, "Content-Type must be application/json");
  }
  return null;
}
