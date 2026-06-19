import { describe, it, expect } from "vitest";
import { QueryFailedError } from "typeorm";
import { toApiError } from "@/lib/api/db-error";

function makeDriverError(code: string, message: string, sql?: string): QueryFailedError {
  const driver = { code, errno: 1062, sqlMessage: message, sql, codeMessage: message } as never;
  // QueryFailedError requires an EntityManager + queryRunner; for unit-test
  // purposes we only care about .driverError access via toApiError.
  const qf = new QueryFailedError(sql ?? "QUERY", [], new Error(message));
  (qf as unknown as { driverError: unknown }).driverError = driver;
  return qf;
}

describe("toApiError", () => {
  it("maps ER_DUP_ENTRY on uq_teachers_email → 409 Email already in use", () => {
    const err = makeDriverError(
      "ER_DUP_ENTRY",
      "Duplicate entry 'mary@example.com' for key 'teachers.uq_teachers_email'",
    );
    expect(toApiError(err)).toEqual({ status: 409, message: "Email already in use" });
  });

  it("maps ER_DUP_ENTRY on uq_classes_name → 409 Class name already in use", () => {
    const err = makeDriverError(
      "ER_DUP_ENTRY",
      "Duplicate entry 'Class 1A' for key 'classes.uq_classes_name'",
    );
    expect(toApiError(err)).toEqual({ status: 409, message: "Class name already in use" });
  });

  it("maps ER_DUP_ENTRY on uq_classes_form_teacher → 409 Teacher already assigned", () => {
    const err = makeDriverError(
      "ER_DUP_ENTRY",
      "Duplicate entry 'mary@example.com' for key 'classes.uq_classes_form_teacher'",
    );
    expect(toApiError(err)).toEqual({ status: 409, message: "Teacher already assigned" });
  });

  it("maps ER_NO_REFERENCED_ROW_2 on form_teacher FK → 404 Teacher not found", () => {
    const err = makeDriverError(
      "ER_NO_REFERENCED_ROW_2",
      "FK fk_classes_form_teacher: form_teacher_email does not exist",
    );
    expect(toApiError(err)).toEqual({ status: 404, message: "Teacher not found" });
  });

  it("maps ER_NO_REFERENCED_ROW_2 on subject FK → 400 Invalid subject", () => {
    const err = makeDriverError(
      "ER_NO_REFERENCED_ROW_2",
      "FK fk_teachers_subject: subject does not exist",
    );
    expect(toApiError(err)).toEqual({ status: 400, message: "Invalid subject" });
  });

  it("maps ER_NO_REFERENCED_ROW_2 on level FK → 400 Invalid level", () => {
    const err = makeDriverError(
      "ER_NO_REFERENCED_ROW_2",
      "FK fk_classes_level: level does not exist",
    );
    expect(toApiError(err)).toEqual({ status: 400, message: "Invalid level" });
  });

  it("maps ER_LOCK_WAIT_TIMEOUT → 503", () => {
    const err = makeDriverError("ER_LOCK_WAIT_TIMEOUT", "Lock wait timeout");
    expect(toApiError(err)).toEqual({
      status: 503,
      message: "Service temporarily unavailable, please retry",
    });
  });

  it("maps ECONNREFUSED → 503", () => {
    const err = { code: "ECONNREFUSED", message: "connect ECONNREFUSED" } as never;
    expect(toApiError(err)).toEqual({
      status: 503,
      message: "Service temporarily unavailable, please retry",
    });
  });

  it("maps unknown QueryFailedError → 500 with generic message", () => {
    const err = makeDriverError("ER_OH_NO", "some driver error");
    const out = toApiError(err);
    expect(out.status).toBe(500);
    expect(out.message).toBe("Internal server error");
  });

  it("maps non-DriverError throws → 500 with generic message", () => {
    expect(toApiError(new Error("boom"))).toEqual({
      status: 500,
      message: "Internal server error",
    });
  });
});
