# Data Model: Security Hardening (005-security-hardening)

**Date**: 2026-06-21
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)

This document captures the **persistence impact** of the
security hardening feature. It is intentionally short:
spec [FR-016](./spec.md) pins "This feature introduces
zero new database tables. The CSRF token is stored
alongside the session record in Redis (owned by 004).
No data-model.md artifact is produced for 005."

The hardening feature therefore does **not** own a new
MySQL table, does **not** add new MySQL columns, and does
**not** introduce a new Redis key namespace. The only
persistence surface that changes is a **single new field
on an existing Redis record** owned by
[`004-user-auth`](../004-user-auth/data-model.md).

---

## 1. Entities at a glance

| Entity | Store | Owner | Stage 2 API | 005 change |
|---|---|---|---|---|
| **CSRF token** | Redis `session:<sessionId>` value field | `004-user-auth` (the `SessionRecord` type) | implicit — read by `lib/security/csrf.ts` on every state-changing request; minted on `POST /api/v1.0/login`; cleared on `POST /api/v1.0/logout` | **one new field** on the existing `SessionRecord` |

No new entities. No new tables. No new columns. No new
Redis keys. No new migrations (per spec FR-016).

---

## 2. The CSRF token field on `SessionRecord`

The 004-owned `SessionRecord` interface
([`004-user-auth/data-model.md` §3](../004-user-auth/data-model.md#3-the-redis-session-record))
gains **one new field**:

| Field | Type | Source | Cleared on |
|---|---|---|---|
| `csrfToken` | `string` (43-char `base64url` — the output of `crypto.randomBytes(32).toString('base64url')`) | `lib/security/csrf.ts → mintCsrfToken()` at successful `POST /api/v1.0/login` | Implicit on session destruction (Redis TTL); explicit on `POST /api/v1.0/logout` (the response sets `Set-Cookie: csrfToken=; Max-Age=0`) |

### 2.1. Why the CSRF token lives on the session record

Per [research §3](./research.md#3-csrf-token-crypto-source-and-storage-resolves-spec-fr-007-fr-019a),
the CSRF token has **no meaning outside the session it
binds to**. Co-locating it with the session record:

- Means the Redis TTL cleans up the CSRF token
  automatically — no separate GC, no risk of orphaned
  tokens.
- Means there is exactly **one** Redis `GET` per
  protected request (the existing session lookup); no
  second lookup for the CSRF token.
- Means the CSRF token is **rotated atomically** with
  the session token (on every successful login) —
  defense against session fixation extends naturally to
  CSRF (per spec FR-007 + Edge Cases).

### 2.2. The updated `SessionRecord` shape

```ts
// lib/auth/session.ts — sketch, not the final implementation.
// (Amends 004's SessionRecord.)
export interface SessionRecord {
  userId: string;        // BIGINT as string (typeORM mysql driver)
  ulid: string;          // 26-char ULID (per FR-021 cross-cutting)
  createdAt: string;     // ISO-8601
  csrfToken: string;     // ← NEW in 005: 43-char base64url
}
```

The Redis key shape is **unchanged**: `session:<sessionId>`
→ JSON-encoded `SessionRecord`. The TTL is **unchanged**:
hard 30 minutes (per spec FR-015 / 004's research §3).

---

## 3. The CSRF cookie

The CSRF cookie is a **client-side mirror** of the
`SessionRecord.csrfToken` field. It is set by the
login handler and cleared by the logout handler; the
client-side helper `lib/security/csrf-client.ts →
getCsrfToken()` reads it.

| Attribute | Value | Source |
|---|---|---|
| `Name` | `csrfToken` | spec FR-007 |
| `Value` | the 43-char `base64url` token (matches `SessionRecord.csrfToken`) | `lib/security/csrf.ts → mintCsrfToken()` |
| `Path` | `/` | spec FR-007 + browser reachability |
| `Domain` | not set (host-only) | same as the session cookie (per 004's research §5) |
| `Max-Age` | `1800` (= `SESSION_TTL_SECONDS`) | matches session TTL |
| `HttpOnly` | `false` | so the React UI can read it |
| `Secure` | env-driven: same `SESSION_COOKIE_SECURE` env var as the session cookie (default `NODE_ENV === 'production'`) | per Principle IV + 004's research §5 |
| `SameSite` | `Strict` | defense-in-depth (the double-submit is the primary defence; SameSite=Strict is the cookie-level reinforcement) |

---

## 4. Out of scope (per spec FR-016 / FR-017)

- No new MySQL tables. The four Stage 1 tables
  (`teachers`, `classes`, `subjects`, `levels`) and the
  004-owned `users` table are **unchanged** by 005.
- No new MySQL columns on any existing table.
- No new Redis key namespaces.
- No new SQLite / file / object-store persistence.
- No new migrations (the application does not run any
  typeORM migration on boot — the same FR-016 posture
  that applies to 001 / 002 / 003 / 004 applies to 005).

---

## 5. References

- Spec: [`./spec.md`](./spec.md) — FR-016 (no new
  entities), FR-017 (no new endpoints), FR-007 (CSRF
  token minting + rotation), FR-019a (CSRF client-side
  helper).
- Plan: [`./plan.md`](./plan.md) — Project Structure
  section, Cross-feature updates section.
- Research: [`./research.md`](./research.md) — §3
  (CSRF token crypto source + storage).
- 004 data model: [`../004-user-auth/data-model.md`](../004-user-auth/data-model.md)
  — the `SessionRecord` interface that 005 amends.
- 003 data model: [`../003-backend-api-db/data-model.md`](../003-backend-api-db/data-model.md)
  — the cross-cutting ULID + audit + surrogate-id
  conventions that apply unchanged.
