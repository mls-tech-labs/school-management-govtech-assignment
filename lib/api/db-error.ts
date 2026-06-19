import { QueryFailedError } from "typeorm";

/**
 * Map a `typeorm.QueryFailedError` (and any other thrown value) to the
 * cross-cutting `{ status, message }` shape from
 * `specs/003-backend-api-db/spec.md` FR-013.
 *
 * The mapping is the single source of truth: every per-handler try/catch
 * funnels through here so the status-code table is consistent across all
 * four endpoints.
 */
export interface ApiError {
  status: number;
  message: string;
}

// MySQL driver error codes (from mysql2 / MySQL server).
const CODE_DUP_ENTRY = "ER_DUP_ENTRY";
const CODE_NO_REFERENCED_ROW_2 = "ER_NO_REFERENCED_ROW_2";
const CODE_LOCK_WAIT_TIMEOUT = "ER_LOCK_WAIT_TIMEOUT";
const CODE_LOCK_DEADLOCK = "ER_LOCK_DEADLOCK";
const NODE_ECONNREFUSED = "ECONNREFUSED";
const NODE_ETIMEDOUT = "ETIMEDOUT";
const NODE_EAI_AGAIN = "EAI_AGAIN";

// Named unique-index → 409 message.
const DUP_MESSAGES: Record<string, string> = {
  uq_teachers_email: "Email already in use",
  uq_classes_name: "Class name already in use",
  uq_classes_form_teacher: "Teacher already assigned",
};

export function toApiError(err: unknown): ApiError {
  // 1. typeORM QueryFailedError carries the driver code + the failed SQL in
  //    `driverError`. We only ever return messages from a closed allow-list.
  if (err instanceof QueryFailedError) {
    const driver = (err as unknown as { driverError?: { code?: string; errno?: number } })
      .driverError;
    const code = driver?.code;

    if (code === CODE_DUP_ENTRY) {
      // Try to identify the violated index from the error message. Format:
      // "Duplicate entry '...' for key 'teachers.uq_teachers_email'"
      const msg = String((err as unknown as { message?: string }).message ?? "");
      for (const [indexName, human] of Object.entries(DUP_MESSAGES)) {
        if (msg.includes(indexName)) return { status: 409, message: human };
      }
      // Unknown unique index — return a generic 409; the index name itself
      // is an implementation detail and must not leak.
      return { status: 409, message: "Conflict" };
    }

    if (code === CODE_NO_REFERENCED_ROW_2) {
      const msg = String((err as unknown as { message?: string }).message ?? "");
      // form-teacher FK vs subjects/levels FK
      if (msg.includes("fk_classes_form_teacher") || msg.includes("form_teacher_email")) {
        return { status: 404, message: "Teacher not found" };
      }
      if (msg.includes("fk_teachers_subject") || msg.includes("subject")) {
        return { status: 400, message: "Invalid subject" };
      }
      if (msg.includes("fk_classes_level") || msg.includes("level")) {
        return { status: 400, message: "Invalid level" };
      }
      return { status: 400, message: "Invalid reference" };
    }

    if (
      code === CODE_LOCK_WAIT_TIMEOUT ||
      code === CODE_LOCK_DEADLOCK
    ) {
      return { status: 503, message: "Service temporarily unavailable, please retry" };
    }

    if (code === NODE_ECONNREFUSED || code === NODE_ETIMEDOUT || code === NODE_EAI_AGAIN) {
      return { status: 503, message: "Service temporarily unavailable, please retry" };
    }

    // Unknown QueryFailedError — fall through to 500.
    return { status: 500, message: "Internal server error" };
  }

  // 2. Raw node driver errors thrown above typeORM (rare, but possible
  //    from `createConnection` / pool init paths).
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === NODE_ECONNREFUSED || code === NODE_ETIMEDOUT) {
      return { status: 503, message: "Service temporarily unavailable, please retry" };
    }
  }

  // 3. Anything else is an unhandled exception → 500 with non-leaking message.
  return { status: 500, message: "Internal server error" };
}
