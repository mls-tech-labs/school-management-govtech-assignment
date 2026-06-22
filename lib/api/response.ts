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
