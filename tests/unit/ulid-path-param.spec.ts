import { describe, it, expect } from "vitest";
import { ulidPathParamSchema } from "@/lib/validation/teacher";

/**
 * Unit tests for the `[ulid]` path-parameter Joi schema used by every
 * Stage 3 single-resource endpoint (GET / PUT / DELETE on
 * `/api/v1.0/{teachers,classes}/[ulid]`).
 *
 * Per `003-backend-api-db/spec.md` FR-021, the cross-cutting ULID rule
 * is 26-character Crockford Base32 — no lowercase, no `I`, `L`, `O`, `U`
 * characters. The schema must reject any path parameter that does not
 * match this shape so the route handler can return
 * `400 Bad Request` + `{ "error": "Invalid ulid path parameter" }`
 * before doing any DB lookup.
 */

describe("ulidPathParamSchema", () => {
  it("accepts a valid 26-char Crockford Base32 ulid", () => {
    const { error } = ulidPathParamSchema.validate("01HZX8K2D5Y3J8QF8W9B3N5P7R");
    expect(error).toBeUndefined();
  });

  it("rejects an ulid that is too short", () => {
    const { error } = ulidPathParamSchema.validate("01HZX8K2D5Y3J8QF");
    expect(error).toBeDefined();
  });

  it("rejects an ulid that is too long", () => {
    const { error } = ulidPathParamSchema.validate(
      "01HZX8K2D5Y3J8QF8W9B3N5P7RXX",
    );
    expect(error).toBeDefined();
  });

  it("rejects lowercase Crockford characters (the charset is uppercase-only)", () => {
    const { error } = ulidPathParamSchema.validate("01hzx8k2d5y3j8qf8w9b3n5p7r");
    expect(error).toBeDefined();
  });

  it("rejects the forbidden characters I, L, O, U", () => {
    for (const ch of ["I", "L", "O", "U"]) {
      // Replace the first non-fixed char with the forbidden one.
      const ulid = `01HZX8K2D5Y3J8QF8W9B3N5P7${ch}`;
      const { error } = ulidPathParamSchema.validate(ulid);
      expect(error, `expected rejection for character ${ch}`).toBeDefined();
    }
  });

  it("rejects ulids containing dashes / spaces / punctuation", () => {
    const { error } = ulidPathParamSchema.validate(
      "01HZX8K2-D5Y3J8QF-8W9B3N5P-7R",
    );
    expect(error).toBeDefined();
  });

  it("rejects an empty string", () => {
    const { error } = ulidPathParamSchema.validate("");
    expect(error).toBeDefined();
  });
});
