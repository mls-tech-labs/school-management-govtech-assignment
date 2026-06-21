import { describe, it, expect } from "vitest";
import { loginRequestSchema } from "@/lib/auth/schemas";

describe("loginRequestSchema", () => {
  it("accepts a valid { username, password } object", () => {
    const { error, value } = loginRequestSchema.validate({
      username: "admin",
      password: "hunter2",
    });
    expect(error).toBeUndefined();
    expect(value).toEqual({ username: "admin", password: "hunter2" });
  });

  it("rejects missing username", () => {
    const { error } = loginRequestSchema.validate({ password: "x" });
    expect(error).toBeDefined();
  });

  it("rejects missing password", () => {
    const { error } = loginRequestSchema.validate({ username: "admin" });
    expect(error).toBeDefined();
  });

  it("rejects unknown fields", () => {
    const { error } = loginRequestSchema.validate({
      username: "admin",
      password: "x",
      rememberMe: true,
    });
    expect(error).toBeDefined();
  });

  it("rejects username longer than 64 chars", () => {
    const { error } = loginRequestSchema.validate({
      username: "a".repeat(65),
      password: "x",
    });
    expect(error).toBeDefined();
  });

  it("rejects password longer than 255 chars", () => {
    const { error } = loginRequestSchema.validate({
      username: "admin",
      password: "a".repeat(256),
    });
    expect(error).toBeDefined();
  });

  it("rejects empty objects", () => {
    const { error } = loginRequestSchema.validate({});
    expect(error).toBeDefined();
  });

  it("rejects non-objects (strings, numbers)", () => {
    expect(loginRequestSchema.validate("hello").error).toBeDefined();
    expect(loginRequestSchema.validate(123).error).toBeDefined();
    expect(loginRequestSchema.validate(null).error).toBeDefined();
  });
});
