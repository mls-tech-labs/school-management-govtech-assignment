import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("@/lib/db/repositories/subject", () => ({
  getActiveSubjectNames: async () => ["English", "Mathematics", "Science"],
  listActiveSubjects: async () => [],
}));

import { buildCreateTeacherSchema } from "@/lib/validation/teacher";

describe("buildCreateTeacherSchema", () => {
  let schema: Awaited<ReturnType<typeof buildCreateTeacherSchema>>;
  beforeAll(async () => {
    schema = await buildCreateTeacherSchema();
  });

  it("accepts a valid teacher payload", () => {
    const { value, error } = schema.validate({
      name: "Mary",
      subject: "Mathematics",
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      name: "Mary",
      subject: "Mathematics",
      email: "mary@example.com",
      contactNumber: "91234567",
    });
  });

  it("rejects missing name", () => {
    const { error } = schema.validate({
      subject: "Mathematics",
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error?.details[0]?.path).toContain("name");
  });

  it("rejects an unknown subject (not in active list)", () => {
    const { error } = schema.validate({
      name: "Mary",
      subject: "Astrology",
      email: "mary@example.com",
      contactNumber: "91234567",
    });
    expect(error?.details[0]?.path).toContain("subject");
  });

  it("rejects an invalid email format", () => {
    const { error } = schema.validate({
      name: "Mary",
      subject: "Mathematics",
      email: "not-an-email",
      contactNumber: "91234567",
    });
    expect(error?.details[0]?.path).toContain("email");
  });

  it("accepts contact numbers that do NOT start with 8 or 9 (FR-004 — no leading-digit restriction)", () => {
    // Per `specs/001-teachers/spec.md` FR-004 (Session 2026-06-21):
    // the previous `^[89]\d{7}$` Singapore-mobile assumption was removed.
    // A 6-prefix contact number is valid as long as it is exactly 8 digits.
    const { error } = schema.validate({
      name: "Mary",
      subject: "Mathematics",
      email: "mary@example.com",
      contactNumber: "61234567",
    });
    expect(error).toBeUndefined();
  });

  it("rejects contact numbers of wrong length", () => {
    const { error } = schema.validate({
      name: "Mary",
      subject: "Mathematics",
      email: "mary@example.com",
      contactNumber: "912345",
    });
    expect(error?.details[0]?.path).toContain("contactNumber");
  });

  it("rejects contact numbers with non-digit characters", () => {
    const { error } = schema.validate({
      name: "Mary",
      subject: "Mathematics",
      email: "mary@example.com",
      contactNumber: "9123-567",
    });
    expect(error?.details[0]?.path).toContain("contactNumber");
  });

  it("rejects unknown extra fields", () => {
    const { error } = schema.validate({
      name: "Mary",
      subject: "Mathematics",
      email: "mary@example.com",
      contactNumber: "91234567",
      extra: "nope",
    });
    expect(error).toBeDefined();
  });
});
