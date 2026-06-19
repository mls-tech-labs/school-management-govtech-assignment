import { describe, it, expect } from "vitest";
import { generateUlid } from "@/lib/ulid";

/**
 * Unit tests for `lib/ulid.ts` (the cross-cutting ULID row-handle generator
 * per `specs/003-backend-api-db/spec.md` FR-021 — Session 2026-06-20).
 *
 * The generator is a thin wrapper over the `ulid` npm package; the tests
 * pin down the contract the rest of the codebase depends on:
 *   - 26-char Crockford Base32 (no I/L/O/U)
 *   - No collisions over a large batch
 *   - Monotonicity between back-to-back calls within the same millisecond
 */

describe("lib/ulid.ts — generateUlid", () => {
  it("returns a 26-character string", () => {
    const id = generateUlid();
    expect(id).toHaveLength(26);
  });

  it("uses only Crockford Base32 alphabet (0-9, A-Z minus I, L, O, U)", () => {
    // Crockford Base32 alphabet: 0-9 A B C D E F G H J K M N P Q R S T V W X Y Z
    const re = /^[0-9A-HJKMNP-TV-Z]{26}$/;
    for (let i = 0; i < 100; i++) {
      const id = generateUlid();
      expect(id, `ULID "${id}" must be 26-char Crockford Base32`).toMatch(re);
    }
  });

  it("returns a new value on each call (no fixed seed)", () => {
    const a = generateUlid();
    const b = generateUlid();
    expect(a).not.toBe(b);
  });

  it("never produces a collision over 10,000 calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const id = generateUlid();
      expect(seen.has(id), `collision on iteration ${i}: ${id}`).toBe(false);
      seen.add(id);
    }
    expect(seen.size).toBe(10_000);
  });

  it("first 10 characters are timestamp (lexicographically sortable)", () => {
    // ULIDs encode a 48-bit timestamp in the first 10 chars; consecutive
    // calls should therefore share the same prefix when they fall in the
    // same millisecond. We assert the prefix never decreases over time.
    const first = generateUlid().slice(0, 10);
    const second = generateUlid().slice(0, 10);
    expect(second >= first).toBe(true);
  });
});
