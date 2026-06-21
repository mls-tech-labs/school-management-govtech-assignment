import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";

/**
 * argon2id parameters — chosen per OWASP 2024 guidance:
 *   - memoryCost = 65536 KiB (64 MiB) — memory-hard
 *   - timeCost   = 3 iterations
 *   - parallelism = 4 lanes
 *
 * These match the `argon2` package's defaults, but we declare them
 * explicitly so the seed path and the verify path stay in lockstep
 * (per spec FR-026 — same algorithm/parameters on both sides).
 *
 * The algorithm is intentionally `argon2id` only — hybrid-resistant
 * to both GPU and side-channel attacks.
 */
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

/**
 * Result of `hashPassword` — both the **envelope** (the standard
 * argon2id encoded string `$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>`)
 * AND the **raw salt** as a standalone base64 string.
 *
 * The two fields are stored in separate columns on the `users` table:
 *   - `password` (VARCHAR 255) — the envelope, what `argon2.verify`
 *     parses internally. Storing the envelope is the canonical way to
 *     carry all parameters + salt + hash together; future algorithm
 *     changes are detected by the `$argon2id$` prefix.
 *   - `salt` (VARCHAR 255) — the SAME salt, but separately stored as
 *     a base64 string. This gives the spec an explicit "salt column"
 *     with meaning (auditability, manual rotation, custom verification
 *     flows in the future). The salt is NEVER derived from the
 *     password and is NEVER equal to the password — they are
 *     independent fields with independent purposes.
 */
export interface PasswordHash {
  /** Full argon2id envelope: `$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>` */
  hash: string;
  /** Raw salt as base64 — distinct from the password, used as the
   *  per-user nonce that prevents rainbow-table attacks. */
  salt: string;
}

const RAW_SALT_BYTES = 16; // 128 bits — argon2 spec recommends ≥ 16 bytes

/**
 * Generate a fresh random salt of the spec-required length using
 * Node's CSPRNG. The output is base64 — base64(16 random bytes) is
 * always 24 chars (including `==` padding), well under the
 * VARCHAR(255) column bound.
 */
function generateSalt(): Buffer {
  return randomBytes(RAW_SALT_BYTES);
}

function toBase64(buf: Buffer): string {
  return buf.toString("base64");
}

/**
 * Hash a plaintext password. Returns both the envelope hash AND the
 * standalone base64 salt so the two can be persisted as separate
 * columns (per spec FR-004 in `data-model.md` §2.1).
 */
export async function hashPassword(plain: string): Promise<PasswordHash> {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("hashPassword: plaintext must be a non-empty string");
  }
  const salt = generateSalt();
  const hash = await argon2.hash(plain, { ...ARGON2_OPTS, salt });
  return { hash, salt: toBase64(salt) };
}

/**
 * Verify a plaintext password against a stored envelope. The `salt`
 * argument is part of the API surface for symmetry with `hashPassword`
 * and for future flows that want to rotate the salt while preserving
 * the hash envelope — current `argon2.verify` reads the salt from
 * the envelope itself (so the redundant `salt` arg is intentionally
 * not consulted for the comparison itself).
 *
 * `argon2.verify` is constant-time with respect to the envelope
 * contents (per the package's design), satisfying the
 * timing-safe-compare requirement.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  if (typeof plain !== "string" || typeof hash !== "string") {
    return false;
  }
  // `salt` is reserved-for-future-use; current implementation derives
  // the salt from the envelope. We still validate that the salt
  // argument is a non-empty string so a caller can't silently pass
  // `undefined` and skip the audit-trail.
  if (typeof salt !== "string" || salt.length === 0) {
    return false;
  }
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed envelope (truncated, wrong prefix, etc.) throws — treat
    // as a verification failure rather than leaking the parse error.
    return false;
  }
}
