import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";

// argon2id parameters per OWASP 2024 guidance. Declared explicitly so
// the seed and verify paths stay in lockstep.
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

export interface PasswordHash {
  /** Full argon2id envelope, e.g. `$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>`. */
  hash: string;
  /** Raw salt as base64 — separate from `password`. */
  salt: string;
}

const RAW_SALT_BYTES = 16; // 128 bits.

function generateSalt(): Buffer {
  return randomBytes(RAW_SALT_BYTES);
}

export async function hashPassword(plain: string): Promise<PasswordHash> {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("hashPassword: plaintext must be a non-empty string");
  }
  const salt = generateSalt();
  const hash = await argon2.hash(plain, { ...ARGON2_OPTS, salt });
  return { hash, salt: salt.toString("base64") };
}

// `salt` is part of the API surface for symmetry with `hashPassword`
// and future rotation flows. `argon2.verify` reads the salt from the
// envelope itself.
export async function verifyPassword(
  plain: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  if (typeof plain !== "string" || typeof hash !== "string") return false;
  if (typeof salt !== "string" || salt.length === 0) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed envelope — treat as a verification failure.
    return false;
  }
}
