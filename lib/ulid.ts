import { ulid } from "ulid";

/**
 * `generateUlid()` — thin wrapper over the `ulid` npm package, used by
 * the typeORM `@BeforeInsert()` hooks on `Teacher`, `Subject`, `Class`,
 * and `Level` to populate the cross-cutting `ulid CHAR(26) UNIQUE NOT NULL`
 * row-handle column (per `specs/003-backend-api-db/spec.md` FR-021).
 *
 * Why a wrapper, not the bare package call:
 *   - Single import surface so entity files don't all reach into `ulid`
 *     directly (Principle V — Simplicity, one place to change the
 *     generator later if we ever swap ULID for KSUID or another scheme).
 *   - One type signature so the entity decorators don't have to know
 *     whether the package is ESM-default-exported or CJS.
 *   - Test seam: tests can stub this module instead of the upstream
 *     `ulid` package.
 *
 * Returned value is always exactly 26 characters of Crockford Base32
 * (uppercase, no I/L/O/U), per the ULID spec.
 */
export function generateUlid(): string {
  return ulid();
}
