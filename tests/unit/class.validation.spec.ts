import { describe, it, expect } from "vitest";
import {
  createClassRequestSchema,
  putClassRequestSchema,
  deleteClassRequestSchema,
} from "@/lib/validation/class";

/**
 * Unit tests for the `POST /api/v1.0/classes` Joi request schema.
 *
 * Per `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
 * (POST/GET reference object shape), the `level` and `formTeacher`
 * fields on the wire are nested `{ ulid, name? }` objects (not flat
 * strings). The `ulid` fields are the server-side lookup keys
 * resolved against `uq_levels_ulid` / `uq_teachers_ulid`; the nested
 * `name` fields are display hints and are ignored server-side.
 *
 * The previous `teacherEmail` flat string is replaced by the nested
 * `formTeacher: { ulid, name? }` object.
 */

describe("createClassRequestSchema", () => {
  it("accepts a valid class payload with nested level + formTeacher", () => {
    const { value, error } = createClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1", name: "Primary 1" },
      name: "Class 1A",
      formTeacher: {
        ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R",
        name: "Alice Tan",
      },
    });
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      level: { ulid: "01H000000000000000000000B1", name: "Primary 1" },
      name: "Class 1A",
      formTeacher: {
        ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R",
        name: "Alice Tan",
      },
    });
  });

  it("accepts reference objects without an optional name (display hint)", () => {
    const { error } = createClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1" },
      name: "Class 1A",
      formTeacher: { ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R" },
    });
    expect(error).toBeUndefined();
  });

  it("rejects a missing level.ulid", () => {
    const { error } = createClassRequestSchema.validate({
      level: { name: "Primary 1" },
      name: "Class 1A",
      formTeacher: { ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R" },
    });
    expect(error?.details[0]?.path.join(".")).toContain("level.ulid");
  });

  it("rejects a level.ulid of wrong length", () => {
    const { error } = createClassRequestSchema.validate({
      level: { ulid: "short" },
      name: "Class 1A",
      formTeacher: { ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R" },
    });
    expect(error?.details[0]?.path.join(".")).toContain("level.ulid");
  });

  it("rejects a missing formTeacher.ulid", () => {
    const { error } = createClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1" },
      name: "Class 1A",
      formTeacher: { name: "Alice Tan" },
    });
    expect(error?.details[0]?.path.join(".")).toContain(
      "formTeacher.ulid",
    );
  });

  it("rejects a formTeacher.ulid with invalid Crockford Base32 characters", () => {
    const { error } = createClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1" },
      name: "Class 1A",
      formTeacher: { ulid: "01H00000000000000000000OUL1" },
    });
    expect(error?.details[0]?.path.join(".")).toContain(
      "formTeacher.ulid",
    );
  });

  it("rejects missing name", () => {
    const { error } = createClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1" },
      formTeacher: { ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R" },
    });
    expect(error?.details[0]?.path).toContain("name");
  });

  it("rejects unknown extra top-level fields", () => {
    const { error } = createClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1" },
      name: "Class 1A",
      formTeacher: { ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R" },
      extra: "nope",
    });
    expect(error).toBeDefined();
  });

  it("rejects unknown extra fields inside level / formTeacher objects", () => {
    const { error } = createClassRequestSchema.validate({
      level: {
        ulid: "01H000000000000000000000B1",
        label: "wrong field name",
      },
      name: "Class 1A",
      formTeacher: {
        ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R",
        email: "alice@example.com",
      },
    });
    expect(error).toBeDefined();
  });

  it("rejects the legacy flat teacherEmail field", () => {
    const { error } = createClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1" },
      name: "Class 1A",
      teacherEmail: "alice@example.com",
    });
    expect(error).toBeDefined();
  });
});

/**
 * PUT class schema — per FR-008, mirrors the POST shape exactly. The
 * `ulid` is taken from the path parameter (not the body), and
 * `additionalProperties: false` blocks ulid-sneaking-via-body and
 * any other typos.
 */
describe("putClassRequestSchema", () => {
  it("accepts a valid PUT body with nested level + formTeacher", () => {
    const { error } = putClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1" },
      name: "Class 1A",
      formTeacher: { ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R" },
    });
    expect(error).toBeUndefined();
  });

  it("rejects an extra `ulid` top-level field", () => {
    const { error } = putClassRequestSchema.validate({
      ulid: "01H000000000000000000000B1",
      level: { ulid: "01H000000000000000000000B1" },
      name: "Class 1A",
      formTeacher: { ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R" },
    });
    expect(error).toBeDefined();
  });

  it("rejects a missing level.ulid", () => {
    const { error } = putClassRequestSchema.validate({
      level: { name: "Primary 1" },
      name: "Class 1A",
      formTeacher: { ulid: "01HZX8K2D5Y3J8QF8W9B3N5P7R" },
    });
    expect(error).toBeDefined();
  });

  it("rejects a missing formTeacher.ulid", () => {
    const { error } = putClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1" },
      name: "Class 1A",
      formTeacher: { name: "Alice Tan" },
    });
    expect(error).toBeDefined();
  });

  it("rejects the legacy flat teacherEmail field", () => {
    const { error } = putClassRequestSchema.validate({
      level: { ulid: "01H000000000000000000000B1" },
      name: "Class 1A",
      teacherEmail: "alice@example.com",
    });
    expect(error).toBeDefined();
  });
});

/**
 * DELETE class schema — per Principle VII, empty body still runs
 * validation. The schema rejects any non-empty body.
 */
describe("deleteClassRequestSchema", () => {
  it("accepts an empty body", () => {
    const { error } = deleteClassRequestSchema.validate({});
    expect(error).toBeUndefined();
  });

  it("rejects a non-empty body", () => {
    const { error } = deleteClassRequestSchema.validate({ foo: "bar" });
    expect(error).toBeDefined();
  });
});
