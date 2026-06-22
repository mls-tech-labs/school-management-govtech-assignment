import { jsonError } from "./response";

/**
 * 415 gate per `specs/003-backend-api-db/spec.md` FR-010.
 *
 * Returns a `415 Unsupported Media Type` response if the request `Content-Type`
 * is not `application/json` (or `application/json; charset=...`). Returns
 * `null` if the gate passes.
 *
 * Body-less methods (`GET`, `HEAD`, `DELETE`) are allowed through regardless
 * of `Content-Type`. Per RFC 7231 §3.1.1.5 a payload without a media type is
 * fine, and per RFC 7231 §3.1.1.1 `Content-Type` has no meaning when there
 * is no body to describe. Browsers' `fetch()` API does NOT set `Content-Type`
 * automatically on body-less DELETE (it only does so for POST/PUT/PATCH with
 * a body), so requiring it would produce spurious 415s on legitimate
 * no-body DELETEs while not providing any actual safety.
 *
 * POST / PUT / PATCH still enforce the strict `application/json` check —
 * those are the only body-carrying methods the API exposes today, and the
 * schema (Joi) requires the body to be valid JSON.
 */
export function requireJson(req: Request): Response | null {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "DELETE"
  ) {
    return null;
  }

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
