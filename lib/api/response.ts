/**
 * Cross-cutting response helpers.
 *
 * Every API endpoint uses these to produce responses, so the envelope shape
 * (`{ "error": "..." }` for errors, `{ "data": ... }` for list endpoints, a
 * flat JSON object for single-resource POST/GET) and the Content-Type are
 * consistent across the whole app.
 *
 * Per `specs/003-backend-api-db/spec.md` FR-011, FR-012, FR-015.
 */

export function errorEnvelope(message: string): { error: string } {
  return { error: message };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonError(status: number, message: string): Response {
  return jsonResponse(status, errorEnvelope(message));
}

export function jsonOk<T>(data: T): Response {
  return jsonResponse(200, data);
}

export function jsonCreated<T>(data: T): Response {
  return jsonResponse(201, data);
}
