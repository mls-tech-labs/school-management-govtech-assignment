// Structured auth-event logging. Each function emits exactly one
// JSON line to stdout. Entries MUST NEVER contain passwords, hashes,
// salts, or full session cookies — correlation is by sessionIdPrefix.

export type LoginOutcome = "success" | "failure";
export type LoginFailureReason =
  | "validation_error"
  | "unknown_user"
  | "wrong_password"
  | "inactive_user"
  | "internal_error"
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

// First 8 chars of a sessionId — enough to correlate login/logout
// without leaking the bearer token.
export function sessionIdPrefixOf(sessionId: string | null | undefined): string | null {
  if (typeof sessionId !== "string" || sessionId.length === 0) return null;
  return sessionId.slice(0, 8);
}
