import { describe, it, expect } from "vitest";
import { createTeacherRequestSchema } from "@/lib/validation/teacher";

/**
 * Unit tests for the `POST /api/v1.0/teachers` Joi request schema.
 *
 * Per `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
 * (POST/GET reference object shape), the `subject` field on the wire
 * is a nested `{ ulid, name? }` object (not a flat string). The
 * `subject.ulid` is the server-side lookup key resolved against
 * `uq_subjects_ulid`; the nested `subject.name` is a display hint
 * and is ignored server-side.
 *
 * Per FR-004 (Session 2026-06-21), `contactNumber` is exactly 8
 * digits with no leading-digit restriction.
 */

describe("createTeacherRequestSchema", () => {
  it("accepts a valid teacher payload with nested subject", () => {
    const { value, error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: {
        ulid: "01H000000000000000000000A1",
        name: "Mathematics",
      },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      name: "Mary",
      subject: {
        ulid: "01H000000000000000000000A1",
        name: "Mathematics",
      },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
  });

  it("accepts subject without an optional name (display hint)", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error).toBeUndefined();
  });

  it("rejects missing name", () => {
    const { error } = createTeacherRequestSchema.validate({
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error?.details[0]?.path).toContain("name");
  });

  it("rejects a missing subject.ulid", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { name: "Mathematics" },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error?.details[0]?.path.join(".")).toContain("subject.ulid");
  });

  it("rejects a subject.ulid of wrong length", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "short" },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error?.details[0]?.path.join(".")).toContain("subject.ulid");
  });

  it("rejects a subject.ulid with invalid Crockford Base32 characters", () => {
    // ULIDs may not contain I, L, O, U.
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H00000000000000000000OUL1" }, // contains I, L, O, U
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error?.details[0]?.path.join(".")).toContain("subject.ulid");
  });

  it("rejects an invalid email format", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "not-an-email",
      contactNumber: "91234567",
    });
    expect(error?.details[0]?.path).toContain("email");
  });

  it("accepts contact numbers that do NOT start with 8 or 9 (FR-004 — no leading-digit restriction)", () => {
    // Per `specs/001-teachers/spec.md` FR-004 (Session 2026-06-21):
    // the previous `^[89]\d{7}$` Singapore-mobile assumption was removed.
    // A 6-prefix contact number is valid as long as it is exactly 8 digits.
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "61234567",
    });
    expect(error).toBeUndefined();
  });

  it("rejects contact numbers of wrong length", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "912345",
    });
    expect(error?.details[0]?.path).toContain("contactNumber");
  });

  it("rejects contact numbers with non-digit characters", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "9123-567",
    });
    expect(error?.details[0]?.path).toContain("contactNumber");
  });

  it("rejects unknown extra top-level fields", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "91234567",
      extra: "nope",
    });
    expect(error).toBeDefined();
  });

  it("rejects unknown extra fields inside the subject object", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: {
        ulid: "01H000000000000000000000A1",
        name: "Mathematics",
        label: "Maths",
      },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error).toBeDefined();
  });
});
