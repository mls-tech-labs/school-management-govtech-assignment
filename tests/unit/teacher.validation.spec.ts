import { describe, it, expect } from "vitest";
import {
  createTeacherRequestSchema,
  putTeacherRequestSchema,
  deleteTeacherRequestSchema,
} from "@/lib/validation/teacher";

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
 * Per FR-013 (`006-teachers-classes-mutations/spec.md`, Session
 * 2026-06-22 contact-number rule restoration), `contactNumber`
 * matches `^[89]\d{7}$` — exactly 8 digits, must start with `8` or `9`.
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

  it("rejects contact numbers that do NOT start with 8 or 9 (FR-013, Session 2026-06-22 contact-number rule restoration)", () => {
    // Per `specs/006-teachers-classes-mutations/spec.md` FR-013: the
    // Singapore `^[89]\d{7}$` rule is restored. Leading digits 0–7
    // (and 10+) are now rejected.
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "61234567",
    });
    expect(error).toBeDefined();
    expect(error?.details[0]?.path).toContain("contactNumber");
    expect(error?.details[0]?.message).toBe(
      "Contact number must start with 8 or 9 and be 8 digits.",
    );
  });

  it("accepts a Singapore 8-digit contact number starting with 8", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "81234567",
    });
    expect(error).toBeUndefined();
  });

  it("accepts a Singapore 8-digit contact number starting with 9", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error).toBeUndefined();
  });

  it("rejects contact numbers starting with 0", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "01234567",
    });
    expect(error?.details[0]?.path).toContain("contactNumber");
  });

  it("rejects 9-digit contact numbers", () => {
    const { error } = createTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "912345678",
    });
    expect(error?.details[0]?.path).toContain("contactNumber");
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

/**
 * PUT teacher schema — per FR-007, mirrors POST shape exactly.
 * `additionalProperties: false` blocks ulid sneaking in via body
 * (the ulid is the path parameter).
 */
describe("putTeacherRequestSchema", () => {
  it("accepts a valid PUT body (Singapore contact number)", () => {
    const { error } = putTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error).toBeUndefined();
  });

  it("rejects contact numbers that do not start with 8 or 9 (FR-013)", () => {
    const { error } = putTeacherRequestSchema.validate({
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "12345678",
    });
    expect(error).toBeDefined();
    expect(error?.details[0]?.path).toContain("contactNumber");
    expect(error?.details[0]?.message).toBe(
      "Contact number must start with 8 or 9 and be 8 digits.",
    );
  });

  it("rejects an extra `ulid` top-level field", () => {
    const { error } = putTeacherRequestSchema.validate({
      ulid: "01H000000000000000000000A1",
      name: "Mary",
      subject: { ulid: "01H000000000000000000000A1" },
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error).toBeDefined();
  });
});

/**
 * DELETE teacher schema — empty-body schema (per Principle VII,
 * the empty body still crosses a trust boundary).
 */
describe("deleteTeacherRequestSchema", () => {
  it("accepts an empty body", () => {
    const { error } = deleteTeacherRequestSchema.validate({});
    expect(error).toBeUndefined();
  });

  it("rejects a non-empty body", () => {
    const { error } = deleteTeacherRequestSchema.validate({
      foo: "bar",
    });
    expect(error).toBeDefined();
  });
});
