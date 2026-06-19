import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("@/lib/db/repositories/level", () => ({
  getActiveLevelNames: async () => ["Primary 1", "Primary 2", "Secondary 1"],
  listActiveLevels: async () => [],
}));

import { buildCreateClassSchema } from "@/lib/validation/class";

describe("buildCreateClassSchema", () => {
  let schema: Awaited<ReturnType<typeof buildCreateClassSchema>>;
  beforeAll(async () => {
    schema = await buildCreateClassSchema();
  });

  it("accepts a valid class payload", () => {
    const { value, error } = schema.validate({
      level: "Primary 1",
      name: "Class 1A",
      teacherEmail: "mary@example.com",
    });
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      level: "Primary 1",
      name: "Class 1A",
      teacherEmail: "mary@example.com",
    });
  });

  it("rejects an unknown level", () => {
    const { error } = schema.validate({
      level: "Kindergarten",
      name: "Class K1",
      teacherEmail: "mary@example.com",
    });
    expect(error?.details[0]?.path).toContain("level");
  });

  it("rejects missing name", () => {
    const { error } = schema.validate({
      level: "Primary 1",
      teacherEmail: "mary@example.com",
    });
    expect(error?.details[0]?.path).toContain("name");
  });

  it("rejects missing teacherEmail", () => {
    const { error } = schema.validate({
      level: "Primary 1",
      name: "Class 1A",
    });
    expect(error?.details[0]?.path).toContain("teacherEmail");
  });

  it("rejects an invalid teacherEmail format", () => {
    const { error } = schema.validate({
      level: "Primary 1",
      name: "Class 1A",
      teacherEmail: "not-an-email",
    });
    expect(error?.details[0]?.path).toContain("teacherEmail");
  });

  it("rejects unknown extra fields", () => {
    const { error } = schema.validate({
      level: "Primary 1",
      name: "Class 1A",
      teacherEmail: "mary@example.com",
      extra: "nope",
    });
    expect(error).toBeDefined();
  });
});
