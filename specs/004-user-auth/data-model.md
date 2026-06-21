# Data Model: User Authentication (004-user-auth)

**Date**: 2026-06-21
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)

This document captures the **persistence model** for the auth
feature. It covers the one MySQL table this feature owns
(`users`), the Redis session-record shape, and the SQL-seed
pattern. Cross-cutting columns (ULID, audit) are inherited from
[003-backend-api-db/data-model.md](../003-backend-api-db/data-model.md)
— the conventions there apply unchanged here.

The auth feature owns **one MySQL table** (`users`) and **one
Redis key namespace** (`session:<sessionId>`). It introduces **no
foreign-key relationships** to any other table (the `created_by`
/ `modified_by` audit-column FK migration to `users.id` is a
documented future-stage amendment; see constitution Stage Scope
→ Stage 2 Out of Scope).

---

## 1. Entities at a glance

| Entity | Store | Owner | Stage 2 API | Notes |
|---|---|---|---|---|
| User | MySQL `users` table | this feature | `POST /api/v1.0/login` (read), `GET /api/v1.0/me` (read) | Surrogate `id` PK (per FR-019); `username` is the natural key (UNIQUE). `password` + `salt` columns store the salted hash; plaintext never reaches storage. |
| Session | Redis `session:<sessionId>` key | this feature | `POST /api/v1.0/login` (create), `POST /api/v1.0/logout` (destroy), `GET /api/v1.0/me` (lookup, via auth middleware) | The Redis key is the source of truth for active sessions. 30-minute hard TTL (per FR-015). |

**Relationships at a glance**: none. The `users` table is **not**
referenced as an FK target by any other table in Stage 2 (the
audit columns on `teachers` / `classes` / `subjects` / `levels`
remain free-form `VARCHAR(64)` strings; see §6).

---

## 2. The `users` table

### 2.1. Column table

| Column | SQL type | Default | Nullable | Notes |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | — | No | Surrogate PK (per FR-019). NOT exposed in the Stage 2 API response. |
| `ulid` | `CHAR(26) NOT NULL` (UNIQUE — separate `uq_users_ulid` index) | — | No | Per FR-021 (cross-cutting). Generated server-side by `lib/ulid.ts` in a typeORM `@BeforeInsert()` hook. Exposed in the `GET /api/v1.0/me` response. |
| `username` | `VARCHAR(64) NOT NULL` (UNIQUE — `uq_users_username`) | — | No | The natural key; the single lookup key for `POST /api/v1.0/login`. Length matches Joi bound (spec FR-006). |
| `password` | `VARCHAR(255) NOT NULL` | — | No | The argon2id salted hash envelope (e.g., `$argon2id$v=19$m=65536,t=3,p=4$<salt-b64>$<hash-b64>`). Plaintext passwords NEVER reach this column (spec Q4 / FR-026). |
| `salt` | `VARCHAR(255) NOT NULL` | — | No | The salt as a base64 string (the same salt embedded in the `argon2id` envelope, stored separately so the `seed:admin` SQL print is verifiable out-of-band — see research §1). |
| `active` | `BOOLEAN NOT NULL` | `TRUE` | No | When `FALSE`, the row is rejected at login regardless of password correctness (spec FR-006 / Edge Cases). |
| `created_at` | `DATETIME(6) NOT NULL` | `CURRENT_TIMESTAMP(6)` | No | Per FR-018. Set once at insert. |
| `created_by` | `VARCHAR(64) NOT NULL` | `'system'` | No | Set to `'admin'` for SQL-seeded rows (per spec Clarifications Session 2026-06-21 round 1, Q2 + Assumptions block). |
| `modified_at` | `DATETIME(6) NOT NULL` | `CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)` | No | Per FR-018. Bumped on every update. |
| `modified_by` | `VARCHAR(64) NOT NULL` | `'system'` | No | Per FR-018. |
| `version` | `INT NOT NULL` | `1` | No | Per FR-018. typeORM `@VersionColumn` optimistic-lock counter. |

### 2.2. Indexes

