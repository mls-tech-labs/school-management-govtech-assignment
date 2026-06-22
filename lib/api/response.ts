/**
 * Cross-cutting response helpers.
 *
 * Every API endpoint uses these to produce responses, so the envelope shape
 * (`{ "error": "..." }` for errors, `{ "data": ... }` for list endpoints, a
 * flat JSON object for single-resource POST/GET) and the Content-Type are
 * consistent across the whole app.
 *
 * Per `specs/003-backend-api-db/spec.md` FR-011, FR-012, FR-015.
 *
 * Stage 3 (`006-teachers-classes-mutations`) adds an optional `details`
 * extension on the error envelope — used by DELETE-Teacher 409 to surface
 * the singular `classUlid` / `className` of the blocking class (per
 * `006-teachers-classes-mutations/spec.md` Clarifications Session
 * 2026-06-22 — DELETE-Teacher 409 envelope one-to-one simplification).
 * The extension is additive: clients that only read `error` keep working.
 */

export function errorEnvelope(
  message: string,
  details?: Record<string, unknown>,
): { error: string; details?: Record<string, unknown> } {
  return details === undefined ? { error: message } : { error: message, details };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonError(
  status: number,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(status, errorEnvelope(message, details));
}

export function jsonOk<T>(data: T): Response {
  return jsonResponse(200, data);
}

export function jsonCreated<T>(data: T): Response {
  return jsonResponse(201, data);
}