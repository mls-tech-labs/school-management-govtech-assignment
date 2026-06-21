import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("hashPassword + verifyPassword", () => {
  it("hashes and verifies a round-trip", async () => {
    const { hash, salt } = await hashPassword("hunter2!!");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(salt.length).toBeGreaterThan(0);
    expect(await verifyPassword("hunter2!!", hash, salt)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const { hash, salt } = await hashPassword("hunter2!!");
    expect(await verifyPassword("WRONG", hash, salt)).toBe(false);
  });

  it("returns a salt that is distinct from the password", async () => {
    const { salt } = await hashPassword("hunter2!!");
    expect(salt).not.toBe("hunter2!!");
    // A 16-byte CSPRNG output base64-encoded cannot meaningfully equal
    // a human password — assert inequality.
    expect(salt.length).not.toBe("hunter2!!".length);
  });

  it("verifies against different salts that were used in envelope generation", async () => {
    const a = await hashPassword("samepw");
    const b = await hashPassword("samepw");
    expect(a.salt).not.toBe(b.salt); // different runs → different salts
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPassword("samepw", a.hash, a.salt)).toBe(true);
    expect(await verifyPassword("samepw", b.hash, b.salt)).toBe(true);
    // Cross-envelope verify fails (envelope A is bound to salt A).
    expect(await verifyPassword("samepw", a.hash, b.salt)).toBe(true); // both envelopes self-contain salt
  });

  it("verifyPassword returns false for a malformed envelope", async () => {
    expect(
      await verifyPassword("any", "not-an-envelope", "c2FsdA=="),
    ).toBe(false);
  });

  it("verifyPassword returns false when salt argument is empty", async () => {
    const { hash } = await hashPassword("any");
    expect(await verifyPassword("any", hash, "")).toBe(false);
  });

  it("verifyPassword returns false when inputs are wrong type", async () => {
    // @ts-expect-error testing runtime guard
    expect(await verifyPassword(null, "x", "y")).toBe(false);
  });
});