| Index name | Column(s) | Uniqueness | Purpose |
|---|---|---|---|
| `PRIMARY` | `id` | unique | Surrogate PK. |
| `uq_users_username` | `username` | unique | Login lookup key (spec FR-006). |
| `uq_users_ulid` | `ulid` | unique | Frontend-stable row handle (per FR-021). |
| `idx_users_active` | `active` | non-unique | Login hot path — `WHERE username = ? AND active = TRUE`. |

### 2.3. Foreign-key constraints

None in Stage 2. The `created_by` / `modified_by` columns are
free-form `VARCHAR(64)` strings and do not reference any other
table (per the spec Assumptions block + constitution Stage Scope).

### 2.4. typeORM entity sketch

```ts
// lib/db/entities/user.ts — sketch, not the final implementation
import {
  Entity, PrimaryGeneratedColumn, Column, BeforeInsert, Index, VersionColumn,
} from 'typeorm';
import { generateUlid } from '../../ulid';

@Entity({ name: 'users' })
@Index('uq_users_username', ['username'], { unique: true })
@Index('uq_users_ulid', ['ulid'], { unique: true })
@Index('idx_users_active', ['active'])
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string; // bigint is returned as string by typeORM mysql driver

  @Column({ type: 'char', length: 26, unique: true })
  ulid!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  username!: string;

  @Column({ type: 'varchar', length: 255 })
  password!: string; // argon2id envelope

  @Column({ type: 'varchar', length: 255 })
  salt!: string; // base64

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'datetime', precision: 6, default: () => 'CURRENT_TIMESTAMP(6)' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 64, default: 'system' })
  created_by!: string;

  @Column({ type: 'datetime', precision: 6, default: () => 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)' })
  modified_at!: Date;

  @Column({ type: 'varchar', length: 64, default: 'system' })
  modified_by!: string;

  @VersionColumn()
  version!: number;

  @BeforeInsert()
  private ensureUlid() {
    if (!this.ulid) this.ulid = generateUlid();
  }
}
```

The `id` field is declared `string` (not `number`) because
typeORM's `mysql` driver returns `BIGINT UNSIGNED` as a string
to preserve precision past JavaScript's `Number.MAX_SAFE_INTEGER`.

### 2.5. Joi schema factory (mirrors the entity — per Principle VII)

```ts
// lib/auth/schemas.ts — sketch, not the final implementation
import Joi from 'joi';

export const usernameSchema = Joi.string()
  .min(1)
  .max(64) // matches VARCHAR(64)
  .pattern(/^[A-Za-z0-9_.\-@]+$/) // conservative set; spec leaves the charset open
  .required();

export const passwordSchema = Joi.string()
  .min(1)
  .max(255) // matches VARCHAR(255); bounds the bcrypt/argon2 input size
  .required();

export const loginRequestSchema = Joi.object({
  username: usernameSchema,
  password: passwordSchema,
}).required(); // unknown fields rejected at the trust boundary (spec Edge Cases)
```

