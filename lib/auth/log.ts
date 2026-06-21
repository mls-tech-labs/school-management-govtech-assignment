/**
 * Structured auth-event logging per spec FR-027 (login) and FR-028 (logout).
 *
 * Each function emits EXACTLY ONE structured JSON line to stdout via
 * `console.log(JSON.stringify(...))`. The line includes the event
 * discriminator, outcome, and the minimum metadata needed for an
 * operator to correlate entries server-side.
 *
 * SECURITY — per spec SC-012 + research §11:
 *   - The structured entry MUST NEVER contain the submitted password,
 *     the stored hash, the stored salt, or the FULL session cookie
 *     value.
 *   - Session correlation is achieved by emitting only the first 8
 *     characters of the sessionId (the `sessionIdPrefix` field) —
 *     enough to correlate a `login` + `logout` pair without
 *     leaking the bearer token.
 *
 * The functions are pure (no I/O besides `console.log`) so they can
 * be unit-tested with a `vi.spyOn(console, "log")`.
 */

export type LoginOutcome = "success" | "failure";
export type LoginFailureReason =
  | "validation_error"
  | "unknown_user"
  | "wrong_password"
  | "inactive_user"
  | "internal_error"
  // Mapped to a 503 (retry-friendly) instead of 500 — the
  // credentials were valid but we couldn't persist the session.
  | "redis_unavailable";

export interface LogAuthLoginInput {
  outcome: LoginOutcome;
  reason?: LoginFailureReason;
  username: string;
  ip?: string | null;
  timestamp?: string;
  sessionIdPrefix?: string | null;
}

export interface LogAuthLogoutInput {
  sessionIdPrefix: string | null;
  ip?: string | null;
  timestamp?: string;
}

/**
 * Emit a structured `auth.login` log entry. Returns nothing — the
 * caller does not need to inspect the result.
 */
export function logAuthLogin(input: LogAuthLoginInput): void {
  const entry = {
    event: "auth.login" as const,
    outcome: input.outcome,
    ...(input.reason ? { reason: input.reason } : {}),
    username: input.username,
    ip: input.ip ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
    sessionIdPrefix: input.sessionIdPrefix ?? null,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

/**
 * Emit a structured `auth.logout` log entry.
 */
export function logAuthLogout(input: LogAuthLogoutInput): void {
  const entry = {
    event: "auth.logout" as const,
    sessionIdPrefix: input.sessionIdPrefix,
    ip: input.ip ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

/**
 * Extract the first 8 characters of a sessionId for log correlation.
 * Defensive: returns `null` for empty / non-string inputs so a
 * missing cookie produces a `null` prefix rather than leaking the
 * session cookie name.
 */
export function sessionIdPrefixOf(sessionId: string | null | undefined): string | null {
  if (typeof sessionId !== "string" || sessionId.length === 0) return null;
  return sessionId.slice(0, 8);
}
