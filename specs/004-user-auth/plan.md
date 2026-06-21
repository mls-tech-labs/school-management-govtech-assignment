# Implementation Plan: User Authentication (004-user-auth)

**Branch**: `004-user-auth` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-user-auth/spec.md`

## Summary

Ship the **session-based authentication feature** that gates
every protected `/api/v1.0/*` endpoint behind a valid session
cookie, plus the `/login` page and the React route guard that
together make the application reachable to the single
Administrator role (per Constitution Principle IV).

This feature:

1. **Introduces the `users` table** — one MySQL table owned by
   this feature, created by the user with their own SQL against
   the user-prepared MySQL container (per FR-016 cross-cutting
   rule — no application-side migration). The table carries the
   cross-cutting audit columns (FR-018), the ULID column
   (FR-021), the surrogate `id` PK (FR-019), and the
   `password` + `salt` columns (storing the argon2id envelope).
2. **Introduces the Redis session store** — a separate Docker
   container (already running per the spec's Assumption block;
   added to `docker-compose.yml` by this feature). Sessions are
   `session:<token>` → `{ userId, ulid, createdAt }` with a
   hard 30-minute TTL. No sliding extension.
3. **Introduces the auth middleware** — the
   `withAuth(handler)` wrapper that protects every `/api/*`
   request except the explicit exempt list (spec FR-011:
   `POST /api/v1.0/login`, `GET /api/v1.0/me`,
   `POST /api/v1.0/logout` by idempotency). The middleware is
   the **single source of truth** for the authentication
   boundary — route handlers MUST NOT do their own session
   lookup.
4. **Introduces the login page** — the single `/login` page with
   exactly three elements (username input, password input, "Log
   in" button) per spec FR-002. Composed from `antd` primitives
   styled with Tailwind utility classes (per the v2.4.0
   constitution amendment).
5. **Introduces the React route guard** — a client component
   (`lib/auth/route-guard.tsx`) that calls `GET /api/v1.0/me` on
   mount, renders on `200`, redirects to `/login?redirectTo=...`
   on `401` (per spec FR-019..FR-022).
6. **Introduces `npm run seed:admin`** — the hash-and-print SQL
   helper per spec FR-026. The same `lib/auth/password.ts`
   helper is used by both the seed path and the verify path so
   there is no algorithm/parameter drift.
7. **Adds the auth-event logging** — one structured log entry
   per `POST /api/v1.0/login` (per spec FR-027) and one per
   `POST /api/v1.0/logout` (per FR-028). The log entries are
   server-side only and MUST NOT contain passwords, hashes,
   salts, or full session cookie values.

The feature does **NOT** ship the four Principle IX hardening
controls (CORS, CSP, CSRF, XSS) — those are deferred to a
future `005-security-hardening` spec per the spec's
Clarifications Session 2026-06-21 round 1, Q1 and the
constitution Stage Scope → Stage 2 In Scope block. The `Secure`
cookie flag is environment-driven (per Principle IV) and is the
one hardening-adjacent concern this feature owns.

The plan inherits the stack, container layout, and the
typeORM / Joi / Vitest infrastructure from
[`001-teachers`](../001-teachers/plan.md) and
[`002-classes`](../002-classes/plan.md). The cross-cutting API
contract (error envelope, status-code table, content-type rule)
is inherited from
[`003-backend-api-db`](../003-backend-api-db/plan.md). This
feature adds **two new runtime dependencies** (`argon2`,
`ioredis`) and **one new devDependency** (`ioredis-mock`), and
**three new auth endpoints** (`POST /api/v1.0/login`,
`POST /api/v1.0/logout`, `GET /api/v1.0/me`). All three
endpoints are exposed under the `/api/v1.0/` version prefix per
the FR-022 cross-cutting rule (per
`003-backend-api-db/spec.md` Clarification Session 2026-06-21,
Q1).

---

## Technical Context

**Language/Version**: TypeScript 5.x with `strict: true` (per
Constitution Principle II). No `.js` source files. The new
`lib/auth/*` modules are pure-function `.ts` modules; the
`lib/auth/route-guard.tsx` is a React function component; the
test suites are `.spec.ts`.

**Runtime**: Node.js LTS via the **same single Next.js 15
application** as `001-teachers`, `002-classes`, and
`003-backend-api-db`. The 004 code lives inside the existing
`app/api/v1.0/` route handlers (the three new endpoints) and
inside `lib/auth/*` (six new modules — see research §10).

**Primary Dependencies**: same as
[`001-teachers/plan.md` Primary Dependencies](../001-teachers/plan.md#technical-context)
(Next.js 15, React 19, typeORM, MySQL driver, Joi, Vitest,
Ant Design, Tailwind CSS, PostCSS, autoprefixer, ulid),
plus the existing `crypto` standard library, plus
**two new runtime dependencies** (per
[`./research.md`](./research.md) §14):

| Package | Version constraint | Purpose | Source |
|---|---|---|---|
| `argon2` | `^0.40.x` | Password hashing (argon2id envelope) | [research §1](./research.md#1-password-hashing-algorithm-resolves-spec-clarifications-q4--assumption-block) |
| `ioredis` | `^5.4.x` | Redis client (session store) | [research §2](./research.md#2-redis-client-choice) |

And **one new devDependency**:

| Package | Version constraint | Purpose |
|---|---|---|
| `ioredis-mock` | `^8.9.x` | Unit-test stub for `ioredis` (the unit tier does not require a real Redis container) |

No other packages are added. The `tsx` runner is already a
devDep from Stage 1 (test pipeline) and is reused by the
`scripts/seed-admin.ts` script.

**Storage**:

- **MySQL 8** (user-prepared Docker container) — the same
  instance as Stage 1. The 004 feature adds **one new table**
  (`users`) and inherits the four Stage 1 tables unchanged.
- **Redis 7** (new Docker container, added to
  `docker/docker-compose.yml` by this feature). The session
  store. See [`./data-model.md`](./data-model.md) §3 for the
  key shape, value shape, and TTL.

The `users` table is **created by the user with their own SQL**
against the user-prepared MySQL container (per FR-016
cross-cutting rule + the constitution Stage Scope → Stage 2
Out of Scope migration section). The application MUST NOT run
a typeORM migration on boot. The seed command
(`scripts/seed-admin.ts`) is a hash-and-print helper that
emits SQL to stdout; it does not touch the database.

**Testing**: Vitest (inherited from `001-teachers`). Three
tiers per [`./research.md`](./research.md) §12:

| Tier | Path | Coverage |
|---|---|---|
| **Unit** | `tests/unit/auth/*.spec.ts` | `password.ts`, `session.ts`, `cookie.ts`, `middleware.ts`, `log.ts` — pure functions, no DB, no network |
| **Contract** | `tests/contract/auth.api.spec.ts` | Full POST/GET/cookie lifecycle against a test Next.js server with `ioredis-mock` + an in-memory MySQL stub |
| **Integration** | `tests/integration/auth.spec.ts` | Real Redis + real MySQL containers; SC-001..SC-013 end-to-end |

**Target Platform**: same as `001-teachers` — Docker Desktop,
Linux / macOS / Windows host, Docker Compose v2. The new
Redis container follows the same Docker Compose v2 service
pattern as the existing MySQL container.

**Project Type**: same as `001-teachers` and `002-classes` —
single Next.js web application. 004 adds new `lib/auth/*`
modules, three new `app/api/v1.0/*` route handlers, the
`app/login/` page, the `scripts/seed-admin.ts` script, and a
`redis` service in `docker-compose.yml`. No new project, no new
process, no new container runtime.

**Performance Goals**:

- The auth middleware adds **one Redis `GET` per protected
  request** (the `session:<token>` lookup). On a local Redis
  this is sub-millisecond; on a remote Redis with typical
  intra-region latency it is ~1 ms p99.
- The login handler adds **one argon2id `verify`** (~50 ms at
  the chosen parameters) + **one MySQL `SELECT`** for the
  user row + **one Redis `SET`** for the session record. Total
  login latency is dominated by the argon2id verify.
- No new API-level latency target is added in Stage 2. The
  end-to-end form-time budget from `SC-001` (≤ 10 s from page
  load to logged-in state on a typical broadband connection)
  is the only performance criterion.

**Constraints**:

- All `001-teachers`, `002-classes`, and `003-backend-api-db`
  constraints apply (TS strict, no class-based code outside
  typeORM entities, Joi mirroring, etc.).
- The cross-cutting contract is **non-negotiable**: every
  route handler goes through `withApiContract` (Stage 1
  wrapper) + `withAuth` (this feature's wrapper); every error
  response uses `{ "error": "..." }`; every status code is in
  the cross-cutting table; every endpoint uses the
  `/api/v1.0/` version prefix (per FR-022).
- The auth middleware is the **single source of truth** for
  the authentication boundary. Route handlers MUST NOT do
  their own session lookup (per spec FR-012).
- The exempt list (spec FR-011) is exactly two endpoints:
  `POST /api/v1.0/login` and `GET /api/v1.0/me`.
  `POST /api/v1.0/logout` is also exempt (by idempotency
  requirement — the handler must run even without a session
  so the cookie can be cleared). No other endpoint is exempt.
- The session TTL is **hard 30 minutes** (per FR-015 + Edge
  Cases). No sliding extension. A future-stage amendment may
  change this; Stage 2 pins `SESSION_TTL_SECONDS=1800` as
  the default.
- The session cookie carries `HttpOnly`, `Secure` (env-driven
  per Principle IV + research §5), and `SameSite=Strict`. No
  other attributes are configurable.
- The `users` table is **user-prepared** — the application
  MUST NOT run a migration on boot (per FR-016 + the
  constitution Stage Scope migration section).
- Login / logout are observable via structured log entries
  (per FR-027 / FR-028). The log entries MUST NOT contain
  passwords, hashes, salts, or full session cookie values.
- The four Principle IX hardening controls (CORS, CSP, CSRF,
  XSS) are **out of scope** for this feature (per spec
  Clarifications Session 2026-06-21 round 1, Q1 + the
  constitution Stage Scope → Stage 2 In Scope block).
  Deferred to a future `005-security-hardening` spec.
- ≤ 1 admin user seeded for Stage 2 (the spec is silent on the
  count; the seed command emits one INSERT per invocation; the
  application has no upper bound on `users` row count).

**Scale/Scope**:

- 1 application process (Next.js, same as `001-teachers`) + 1
  MySQL container (same as Stage 1) + 1 Redis container (new).
- 1 new DB table (`users`); 4 pre-existing tables unchanged.
- 3 new API endpoints (`POST /api/v1.0/login`,
  `POST /api/v1.0/logout`, `GET /api/v1.0/me`); all 7 Stage 1
  + Stage 2 endpoints share the `/api/v1.0/` version prefix.
- 1 new client-rendered page (`/login`); the route guard is
  applied to the existing private pages via the layout.
- 6 new `lib/auth/*` modules (per research §10); 0 modules
  removed.
- 1 new `scripts/seed-admin.ts` script.
- 1 new `docker-compose.yml` service (`redis`).
- 2 new runtime dependencies + 1 new devDependency.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design (re-evaluation in [§"Re-evaluation"](#re-evaluation-constitution-check-post-design)
below).*

| Principle | Status | Notes |
|---|---|---|
| I. Spec-Driven Development | ✅ Pass | Plan is generated by `/speckit-plan` after `/speckit-specify` + 3 clarification rounds (`/spec.md` Clarifications — Session 2026-06-21 (capture) Q1..Q6 + Session 2026-06-21 (versioned-path propagation) Q1 + Session 2026-06-21 (clarification round 1) Q1..Q5). Tasks will be generated by `/speckit-tasks`; no source code is written before this plan is approved. |
| II. TypeScript End-to-End (`strict: true`) | ✅ Pass | Same single `tsconfig.json` as `001-teachers` covers the whole app; the new `lib/auth/*.ts` modules and `lib/auth/route-guard.tsx` are pure-function / function-component `.ts` / `.tsx` modules; the test suites are `.spec.ts`. |
| III. Unit Tests Required | ✅ Pass | Same Vitest setup as `001-teachers` / `002-classes` / `003-backend-api-db`. The new `lib/auth/*` helpers get unit tests covering every pure-function path (password hash + verify; session create / lookup / destroy with `ioredis-mock`; cookie attributes including the `Secure` env-driven relaxation; middleware for 401 / 503 / exempt-list / happy-path; log-scrub spec for never-leak-secrets). The contract tier covers the full POST/GET/cookie lifecycle; the integration tier covers SC-001..SC-013. |
| IV. Single Role: Authenticated Administrator | ✅ Pass | This feature IS the implementation of Principle IV. The single Administrator role is gated by the session-based authentication boundary introduced here; every request to a protected resource is rejected with HTTP `401 Unauthorized` when no valid session cookie is presented (per FR-010..FR-013). The session cookie attributes (`HttpOnly`, `Secure`, `SameSite=Strict`) match the constitution's Principle IV requirement. The `Secure` flag is environment-driven per Principle IV (research §5). **No new role is introduced.** |
| V. Simplicity (YAGNI) | ✅ Pass | No abstractions ahead of the spec. The auth middleware is a thin shell that delegates to small, single-purpose helpers (`password.ts`, `session.ts`, `cookie.ts`, `log.ts`). The `withAuth` wrapper is ~30 lines. The session-record shape is a flat JSON object with three fields (research §3.2 + data-model.md §3.2). No DTOs, no class-based service layers, no DI container. The MFA / OAuth / password-reset / sign-up / lockout / rate-limiting / audit-logging / FK-migration / COOP-CORP-COEP features are all **explicitly deferred** per Principle V (documented in [research §15](./research.md#15-out-of-scope-confirmations-per-constitution-stage-scope) + the spec's Assumptions block + the constitution Stage Scope → Stage 2 Out of Scope block). |
| VI. Functional-First (Classes Only When Necessary) | ✅ Pass | The new `lib/auth/*.ts` modules are pure functions: `hashPassword`, `verifyPassword`, `createSession`, `getSession`, `destroySession`, `sessionCookieName`, `setSessionCookie`, `clearSessionCookie`, `readSessionCookie`, `withAuth`, `logAuthLogin`, `logAuthLogout`. The only class introduced is the typeORM `User` entity (which is mandated by typeORM, per Principle VI's class-where-framework-mandates carve-out). The React route guard is a function component (Principle VI requires function components + hooks). No class-based service layers, controllers, or repositories. |
| VII. Joi Schema Validation | ✅ Pass | The new `lib/auth/schemas.ts` defines the `loginRequestSchema` Joi factory, mirroring the `users` entity column-for-column (research §10 + data-model.md §2.5): same required-ness, same length bounds, same string format. Validation runs **before** any credential verification, typeORM call, or persistence write (per Principle VII). Validation errors return `400 Bad Request` with a structured error envelope and MUST NOT leak database column names, stack traces, or internal messages. The `unknown` key is rejected (defense against a future `rememberMe` field, per spec Edge Cases). |
| VIII. UI Quality — Self-Explanatory, Reusable, Simple | ✅ Pass | The login page (`app/login/page.tsx`) is composed from `antd` `Form` + `Input` + `Button` primitives and styled with Tailwind utility classes — the same pattern used by `001-teachers` and `002-classes`. The route guard (`lib/auth/route-guard.tsx`) is a single function component with explicit, typed props (`children: ReactNode`). No feature-specific hard-coding; the page does not bake in "admin" anywhere. The form has exactly three elements (per spec FR-002), which is the simplest implementation that meets the spec. |
| IX. Security & Hardening | ⚠ Deferred (intentional — see Notes) | The four hardening controls (CORS allow-list, CSP header, double-submit CSRF token, XSS posture) are **deferred to a future `005-security-hardening` spec** per spec Clarifications Session 2026-06-21 round 1, Q1 + the constitution Stage Scope → Stage 2 In Scope block. This feature ships the auth surface only. The auth middleware is **compatible** with the future CSRF middleware (it is a separate `withAuth` wrapper, not a re-implementation; the future `withCsrf` will compose with it via the same `withApiContract` chain — see research §11). The `005` contract already names the three auth endpoints in its CSRF exempt list. The `Secure` cookie flag is environment-driven (the one hardening-adjacent concern this feature owns, per Principle IV + research §5). The `npm run seed:admin` helper refuses to run without `--confirm` (a hardening-adjacent guard against unattended pipelines, per spec FR-026). **Re-evaluation note**: after the 005 spec lands and is implemented, this row will move to ✅ Pass with a reference to the 005 PR; the auth feature itself does not block on 005. |

**Stage Scope compliance** (per Constitution → Stage Scope):

- ✅ In scope (Stage 2): Authentication feature (`004-user-auth`).
  This feature is the entirety of the Stage 2 In Scope →
  Authentication block. The session cookie attributes
  (`HttpOnly`, `Secure`, `SameSite=Strict`) match Principle IV.
  The `/login` page and the route guard are the application-side
  consumers of the auth boundary.
- ✅ In scope (Stage 2, deferred to 005): CORS hardening, CSP
  hardening, CSRF protection, XSS prevention. Per spec
  Clarifications Session 2026-06-21 round 1, Q1 + the
  constitution Stage Scope → Stage 2 In Scope block, these are
  owned by a future `005-security-hardening` spec and are
  explicitly OUT of this feature's scope. The split keeps 004
  focused on the auth feature and lets 005 own the cross-cutting
  security-headers configuration in `next.config.mjs`.
- ✅ Out of scope (Stage 2): MFA / 2FA, OAuth / OIDC / SSO,
  password reset, self-registration, admin authoring of `users`,
  account lockout, rate limiting beyond Joi, audit logging
  beyond existing columns, FK migration of `created_by` /
  `modified_by`, COOP / CORP / COEP. All of these are
  documented as deferred (per Principle V) and this feature does
  **not** introduce any of them.

**Security-sensitive feature manual review** (per Constitution →
Governance → Compliance review: "for security-sensitive features
(any feature that touches Principle IV or Principle IX),
explicitly verify the four hardening controls (CORS allow-list,
CSP header, CSRF token middleware, XSS posture) are present and
configured per Principle IX"):

| Control | Status in 004 | Notes |
|---|---|---|
| CORS allow-list | ⚠ Deferred to 005 | This feature does not introduce CORS configuration; the future 005 spec adds the `CORS_ALLOWED_ORIGINS` env var + the CORS middleware. The auth middleware is compatible with the future CORS middleware (it is a separate `withAuth` wrapper; the future CORS layer will compose in front of it via the same `withApiContract` chain). |
| CSP header | ⚠ Deferred to 005 | This feature does not introduce CSP headers; the future 005 spec adds the CSP configuration to `next.config.mjs`. |
| CSRF token middleware | ⚠ Deferred to 005 | This feature does not introduce the double-submit CSRF token; the future 005 spec adds the `withCsrf` wrapper + the `csrfToken` cookie. The `005` contract already names the three auth endpoints in its CSRF exempt list (per the prior session's edit). The session cookie's `SameSite=Strict` (per Principle IV) is the first line of defence; the double-submit token is the defense-in-depth backstop. |
| XSS posture | ✅ Pass (input + output layers) | Joi input validation at the trust boundary (per Principle VII — `unknown` keys rejected; max-length bounds enforced). React's default output encoding (no `dangerouslySetInnerHTML`, no `eval`, no `Function(...)`, no string-to-code sinks). No user-generated HTML anywhere in this feature. CSP is the third layer (deferred to 005 per above). |

**Constitution TODO items status**:

- All `TODO(FEATURE_001)` items remain resolved in the
  `001-teachers` plan.
- `TODO(ANTD_TAILWIND_VERSION)`: the 001 plan pinned the
  `antd`, `tailwindcss`, `postcss`, `autoprefixer` versions in
  `package.json`. No change from 004.
- `TODO(JOI_ALIGNMENT)`: the new `lib/auth/schemas.ts` Joi
  factory mirrors the `User` typeORM entity column-for-column
  per Principle VII (research §10 + data-model.md §2.5).
- `TODO(FUNCTIONAL_REVIEW)`: the new code is pure-function
  modules + a function component. No class-based service layers,
  controllers, or repositories introduced. The typeORM `User`
  entity is the one class — mandated by typeORM.
- `TODO(PROFILE_PAGE_OUT_OF_SCOPE)`: confirmed — there is no
  profile / change-password / account-management page in this
  feature.
- `TODO(RATE_LIMITING_OUT_OF_SCOPE)`: confirmed — no per-IP
  login attempt limits, no captcha-after-N-failures, no
  lockout. The `ip` field is logged (per spec FR-027) for future
  rate-limiting work, but rate-limiting itself is out of Stage 2
  scope.
- `TODO(CRP_INTERPRETATION)`: confirmed — the v2.4.0 amendment
  interpreted "CRP" as "CSP" (the standard web-security triad of
  CORS + CSP + CSRF; "CRP" is not a recognised web-security
  acronym). The four hardening controls (CORS + CSP + CSRF +
  XSS) are owned by the future `005-security-hardening` spec.
- `TODO(LOCAL_DEV_HTTP_POSTURE)`: the `Secure` cookie flag is
  driven by the `SESSION_COOKIE_SECURE` env var with a
  `NODE_ENV === 'production'` default (research §5). Documented
  in `.env.example`. Production = secure (fail-closed default);
  local dev can opt out by setting `SESSION_COOKIE_SECURE=false`.
- New TODO introduced by this plan: `TODO(FEATURE_004_REDIRECT_TO)`
  — verify the single-slash-prefix validation in both the route
  guard write site AND the login-page read site during the
  implementation review (defense-in-depth against an
  open-redirect vulnerability). Tracked in `tasks.md`.
- New TODO introduced by this plan: `TODO(FEATURE_004_LOG_SCRUB)`
  — write a `log-scrub.spec.ts` unit test that asserts no
  structured auth-event log entry contains the password, hash,
  salt, or full session cookie value (per spec SC-012). Tracked
  in `tasks.md`.
- New TODO introduced by this plan: `TODO(FEATURE_004_FIXTURE_FOR_HASH)`
  — the `npm run seed:admin` integration test fixture must
  reproduce the same argon2id envelope shape that
  `lib/auth/password.ts` produces at runtime, so the printed
  SQL is verifiable out-of-band (per spec SC-011). Tracked in
  `tasks.md`.

**No violations.** No entries required in **Complexity Tracking**
(the deferred hardening controls are documented above, not
violations).

---

## Project Structure

### Documentation (this feature)

```text
specs/004-user-auth/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — resolves every NEEDS CLARIFICATION
├── data-model.md        # Phase 1 output — `users` table + Redis session record
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/
│   └── auth.yaml        # Phase 1 output — OpenAPI 3.1 for the three auth endpoints
├── checklists/
│   └── requirements.md  # pre-existing — quality checklist (16/16)
└── spec.md              # pre-existing
```

### Source Code (repository root)

The 004 feature extends the same Next.js codebase as
`001-teachers`, `002-classes`, and `003-backend-api-db`. New
files are marked `(+)`; pre-existing files are unmarked for
clarity. **Path annotations use the per-feature `app/` layout**
(no nested route groups); the route-guard composition pattern
is decided in the `app/(private)/layout.tsx` file in this
plan (a minor variation from the flat `app/` layout used in
001 / 002 — see the `Structure Decision` below).

```text
app/                                                          # Next.js App Router
├── layout.tsx                                                # (pre-existing) root layout
├── page.tsx                                                  # (pre-existing) Home / post-login default
├── (private)/                                                # (+) new route group for authenticated pages
│   └── layout.tsx                                            # (+) wraps children in <RouteGuard>
├── login/                                                    # (+) new — the login page
│   └── page.tsx                                              # (+) the three-element form
└── api/
    └── v1.0/
        ├── (pre-existing from 001 / 002 / 003)
        ├── login/
        │   └── route.ts                                      # (+) POST handler
        ├── logout/
        │   └── route.ts                                      # (+) POST handler
        └── me/
            └── route.ts                                      # (+) GET handler

lib/
├── api/                                                      # (pre-existing from 001 / 003)
│   └── (pre-existing; withApiContract wrapper continues to apply)
├── auth/                                                     # (+) NEW — six pure-function modules
│   ├── password.ts                                           # (+) hashPassword / verifyPassword (argon2id)
│   ├── session.ts                                            # (+) createSession / getSession / destroySession (Redis)
│   ├── cookie.ts                                             # (+) sessionCookieName / setSessionCookie / clearSessionCookie / readSessionCookie
│   ├── middleware.ts                                         # (+) withAuth(handler) — the auth boundary; exports PUBLIC_PATHS (FR-011 exempt list)
│   ├── log.ts                                                # (+) logAuthLogin / logAuthLogout (spec FR-027 / FR-028)
│   ├── schemas.ts                                            # (+) loginRequestSchema (Joi, per Principle VII)
│   └── route-guard.tsx                                       # (+) RouteGuard (React function component; calls GET /api/v1.0/me on mount)
├── db/
│   ├── data-source.ts                                        # (pre-existing; no migrations runner)
│   ├── redis.ts                                              # (+) NEW — the ioredis singleton; lib/auth/session.ts consumes this
│   └── entities/
│       └── user.ts                                           # (+) NEW — the User typeORM entity (audit + ULID + password + salt columns)
├── ulid.ts                                                   # (pre-existing) generateUlid() — used by User @BeforeInsert()
└── config.ts                                                 # (pre-existing; +REDIS_URL +SESSION_COOKIE_* +LOGIN_REDIRECT_DEFAULT keys)

scripts/                                                      # (+) NEW directory
└── seed-admin.ts                                             # (+) the npm run seed:admin hash-and-print helper

tests/
├── unit/
│   ├── auth/                                                 # (+) NEW
│   │   ├── password.spec.ts                                  # (+) hash + verify + timing-safe compare
│   │   ├── session.spec.ts                                   # (+) ioredis-mock stub; create / get / destroy + TTL behaviour
│   │   ├── cookie.spec.ts                                    # (+) every attribute incl. SESSION_COOKIE_SECURE relaxation
│   │   ├── middleware.spec.ts                                # (+) 401 / 503 / exempt-list / happy path
│   │   ├── log.spec.ts                                       # (+) never-leak-secrets log-scrub spec (SC-012)
│   │   └── schemas.spec.ts                                   # (+) loginRequestSchema Joi — happy path + every constraint
│   └── (pre-existing from 001 / 002 / 003)
├── contract/
│   ├── auth.api.spec.ts                                      # (+) full POST / GET / cookie lifecycle (JSDOM or test Next.js server + ioredis-mock + in-memory MySQL stub)
│   └── (pre-existing from 001 / 002 / 003)
└── integration/
    ├── auth.spec.ts                                          # (+) SC-001..SC-013 end-to-end (real Redis + real MySQL containers)
    └── (pre-existing from 001 / 002 / 003)

docker/                                                       # (pre-existing from 001)
├── Dockerfile                                                # (pre-existing; no change)
├── docker-compose.yml                                        # (+) +redis service (per spec Assumption block + this plan §Project Structure)
└── docker-compose.test.yml                                   # (pre-existing; +redis service)

.env.example                                                  # (+) +REDIS_URL +SESSION_COOKIE_NAME +SESSION_COOKIE_SECURE +SESSION_TTL_SECONDS +LOGIN_REDIRECT_DEFAULT +PASSWORD_HASH_ALGO
.env.local                                                    # (pre-existing, gitignored; +REDIS_URL)
.env                                                          # (pre-existing, JSON, model config only — no change)
.gitignore                                                    # (pre-existing)
package.json                                                  # (+) +argon2 +ioredis (runtime) +ioredis-mock (dev); +"seed:admin" script
tsconfig.json                                                 # (pre-existing, strict: true)
next.config.mjs                                               # (pre-existing; CSP / CORS / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy headers are added by 005)
vitest.config.ts                                              # (pre-existing)
README.md                                                     # (pre-existing; +auth-feature quickstart + new env vars + new redis service)
```

**Structure Decision**: the auth feature uses Next.js's
**route-group parentheses syntax** to add the `(private)/` route
group without affecting the URL structure. The `app/(private)/layout.tsx`
file wraps its children in `<RouteGuard>`, which means **every
page inside `(private)/` is automatically guarded**. This is
cleaner than per-page guards (which would require every existing
private page — `app/teachers/page.tsx`, `app/classes/page.tsx`,
etc. — to import `RouteGuard` and wrap itself). The Stage 1
pages need to be **moved** into `app/(private)/` to participate
in the guard (a one-time path move with a corresponding import
fixup; the URL paths `/teachers`, `/classes`, `/subjects`,
`/levels` are unchanged because parentheses route groups do
not appear in the URL).

The `/login` page sits **outside** `(private)/` — it is
intentionally reachable without a session (per spec FR-022).
The `/` (root) page sits at `app/page.tsx` and serves as the
post-login default destination (per spec FR-004 +
`LOGIN_REDIRECT_DEFAULT`).

---

## Complexity Tracking

> No Constitution Check violations. The deferred hardening
> controls (CORS / CSP / CSRF / XSS) are documented in the
> Constitution Check row IX, not as violations. The
> `TODO(FEATURE_004_REDIRECT_TO)` and `TODO(FEATURE_004_LOG_SCRUB)`
> and `TODO(FEATURE_004_FIXTURE_FOR_HASH)` items are tracked in
> `tasks.md`.

---

## Re-evaluation: Constitution Check post-design

*After Phase 1 design (research.md, data-model.md,
contracts/auth.yaml, quickstart.md) — re-checking the gates
above.*

| Principle | Status | Re-evaluation notes |
|---|---|---|
| I. Spec-Driven Development | ✅ Pass | The plan.md is complete; research.md resolves every NEEDS CLARIFICATION from the spec; data-model.md, contracts/auth.yaml, and quickstart.md are written. No source code has been written yet — that is `/speckit-tasks` + `/speckit-implement` work. |
| II. TypeScript End-to-End | ✅ Pass | All new modules specified as `.ts` (or `.tsx` for the route guard). No `.js` source files. |
| III. Unit Tests Required | ✅ Pass | The unit tier is enumerated in [§Project Structure](#project-structure); the contract and integration tiers are specified in [./research.md](./research.md) §12. SC-001..SC-013 are mapped to test files in the structure. |
| IV. Single Role: Authenticated Administrator | ✅ Pass | The plan implements the authentication boundary that the constitution requires. The exempt list is exactly the two endpoints the constitution expects (`POST /api/v1.0/login`, `GET /api/v1.0/me`; `POST /api/v1.0/logout` is also exempt by idempotency). No new role is introduced. |
| V. Simplicity (YAGNI) | ✅ Pass | All deferred features are documented in [./research.md](./research.md) §15 + the spec's Assumptions block + the constitution Stage Scope → Stage 2 Out of Scope block. The plan introduces **no** abstractions ahead of the spec. |
| VI. Functional-First | ✅ Pass | All new modules are pure functions (or a function component for the route guard). The only class is the typeORM `User` entity, which is mandated by typeORM per Principle VI's carve-out. |
| VII. Joi Schema Validation | ✅ Pass | `lib/auth/schemas.ts` (Joi factory) mirrors the `User` entity column-for-column per [./data-model.md](./data-model.md) §2.5. Validation runs before any credential verification, typeORM call, or persistence write. |
| VIII. UI Quality | ✅ Pass | The login page is composed from `antd` `Form` + `Input` + `Button` primitives and styled with Tailwind utility classes. The route guard is a single function component with explicit, typed props. |
| IX. Security & Hardening | ⚠ Deferred (intentional) | Unchanged from the pre-Phase-0 row. The four hardening controls are owned by `005-security-hardening`. The `Secure` cookie flag is environment-driven (the one hardening-adjacent concern 004 owns, per Principle IV + research §5). The auth middleware is compatible with the future CSRF middleware (research §11). |

No new violations introduced by the design phase. The plan is
ready for `/speckit-tasks`.