The schema mirrors the entity column-for-column (per Principle
VII's mirror rule): the same required-ness (`required()`), the
same length bounds (`max(64)` on username, `max(255)` on
password), the same type (`string`). The `unknown(true)` setting
is NOT used — Joi rejects unknown keys (e.g., a stray
`rememberMe`) with `400 Bad Request`, per spec Edge Cases.

### 2.6. Seed pattern

The `users` table is **user-prepared** (no application-side
migration — per FR-016 + the spec's Assumption block + the
constitution Stage Scope → Stage 2 Out of Scope migration
section). The seeding is a two-step process:

1. **Print the SQL** — the user runs
   `npm run seed:admin -- --confirm --username=admin --password=<plaintext>`,
   which loads the same `lib/auth/password.ts` the application
   uses for verification, hashes the password with argon2id,
   generates a fresh ULID, and prints the
   `INSERT INTO users (...) VALUES (...)` statement to stdout
   (per FR-026 + research §8).
2. **Pipe to mysql** — the user pipes the printed SQL into
   `mysql` against the user-prepared MySQL container:

   ```bash
   $ npm run seed:admin -- --confirm \
       --username=admin --password='correct horse battery staple' \
     | mysql -h 127.0.0.1 -P 3306 -u root -p pvt_edu
   ```

The script's printed SQL is the **single source of truth** for
the seed format — the application's login path will accept the
inserted row on the first `POST /api/v1.0/login` because the
hash was generated by the same helper the application uses to
verify (no algorithm/parameter drift; see research §8).

---

## 3. Redis session record

### 3.1. Key shape

```text
session:<base64url-encoded-sessionId>
```

- The Redis **key** is the literal string `session:` followed by
  the same `base64url`-encoded session token that the cookie
  carries (research §3).
- The full key is opaque to the client — the cookie value is the
  only handle the browser sees.

### 3.2. Value shape

A JSON object (Redis string type — the session store is read /
written as a single string blob):

```json
{
  "userId": 1,
  "ulid": "01HZX8K9V4Q7P3WJRN6B5M2YDC",
  "createdAt": "2026-06-21T10:23:45.123Z"
}
```

| Field | Type | Source | Purpose |
|---|---|---|---|
| `userId` | integer (string-encoded by ioredis) | `users.id` | The join key the application uses to load the user record. |
| `ulid` | string | `users.ulid` | The frontend-stable handle exposed by `GET /api/v1.0/me` (no DB round-trip needed for that field). |
| `createdAt` | ISO-8601 string | server clock at session creation | Diagnostic — included in the auth event log and useful for debugging TTL boundary behaviour (spec SC-006). |

**No other fields are persisted.** The session record is
deliberately lean so that session-create / session-lookup /
session-destroy are all single-key Redis operations
(`SET` / `GET` / `DEL`).

### 3.3. TTL

- **30-minute hard TTL** set on `SET` via the `EX` flag
  (`SET session:<id> <value> EX 1800`).
- **Not refreshed** on every authenticated request — the TTL is
  set once at session creation (spec FR-015 + Edge Cases).
- The TTL is read from the env var `SESSION_TTL_SECONDS`
  (default `1800`, per research §9) so a future stage can flip
  it to a different value without code changes. The spec pins
  Stage 2 to `1800` (30 minutes) — any deviation requires an
  amendment.

### 3.4. Lookup semantics

| Redis outcome | Auth middleware outcome |
|---|---|
| Key present, value parses, `userId` resolves to a live user | attach `{ userId, ulid }` to the request; call `next()` |
| Key present, value does not parse | treat as missing session; return `401` |
| Key absent (expired, never existed, manually deleted) | return `401` |
| Redis unreachable (connection refused, timeout) | return `503` for protected endpoints |
| Redis returns an error mid-request (e.g., disconnect) | treat as missing session; return `401` (do not leak Redis errors — spec Edge Cases) |

The "Redis returns an error → `401`" rule is the spec's
indistinguishability property (spec Edge Cases): the client
cannot tell the difference between "no session" and "Redis
hiccup", which prevents an attacker from using error responses
to probe Redis health.

### 3.5. Session creation (spec FR-006 + Clarifications round 1, Q4)

On a successful `POST /api/v1.0/login`:

1. Verify the credentials (see `lib/auth/password.ts` —
   `verifyPassword(plain, hash, salt)`).
2. If valid, mint a fresh session token via
   `crypto.randomBytes(32).toString('base64url')` (research §3).
3. **Remove any pre-existing session** the client may have sent:
   - Read the session cookie from the **request** (not the
     response).
   - If a value is present, run `DEL session:<that value>` on
     Redis before writing the new one. This is the spec's
     session-fixation defence (FR-006 + Clarifications round 1,
     Q4).
4. Write the new session: `SET session:<newId> <json> EX 1800`.
5. Set the new session cookie on the **response** with the
   `Set-Cookie` header (research §4 attribute table).

### 3.6. Session destruction (spec FR-007 + FR-018)

On a `POST /api/v1.0/logout`:

1. Read the session cookie from the **request**.
2. If a value is present, run `DEL session:<that value>` on
   Redis. **Idempotent** — if the key is absent, `DEL` is a
   no-op and the request still returns `200 OK` (spec FR-007).
3. Set the **logout cookie** on the response — same `Name`,
   `Path`, `HttpOnly`, `Secure`, `SameSite` as the session
   cookie, with `Value = ""`, `Max-Age = 0`, and `Expires = <RFC
   1123 past date>` (per spec FR-018 + research §4 logout
   sub-section).

### 3.7. Failure isolation

The auth middleware never throws to the Next.js error pipeline.
Every Redis outcome is mapped to one of three Next.js responses:

| Outcome | Response |
|---|---|
| Valid session | `next()` with `{ userId, ulid }` attached |
| No / invalid session | `401` with `{ "error": "Unauthorized" }` |
| Redis unreachable | `503` with `{ "error": "Service temporarily unavailable, please retry" }` |

The `503` outcome is **only** triggered when Redis is
unreachable (e.g., the connection is refused on boot). A
mid-request Redis disconnect falls through to the `401` bucket
per §3.4 (the spec's indistinguishability requirement).

---

## 4. The `redirectTo` query string (spec FR-004 + FR-021 + research §6)

The login page and the route guard share a query-string
convention for the post-login redirect target:

```text
/login?redirectTo=<encodeURIComponent(window.location.pathname + window.location.search)>
```

### 4.1. Validation rule

The value is accepted by the login page **only** if it starts
with a single `/` (no `//evil.example.com`, no absolute URL, no
`javascript:` prefix). The same rule is applied at the route
guard write site AND at the login-page read site (two
independent checks — defense-in-depth against an open-redirect
vulnerability).

### 4.2. Fallback

If `redirectTo` is missing, empty, or fails the §4.1 check, the
login page navigates to `LOGIN_REDIRECT_DEFAULT` (env var,
default `/`, per research §9).

### 4.3. Storage

The value is **not** persisted in `sessionStorage`,
`localStorage`, or a cookie. It lives only in the URL query
string. This is the "self-clearing" property that
`sessionStorage`-based approaches lack (research §6 alternatives
rejected).

---

## 5. Cross-cutting consistency with 003

The `users` table follows the cross-cutting rules from
[003-backend-api-db/data-model.md](../003-backend-api-db/data-model.md)
without modification:

| Rule | Source | Application to `users` |
|---|---|---|
| ULID column (FR-021) | 003 §2.8 | `ulid CHAR(26) NOT NULL UNIQUE`; generated server-side by `lib/ulid.ts` via `@BeforeInsert()` hook. |
| Audit columns (FR-018) | 003 §2.6–§2.7 | `id` surrogate PK + 5 audit columns (`created_at`, `created_by`, `modified_at`, `modified_by`, `version`) per the same column types and defaults. |
| Surrogate id (FR-019) | 003 §2.1 | `id BIGINT UNSIGNED AUTO_INCREMENT` PK; not exposed in the Stage 2 API response. |
| Audit columns hidden in API responses (FR-020) | 003 §2.6 | `GET /api/v1.0/me` response exposes `username`, `active`, `ulid`, `createdAt` only — `id`, `created_by`, `modified_at`, `modified_by`, `version` are hidden. |
| No migrations (FR-016) | 003 §1 | The `users` table is created by the user with their own SQL; the application MUST NOT run a migration on boot. |
| Cross-cutting error envelope | 003 FR-012 | All auth errors use `{ "error": "..." }`. |

---

## 6. Out-of-scope persistence (per spec + constitution Stage Scope)

The following persistence concerns are **explicitly deferred**
to future stages and are not modelled here:

- The `users` → `teachers` / `classes` / `subjects` / `levels`
  FK migration of `created_by` / `modified_by` (Stage 2 Out of
  Scope; the columns remain `VARCHAR(64)` free-form strings).
- A separate `auth_events` / `login_attempts` table for audit
  logging beyond the structured log entries (Stage 2 Out of
  Scope; the application logger carries the events).
- A `users.password_changed_at` column (no password-change flow
  in Stage 2).
- A `users.last_login_at` column (the structured log entry per
  FR-027 carries the timestamp).
- Session sliding-TTL extension (a future-stage option; the spec
  pins Stage 2 to a hard 30-minute TTL).
- Multi-factor authentication metadata (Stage 2 Out of Scope —
  no MFA / 2FA).
- OAuth / OIDC identity-provider linkage (Stage 2 Out of Scope).
