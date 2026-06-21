---
description: "Task list for User Authentication (004-user-auth) implementation"
---

# Tasks: User Authentication (004-user-auth)

**Input**: Design documents from `/specs/004-user-auth/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are **required** per Constitution Principle III (every domain rule is covered by a passing unit test) and per the spec's SC-001..SC-013 success criteria (every success criterion is verified by an automated test). Tests are written **first** within each phase and **must fail** before the corresponding implementation task runs.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and delivered independently. The six user stories in the spec (US1..US6) are mapped to Phase 3..Phase 8 below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single Next.js application** (per Constitution → Technical Stack Constraints). Paths are repository-relative:
  - `app/` — Next.js App Router (pages + route handlers)
  - `lib/` — application modules (server + client + shared)
  - `lib/auth/` — auth-feature pure-function modules (this feature)
  - `lib/db/` — database + Redis + typeORM entities
  - `scripts/` — standalone Node scripts (run via `npm run ...`)
  - `tests/` — three-tier test suite (unit + contract + integration)
  - `docker/` — Docker + Docker Compose files
- The `app/(private)/` route group is a Next.js parentheses-syntax layout for route-guard composition (see Phase 8 — US6).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization for the auth feature — new runtime dependencies, new Docker Compose service, new env keys.

- [ ] T001 Add `argon2@^0.40.x` and `ioredis@^5.4.x` as runtime dependencies, and `ioredis-mock@^8.9.x` as a devDependency, in `package.json`. Run `npm install` to verify the new packages resolve.
- [ ] T002 [P] Add `"seed:admin": "tsx scripts/seed-admin.ts"` to the `"scripts"` block of `package.json` (per spec FR-026 + research §8). The `tsx` runner is already a devDependency from Stage 1.
- [ ] T003 [P] Add the `redis` service to `docker/docker-compose.yml` (image `redis:7-alpine`, port `6379:6379`, named volume `pvt_edu_redis_data`, health check via `redis-cli ping`). The session store runs in a separate container per the spec's Assumption block.
- [ ] T004 [P] Add the following keys to `.env.example` with safe defaults + brief comments documenting the fail-closed posture on `REDIS_URL`: `REDIS_URL` (required, no default), `SESSION_COOKIE_NAME` (default `pvt_edu_session`), `SESSION_COOKIE_SECURE` (default `NODE_ENV === 'production'`), `SESSION_TTL_SECONDS` (default `1800`), `LOGIN_REDIRECT_DEFAULT` (default `/`), `PASSWORD_HASH_ALGO` (default `argon2id`).

**Checkpoint**: `npm install` succeeds; `docker compose up -d redis` starts the session store; `.env.example` documents every new env key.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure-function modules under `lib/auth/*`, the `User` typeORM entity, the auth middleware itself, and the seed script — every other phase depends on these. **No user story work can begin until this phase is complete.**

- [ ] T005 Implement the `redis` singleton in `lib/db/redis.ts` — reads `REDIS_URL` from `lib/config.ts`; throws a fail-fast error on boot if `REDIS_URL` is missing (per the project's `.env` discipline). Exports a single `redis` instance consumed by `lib/auth/session.ts`.
- [ ] T006 [P] Implement the Joi login schema in `lib/auth/schemas.ts` — `loginRequestSchema` factory (object with `username` + `password`, both required, length-bounded to `users.username VARCHAR(64)` / `users.password VARCHAR(255)` per Principle VII's mirror rule; `additionalProperties(false)` to reject unknown keys per spec Edge Cases; see data-model.md §2.5).
- [ ] T007 [P] Implement `lib/auth/password.ts` — exports `hashPassword(plain)` and `verifyPassword(plain, hash, salt)`. Uses `argon2id` with the package's default parameters (`memoryCost = 65536`, `timeCost = 3`, `parallelism = 4`); both functions return the salt and hash as separate base64 strings (the seed path and the verify path stay in lockstep — research §1).
- [ ] T008 [P] Implement `lib/auth/cookie.ts` — exports `sessionCookieName` (from `SESSION_COOKIE_NAME` env, default `pvt_edu_session`), `setSessionCookie(res, sessionId)`, `clearSessionCookie(res)`, `readSessionCookie(req)`. The `Secure` flag is read from `SESSION_COOKIE_SECURE` env at module load (per Principle IV + research §5); all attributes per research §4 table.
- [ ] T009 [P] Implement `lib/auth/session.ts` — exports `createSession(user)`, `getSession(sessionId)`, `destroySession(sessionId)`, and the `Session` type. Uses the `redis` singleton from `lib/db/redis.ts`; `SET session:<token> <json> EX <SESSION_TTL_SECONDS>` (default 30 min); `getSession` returns `null` on miss; `destroySession` is idempotent (per spec FR-007).
- [ ] T010 [P] Implement `lib/auth/log.ts` — exports `logAuthLogin(outcome, ...)` and `logAuthLogout(...)`. Emits exactly one structured log entry per call with the fields specified by FR-027 / FR-028; NEVER logs the password, hash, salt, or full session cookie value (per SC-012 + research §11).
- [ ] T011 [P] Implement the `User` typeORM entity in `lib/db/entities/user.ts` — eleven columns per data-model.md §2.1 (`id BIGINT UNSIGNED AUTO_INCREMENT` PK, `ulid CHAR(26) UNIQUE`, `username VARCHAR(64) UNIQUE`, `password VARCHAR(255)`, `salt VARCHAR(255)`, `active BOOLEAN DEFAULT TRUE`, plus the five audit columns `created_at`, `created_by`, `modified_at`, `modified_by`, `version`). `@BeforeInsert()` hook generates the `ulid` via `lib/ulid.ts`. Three indexes: `uq_users_username`, `uq_users_ulid`, `idx_users_active`.
- [ ] T012 Implement `lib/auth/middleware.ts` — exports `withAuth(handler)` and the `PUBLIC_PATHS` constant. The wrapper reads the session cookie via `lib/auth/cookie.ts`, looks up the session via `lib/auth/session.ts`, attaches `{ userId, ulid }` to the request on a hit, and returns `401 Unauthorized` (with `{ "error": "Unauthorized" }`) on miss — or `503 Service Unavailable` on Redis-down. The exempt list is exactly `POST /api/v1.0/login`, `GET /api/v1.0/me`, `POST /api/v1.0/logout` (per spec FR-011; logout is exempt by idempotency).
- [ ] T013 Implement `scripts/seed-admin.ts` — the `npm run seed:admin` hash-and-print helper (per spec FR-026 + research §8). Accepts `--username`, `--password`, `--confirm` from CLI via `tsx`; uses `lib/auth/password.ts` + `lib/ulid.ts` to produce a `{ hash, salt, ulid }` tuple; prints a parameterised `INSERT INTO users (...) VALUES (...)` statement to stdout; refuses to run without `--confirm`. Does **not** touch the database.
- [ ] T014 [P] Unit tests for `lib/auth/schemas.ts` in `tests/unit/auth/schemas.spec.ts` — happy path (valid `{ username, password }`) + every rejection path (missing username, missing password, unknown field, username > 64 chars, password > 255 chars).
- [ ] T015 [P] Unit tests for `lib/auth/password.ts` in `tests/unit/auth/password.spec.ts` — `hashPassword(plain)` returns a `$argon2id$...` envelope; `verifyPassword(plain, hash, salt)` succeeds for matching inputs and fails for mismatches; verify is timing-safe (the underlying `argon2.verify` constant-time compare).
- [ ] T016 [P] Unit tests for `lib/auth/cookie.ts` in `tests/unit/auth/cookie.spec.ts` — `setSessionCookie` produces the full attribute set (`Path=/`, `Max-Age=1800`, `HttpOnly`, `Secure`, `SameSite=Strict`); `Secure` reflects `SESSION_COOKIE_SECURE` env (true in prod, false in dev); `clearSessionCookie` produces `Value=""`, `Max-Age=0`, past `Expires`; `readSessionCookie` returns the value for a present cookie and `null` for a missing cookie.
- [ ] T017 [P] Unit tests for `lib/auth/session.ts` in `tests/unit/auth/session.spec.ts` — uses `ioredis-mock` to stub the `redis` singleton. `createSession(user)` writes a key with the right value shape (`{ userId, ulid, createdAt }`) and the configured TTL; `getSession(token)` returns the parsed object on hit and `null` on miss; `destroySession(token)` is idempotent (no error on absent key).
- [ ] T018 [P] Unit tests for `lib/auth/log.ts` in `tests/unit/auth/log.spec.ts` — the never-leak-secrets log-scrub spec (per SC-012): every `logAuthLogin` and `logAuthLogout` call produces a structured entry whose serialised form contains neither the submitted password, the stored hash, the stored salt, nor the full session cookie value. Asserts the FR-027 / FR-028 field set on success and failure paths.
- [ ] T019 [P] Unit tests for `lib/auth/middleware.ts` in `tests/unit/auth/middleware.spec.ts` — `withAuth(handler)` returns `401` for missing cookie, unknown cookie, and Redis error; returns `503` for Redis connection refused (the `maxRetriesPerRequest` exhausted case); passes through (`next()`) and attaches `{ userId, ulid }` for a valid session; the `PUBLIC_PATHS` exempt list is honoured (no lookup runs for `POST /api/v1.0/login`, `GET /api/v1.0/me`, `POST /api/v1.0/logout`).

**Checkpoint**: Foundation ready. Every `lib/auth/*` module is unit-tested; the `User` entity compiles; the seed script runs and prints SQL; the `withAuth` wrapper's 401 / 503 / happy-path branches are all covered. User story implementation can begin.

---

## Phase 3: User Story 1 — Reach the Login Page (Priority: P1) 🎯 MVP

**Goal**: An unauthenticated visitor who navigates to any page of the application is presented with the login page containing exactly three interactive elements (username input, password input, "Log in" button).

**Independent Test**: Load any URL of the application while no session cookie is set and verify the page that renders is the login page containing exactly the three elements listed above. Verify the rendered HTML does NOT contain "Sign up", "Register", "Forgot password", or "Remember me" controls (per spec US1 acceptance scenario 3).

### Tests for User Story 1

- [ ] T020 [P] [US1] Contract test in `tests/contract/login-page.spec.ts` — mounts `/login` in a JSDOM environment with a mocked `GET /api/v1.0/me` returning `401`; asserts the rendered output contains exactly one `<input>` with `name="username"`, one `<input type="password" name="password">`, and one `<button type="submit">`; asserts no element with text matching `/sign\s*up|register|forgot\s*password|remember\s*me/i` is rendered.

### Implementation for User Story 1

- [ ] T021 [US1] Create `app/login/page.tsx` — the login page composed from `antd` `Form` + `Input` + `Button` primitives styled with Tailwind utility classes (per Constitution Principle VIII). Exactly three interactive elements per spec FR-002; no other controls. Submit button text is exactly `Log in`.
- [ ] T022 [US1] In `app/login/page.tsx`: wire the form to `POST /api/v1.0/login` as `application/json` (per spec FR-003). On `200 OK`, navigate to `LOGIN_REDIRECT_DEFAULT` (per spec FR-004 fallback; the `redirectTo` query handling is wired in Phase 8 — US6 — task T042). On `401`, display a single generic error message `Invalid username or password` and clear the password field (per FR-005). On `400`, display the field-level error from the response body.

**Checkpoint**: User Story 1 is fully functional and independently testable. The page itself is reachable and renders the three-element form; the POST wiring is in place; error handling covers the 200 / 400 / 401 paths. (Full reach-ability via the route guard is delivered in Phase 8 — US6.)

---

## Phase 4: User Story 2 — Log In with Valid Credentials (Priority: P1)

**Goal**: An unauthenticated visitor who enters a valid username and password on the login page and clicks `Log in` is authenticated. The server creates a server-side session, returns a session cookie to the browser, and the browser is taken off `/login`.

**Independent Test**: Insert one valid user row via `npm run seed:admin → mysql`; load the login page; enter the user's username + password; click `Log in`; verify a session cookie is set on the response with the correct attributes, a Redis key is created with a 30-minute TTL, and the response carries a `Set-Cookie` header.

### Tests for User Story 2

- [ ] T023 [P] [US2] Contract test for `POST /api/v1.0/login` happy path in `tests/contract/login.api.spec.ts` — inserts a known user row in the test DB, posts valid `{ username, password }`, asserts: HTTP `200 OK`; empty response body; `Set-Cookie` header contains `pvt_edu_session=<base64url-token>; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Strict`; a `session:<token>` key exists in the test Redis with TTL ≈ 1800; the JWT-shaped value is a JSON object with `userId`, `ulid`, `createdAt`.

### Implementation for User Story 2

- [ ] T024 [US2] Implement `app/api/v1.0/login/route.ts` — the `POST` handler. Wraps the inner handler with `withApiContract` (from `lib/api/route.ts`, the cross-cutting wrapper from 003) for the 415 content-type gate. The route is **exempt** from `withAuth` (per spec FR-011) — the handler does the credential verification itself.
- [ ] T025 [US2] In the `POST /api/v1.0/login` handler: validate the body with `loginRequestSchema` (returns `400` on failure per spec FR-006 validation path); look up the user by `username` via the `User` entity (returns `401` with generic envelope on miss — see Phase 5 — US3 — T028 for the structured logging on the failure path); verify the password with `verifyPassword(plain, user.password, user.salt)`; reject with `401` if `user.active === false`.
- [ ] T026 [US2] In the `POST /api/v1.0/login` handler on successful credential verification: (a) read any pre-existing session cookie from the **request** via `readSessionCookie`; if present, run `destroySession(preExisting)` on Redis (session-fixation defence per spec FR-006 + Clarifications Session 2026-06-21 round 1, Q4 + research §3.5); (b) call `createSession(user)` to mint a fresh session with a `crypto.randomBytes(32).toString('base64url')` token; (c) call `setSessionCookie(res, newToken)` to set the response cookie; (d) return `200 OK` with an empty body.

**Checkpoint**: User Story 2 is fully functional. `POST /api/v1.0/login` mints a fresh session, writes the Redis key with a 30-minute TTL, sets the session cookie on the response, and replaces any pre-existing session (defending against session fixation).

---

## Phase 5: User Story 3 — Reject Invalid Credentials (Priority: P1)

**Goal**: An unauthenticated visitor who submits an unknown username, an inactive username, or a username paired with the wrong password is shown a meaningful error message on the login page and is **not** authenticated. The login endpoint does NOT leak which credential was wrong.

**Independent Test**: Attempt login with each of (a) an unknown username, (b) a known username with the wrong password, (c) a known username whose `active = false`; verify all three attempts return `401` with the **identical** generic error message, no session cookie is set on the response, and the server-side log distinguishes the three reasons (`unknown_user` / `wrong_password` / `inactive_user`) per FR-027.

### Tests for User Story 3

- [ ] T027 [P] [US3] Contract test for `POST /api/v1.0/login` failure paths in `tests/contract/login.api.spec.ts` (extends the T023 file) — for each of the three failure cases: assert HTTP `401 Unauthorized`, assert response body is exactly `{ "error": "Invalid username or password" }`, assert no `Set-Cookie` header on the response, assert the server-side log entry contains `outcome: "failure"` and the correct `reason` (`unknown_user` / `wrong_password` / `inactive_user`). Assert the response body does NOT distinguish the three cases (the strings are identical byte-for-byte).

### Implementation for User Story 3

- [ ] T028 [US3] In the `POST /api/v1.0/login` handler: branch on the three lookup outcomes. For each failure case (unknown user, wrong password, inactive user), call `logAuthLogin({ outcome: 'failure', reason: '<reason>', username, ip, timestamp })` then return `401` with the generic `{ "error": "Invalid username or password" }` envelope (per spec FR-006 + FR-013). The server-side log distinguishes the reasons; the client never sees which credential was wrong (security floor — prevents username enumeration).
- [ ] T029 [US3] In the `POST /api/v1.0/login` handler: the validation-error path (Joi rejects the body with a field-level error — task T025 from Phase 4 / US2 returns `400` with the field-level envelope) MUST also emit a structured log entry via `logAuthLogin({ outcome: 'failure', reason: 'validation_error', ... })` (per FR-027). The internal-error path (any unhandled exception) returns `500` with `{ "error": "Internal server error" }` and emits `logAuthLogin({ outcome: 'failure', reason: 'internal_error', ... })`.

**Checkpoint**: User Stories 2 AND 3 (the success + failure halves of `POST /api/v1.0/login`) both work independently and are covered by the contract tests in `tests/contract/login.api.spec.ts`. The structured log entries distinguish the failure reasons server-side while the client sees a single generic envelope.

---

## Phase 6: User Story 4 — Inspect the Current Session (Priority: P1)

**Goal**: The frontend calls `GET /api/v1.0/me`; if a session cookie is present and valid, the server returns the user profile; otherwise the server returns `401 Unauthorized`.

**Independent Test**: Call `GET /api/v1.0/me` without any session cookie — assert `401`. Log in to obtain a session cookie, then call `GET /api/v1.0/me` with the cookie — assert `200` with the user-profile body `{ username, active, ulid, createdAt }` (exactly those four fields, no others).

### Tests for User Story 4

- [ ] T030 [P] [US4] Contract test for `GET /api/v1.0/me` in `tests/contract/me.api.spec.ts` — covers three cases: (a) no `Cookie` header → HTTP `401` with `{ "error": "Unauthorized" }`; (b) a `Cookie: pvt_edu_session=<valid-token>` after a successful login → HTTP `200` with body `{ username, active, ulid, createdAt }` (exactly four top-level fields, no others — assert `Object.keys(body).length === 4`); (c) a `Cookie: pvt_edu_session=<unknown-token>` (forged or expired) → HTTP `401` (identical to case a).

### Implementation for User Story 4

- [ ] T031 [US4] Implement `app/api/v1.0/me/route.ts` — the `GET` handler. The route is **exempt** from `withAuth` (per spec FR-011) — the handler does the session lookup itself. Returns `401 Unauthorized` on missing cookie, unknown cookie, expired cookie, or Redis error indistinguishable from missing (the spec's indistinguishability property per Edge Cases).
- [ ] T032 [US4] In the `GET /api/v1.0/me` handler on a successful session lookup: look up the `User` row by `userId` from the session record; return HTTP `200 OK` with body `{ username, active, ulid, createdAt }` — exactly those four fields (per spec FR-009 + the cross-cutting FR-020 rule that audit columns are hidden from API responses). The `createdAt` is `users.created_at` formatted as ISO-8601 with microsecond precision.

**Checkpoint**: User Story 4 is fully functional. The `GET /api/v1.0/me` endpoint is the bootstrap handshake for the React route guard (Phase 8 — US6). The response shape is locked down by the contract test (exactly four fields).

---

## Phase 7: User Story 5 — Log Out (Priority: P2)

**Goal**: An authenticated visitor can log out, which destroys the server-side session and clears the session cookie from the browser. After logout, the browser navigates to `/login`. The originally-requested URL is **not** preserved across logout (per Clarifications Session 2026-06-21 round 1, Q5). Logout is idempotent — calling it without a session returns `200 OK` with no error.

**Independent Test**: Log in (gets a session cookie + Redis key); call `POST /api/v1.0/logout` with the cookie; verify HTTP `200 OK`, the response carries a `Set-Cookie` header that clears `pvt_edu_session` (`Value=""`, `Max-Age=0`, past `Expires`), the Redis key is gone, and the next protected request bearing the now-cleared cookie returns `401`. Then call `POST /api/v1.0/logout` again with no cookie — verify `200 OK` (idempotent).

### Tests for User Story 5

- [ ] T033 [P] [US5] Contract test for `POST /api/v1.0/logout` in `tests/contract/logout.api.spec.ts` — covers four cases: (a) with valid session cookie → HTTP `200`, empty body, `Set-Cookie` header clears `pvt_edu_session`, Redis key is gone; (b) the next protected request with the now-cleared cookie → HTTP `401`; (c) without any cookie → HTTP `200` (idempotent); (d) with a `Cookie: pvt_edu_session=<unknown-token>` (forged) → HTTP `200` (idempotent — `destroySession` is a no-op on miss).

### Implementation for User Story 5

- [ ] T034 [US5] Implement `app/api/v1.0/logout/route.ts` — the `POST` handler. The route is **exempt** from `withAuth` (per spec FR-011 — the handler must run even without a session so the cookie can be cleared). The handler reads the session cookie from the request (via `readSessionCookie`), calls `destroySession(token)` on Redis (idempotent — no error on miss per spec FR-007), calls `clearSessionCookie(res)` to set the clearing `Set-Cookie` header (with `Value=""`, `Max-Age=0`, past `Expires`, same `Path`/`HttpOnly`/`Secure`/`SameSite` as the original cookie per spec FR-018), and returns `200 OK` with an empty body.
- [ ] T035 [US5] In the `POST /api/v1.0/logout` handler: emit exactly one structured log entry via `logAuthLogout({ sessionIdPrefix, ip, timestamp })` (per spec FR-028). `sessionIdPrefix` is the first 8 characters of the destroyed sessionId (enough to correlate with the matching `auth.login` entry; not the full token). When no session was present (idempotent logout), `sessionIdPrefix` is `null`.

**Checkpoint**: User Story 5 is fully functional. `POST /api/v1.0/logout` is idempotent, clears the cookie correctly, and emits the structured log entry. The session-fixation pre-seed defence (US2 / T026) and the idempotent logout (US5 / T034) together close the session-lifecycle holes.

---

## Phase 8: User Story 6 — React Route Guard (Priority: P1)

**Goal**: Every private page is wrapped in a route-guard component that calls `GET /api/v1.0/me` on mount. On `200`, the page renders. On `401`, the visitor is redirected to `/login?redirectTo=<encoded current URL>` so the post-login navigation can return to the originally-requested page.

**Independent Test**: (a) Open a private URL (e.g., `/teachers`) directly while no session cookie is set → assert the URL bar ends up on `/login?redirectTo=%2Fteachers`. (b) Open the same URL with a valid session cookie → assert the page renders normally. (c) Open `/login?redirectTo=//evil.example.com/`, log in → assert the browser ends up at `/` (the `LOGIN_REDIRECT_DEFAULT`), NOT at `evil.example.com` — the open-redirect defence holds.

### Tests for User Story 6

- [ ] T036 [P] [US6] Contract test for the `RouteGuard` component in `tests/contract/route-guard.spec.ts` — JSDOM-mounted component with a mocked `GET /api/v1.0/me`: (a) `200` → assert the protected children render; (b) `401` → assert `useRouter().push` was called with `/login?redirectTo=%2Fteachers` (the encoded current URL); (c) `503` → assert a retry-friendly error is shown (no redirect); (d) open-redirect defence — the `redirectTo` query validator rejects `//evil.example.com`, `http://evil.example.com`, and `javascript:alert(1)` and falls back to `LOGIN_REDIRECT_DEFAULT`.

### Implementation for User Story 6

- [ ] T037 [US6] Implement `lib/auth/route-guard.tsx` — the React function component (per Constitution Principle VI's "function components + hooks" requirement). On mount, calls `GET /api/v1.0/me` via the existing `lib/api/response.ts` helpers; renders `children` on `200`; on `401`, pushes a `redirectTo` URL to `/login`; on `503`, surfaces a retry-friendly error message without redirecting (the spec does not require auto-retry on `503`).
- [ ] T038 [US6] In `lib/auth/route-guard.tsx`: on the `401` path, encode the current URL (`window.location.pathname + window.location.search`) with `encodeURIComponent` and call `useRouter().push('/login?redirectTo=' + encoded)` (per research §6 + spec FR-021).
- [ ] T039 [US6] In `lib/auth/route-guard.tsx`: implement the single-slash-prefix validation as a guard **before** writing the `redirectTo` query — accept values that start with a single `/` (e.g., `/teachers`, `/classes?level=Primary%201`); reject `//evil.example.com`, `http://evil.example.com`, `javascript:...`, and any other absolute or scheme-prefixed value. Document that the same validation is applied at the login-page read site (T046) as defense-in-depth against an open-redirect vulnerability.
- [ ] T040 [US6] Create `app/(private)/layout.tsx` — the Next.js parentheses-syntax route-group layout. The file renders `<RouteGuard>{children}</RouteGuard>` so every page inside `app/(private)/` is automatically protected. The parens route group does not appear in the URL (e.g., a page at `app/(private)/teachers/page.tsx` is reachable at `/teachers`).
- [ ] T041 [US6] Move the existing Stage 1 private pages (`app/teachers/page.tsx`, `app/classes/page.tsx`, `app/subjects/page.tsx`, `app/levels/page.tsx`) into the `app/(private)/` directory — one-time path move. URL paths (`/teachers`, `/classes`, `/subjects`, `/levels`) are unchanged. Update any relative imports as needed (the structure move should be import-neutral because the files move as a group).
- [ ] T042 [US6] Update `app/login/page.tsx` (built in Phase 3 — US1 — T021/T022): on successful login (the `200 OK` response), read `redirectTo` from `useSearchParams()`, re-apply the same single-slash-prefix validation from T039, navigate to the validated value; if missing or invalid, navigate to `LOGIN_REDIRECT_DEFAULT`. Logout navigates to `/login` with no `redirectTo` param (per Clarifications Session 2026-06-21 round 1, Q5).

**Checkpoint**: User Story 6 is fully functional. Every existing private page is automatically protected by the route guard (via the `(private)/` layout). The `redirectTo` query encoding, validation, and consumption is consistent across the three sites (route guard write, login page read, fallback default). Open-redirect attacks are rejected by the single-slash-prefix rule.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end coverage of SC-001..SC-013, README updates, and final cross-artifact validation.

- [ ] T043 [P] Integration test SC-001 in `tests/integration/auth.spec.ts` — end-to-end happy path against the real Redis + real MySQL containers: boot the app, open `/login` via JSDOM or Playwright, enter valid credentials, submit, assert the browser is on a non-login page in < 10 s (the SC-001 budget).
- [ ] T044 [P] Integration test SC-002 in `tests/integration/auth.spec.ts` — protected endpoints return `401`: iterate every protected `/api/v1.0/*` endpoint (`/teachers` × 2, `/subjects`, `/classes` × 2, `/levels`) and assert each returns `401 Unauthorized` with `{ "error": "Unauthorized" }` when no session cookie is presented.
- [ ] T045 [P] Integration test SC-003 in `tests/integration/auth.spec.ts` — valid-credential session record + cookie shape: assert the `session:<token>` Redis key exists with TTL ≈ `SESSION_TTL_SECONDS` (default 1800) immediately after `POST /api/v1.0/login`, and the response `Set-Cookie` header carries the full attribute set per research §4.
- [ ] T046 [P] Integration test SC-004 in `tests/integration/auth.spec.ts` — invalid-credential `401` + no cookie: repeat for unknown user, wrong password, and inactive user; assert identical `401` bodies and no `Set-Cookie`; assert server-side log entries carry the distinguished `reason` field.
- [ ] T047 [P] Integration test SC-005 in `tests/integration/auth.spec.ts` — logout destroys session + clears cookie: log in, capture the session cookie, `POST /api/v1.0/logout`, assert the Redis key is gone, the response `Set-Cookie` clears the cookie, and the next protected request bearing the cleared cookie returns `401`.
- [ ] T048 [P] Integration test SC-006 in `tests/integration/auth.spec.ts` — 30-minute hard TTL expiry (the spec pins `SESSION_TTL_SECONDS=1800`; the integration test sets `SESSION_TTL_SECONDS=2` via env override and waits 3 s to exercise the TTL boundary without slowing CI). Assert the Redis key is gone after the TTL and the next protected request returns `401`.
- [ ] T049 [P] Integration test SC-007 in `tests/integration/auth.spec.ts` — `/me` response shape: log in, call `GET /api/v1.0/me`, assert `Object.keys(body).length === 4` and the four keys are exactly `['username', 'active', 'ulid', 'createdAt']`.
- [ ] T050 [P] Integration test SC-008 / SC-009 in `tests/integration/auth.spec.ts` — route guard reach + render: open `/teachers` without a session → assert the URL ends up on `/login?redirectTo=%2Fteachers`; log in via the form → assert the URL ends up on `/teachers` (the `redirectTo` round-trip). Then open `/teachers` with a valid session → assert the teachers page renders (no redirect).
- [ ] T051 [P] Integration test SC-010 in `tests/integration/auth.spec.ts` — Redis-down → `503`: `docker compose stop redis`; attempt `POST /api/v1.0/login` and `GET /api/v1.0/me`; assert both return `503 Service Unavailable` with `{ "error": "Service temporarily unavailable, please retry" }`; `docker compose start redis`; retry and assert success.
- [ ] T052 [P] Integration test SC-011 in `tests/integration/auth.spec.ts` — seed:admin round-trip fixture: run `scripts/seed-admin.ts` via `child_process.execFile` with a known username + password, capture the printed SQL, execute the SQL against the test MySQL container, then call `POST /api/v1.0/login` with the same credentials and assert `200 OK` (the printed SQL produces a row that the running app can log in with — verifying the seed and verify paths stay in lockstep).
- [ ] T053 [P] Integration test SC-012 in `tests/integration/auth.spec.ts` — log-scrub spec: capture the application's structured log stream; for every `POST /api/v1.0/login` and every `POST /api/v1.0/logout` invocation, assert the serialised log entry contains neither the submitted password, the stored hash, the stored salt, nor the full session cookie value (the SC-012 contract).
- [ ] T054 [P] Integration test SC-013 in `tests/integration/auth.spec.ts` — session-fixation defence: pre-seed a known `pvt_edu_session=<known>` cookie on a login request, submit valid credentials, assert (a) the response `Set-Cookie` carries a DIFFERENT token, (b) the pre-seeded `session:<known>` key is gone from Redis, (c) a subsequent request bearing the pre-seeded cookie returns `401`.
- [ ] T055 [P] Update `README.md` per the constitution's "README.md is a contract for every release" rule — add: (a) the auth-feature quickstart (one-paragraph "log in" flow, one-paragraph "seed an admin" flow with the `npm run seed:admin | mysql` chain), (b) the new env keys (`REDIS_URL`, `SESSION_COOKIE_*`, `LOGIN_REDIRECT_DEFAULT`, `PASSWORD_HASH_ALGO`) with safe defaults, (c) the new `redis` service in the Docker Compose quick-start, (d) the SC-001..SC-013 coverage table mapping each criterion to its `quickstart.md` validation step.
- [ ] T056 [P] Run `/speckit-analyze` — cross-artifact consistency check across `specs/004-user-auth/spec.md`, `plan.md`, and the new `tasks.md` (this file). Resolve any flagged inconsistencies before marking the feature done.
- [ ] T057 [P] Run `quickstart.md` end-to-end (Steps 1–14 in `specs/004-user-auth/quickstart.md`) against the running stack and confirm SC-001..SC-013 all pass. This is the manual smoke test the constitution's Development Workflow clause requires.

**Checkpoint**: SC-001..SC-013 are all covered by automated integration tests AND verified manually against the running stack. The README documents the new auth feature. Cross-artifact consistency is confirmed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — can start immediately. Completes the package, Docker Compose, and `.env.example` prerequisites.
- **Phase 2 (Foundational)**: depends on Phase 1 completion. **BLOCKS all user stories** — the `lib/auth/*` modules, the `User` entity, the `withAuth` wrapper, and the seed script are prerequisites for every endpoint and every UI page in Phases 3–8.
- **Phase 3 (US1)**: depends on Phase 2. The login page itself does not depend on any other user story; it can be built and tested independently.
- **Phase 4 (US2)**: depends on Phase 2. The `POST /api/v1.0/login` happy path is independent of other user stories.
- **Phase 5 (US3)**: depends on Phase 4 (the login handler built in T024–T026 is the substrate; T028 / T029 add the failure branches to it).
- **Phase 6 (US4)**: depends on Phase 2. The `GET /api/v1.0/me` handler is independent of US1 / US2 / US3 / US5.
- **Phase 7 (US5)**: depends on Phase 2. The `POST /api/v1.0/logout` handler is independent of US1 / US2 / US3 / US4.
- **Phase 8 (US6)**: depends on Phase 2 (the route-guard component does not directly use the login / logout handlers, but it does use `lib/auth/session.ts` and `lib/auth/cookie.ts` indirectly via the `GET /api/v1.0/me` endpoint from Phase 6 — US4). The `(private)/` layout move (T041) and the redirectTo wiring (T042) touch the login page built in Phase 3 — US1.
- **Phase 9 (Polish)**: depends on all desired user stories being complete (Phases 3–8). The integration test suite covers SC-001..SC-013 end-to-end.

### Within Each User Story

- Tests are written **first** (the contract test for the endpoint or the JSDOM test for the component) and **must fail** before the corresponding implementation task runs.
- The implementation tasks follow the natural order: route handler scaffold → handler body → cross-cutting concerns (logging, error mapping).

### Parallel Opportunities

- All `[P]`-marked tasks within a phase touch different files and can run in parallel (e.g., the six unit-test tasks in Phase 2 T014–T019 are all parallel; the contract tests in T020, T023, T027, T030, T033, T036 are all parallel because they write to different files).
- The integration tests in Phase 9 (T043–T054) are parallel-friendly — each writes its own `describe` block in `tests/integration/auth.spec.ts` (or a co-located file).
- Once Phase 2 completes, the six user stories can be worked on in parallel by different team members (US1..US6 are designed to be independent increments).

---

## Parallel Examples

### Parallel example: Phase 2 Foundational unit tests

```bash
# After T005..T013 are complete, launch all six unit-test tasks in parallel:
Task: "T014 [P] Unit tests for lib/auth/schemas.ts in tests/unit/auth/schemas.spec.ts"
Task: "T015 [P] Unit tests for lib/auth/password.ts in tests/unit/auth/password.spec.ts"
Task: "T016 [P] Unit tests for lib/auth/cookie.ts in tests/unit/auth/cookie.spec.ts"
Task: "T017 [P] Unit tests for lib/auth/session.ts in tests/unit/auth/session.spec.ts"
Task: "T018 [P] Unit tests for lib/auth/log.ts in tests/unit/auth/log.spec.ts"
Task: "T019 [P] Unit tests for lib/auth/middleware.ts in tests/unit/auth/middleware.spec.ts"
```

### Parallel example: Phase 3..8 user stories (after Phase 2 is complete)

```bash
# With three developers and Phase 2 complete, the user stories can split:
Developer A: Phase 3 (US1 — login page) + Phase 8 (US6 — route guard)
Developer B: Phase 4 (US2) + Phase 5 (US3 — both halves of POST /api/v1.0/login)
Developer C: Phase 6 (US4 — /me) + Phase 7 (US5 — /logout)
# Phase 9 (Polish) is owned by whoever has bandwidth when the others land.
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 + Phase 3)

1. Complete Phase 1 — Setup (4 tasks, ~30 minutes of npm + docker work).
2. Complete Phase 2 — Foundational (15 tasks, ~half a day of pure-function module work + unit tests).
3. Complete Phase 3 — User Story 1 (3 tasks, the login page itself).
4. **STOP and VALIDATE**: `/login` renders the three-element form; the form submits `POST /api/v1.0/login` and renders the generic error on `401`. The MVP is "the login page exists and accepts input" — it is not yet a usable product because the route guard (US6) and the success-path login handler (US2) are not yet built, but the page can be exercised in isolation.

### Incremental Delivery

1. Complete Phase 1 + Phase 2 → Foundation ready (`lib/auth/*` modules + `User` entity + `withAuth` + seed script + unit tests, all green).
2. Add Phase 3 (US1) → Login page renders + accepts input + shows errors (testable in isolation).
3. Add Phase 4 (US2) → Login mints a session + sets the cookie (testable via the contract test).
4. Add Phase 5 (US3) → Login correctly rejects invalid credentials with the same generic envelope (testable via the contract test).
5. Add Phase 6 (US4) → `GET /api/v1.0/me` returns the user profile (testable in isolation).
6. Add Phase 7 (US5) → Logout clears the session + cookie (testable in isolation).
7. Add Phase 8 (US6) → Route guard wraps every private page; `redirectTo` round-trip works (testable via the contract test + browser).
8. Add Phase 9 (Polish) → SC-001..SC-013 all green; README documents the feature; cross-artifact consistency confirmed.
9. Each phase adds value without breaking previous phases; each phase has its own contract-test or unit-test gate.

### Suggested MVP scope for an early demo

- Phases 1 + 2 + 3 (the page renders + accepts input + shows errors) — for stakeholder "look-and-feel" demo.
- Add Phase 4 (US2) for the smallest usable login → dashboard flow.
- Add Phases 5, 6, 7, 8 to complete the authentication boundary.
- Add Phase 9 for production-readiness.

---

## Notes

- All 57 tasks follow the strict checklist format (`- [ ] [ID] [P?] [Story] Description with file path`).
- Each user story has its own contract test (Phase 3 T020; Phase 4 T023 + Phase 5 T027; Phase 6 T030; Phase 7 T033; Phase 8 T036) written **before** the corresponding implementation tasks.
- Each `lib/auth/*` module has a dedicated unit test (Phase 2 T014–T019).
- The integration test suite (Phase 9 T043–T054) covers every SC-001..SC-013 success criterion from the spec.
- The `README.md` (T055) is a release contract per the constitution; it MUST be updated before the feature is marked done.
- The deferred Principle IX hardening controls (CORS / CSP / CSRF / XSS) are NOT in this task list — they belong to a future `005-security-hardening` spec, per the spec's Clarifications Session 2026-06-21 round 1, Q1.
- The four Stage 1 migration files (`1700000000000-InitSchema.ts`, `…-SeedSubjects.ts`, `…-InitClasses.ts`, `…-SeedLevels.ts`) are NOT in this task list — they were removed in the Session 2026-06-21 operational-rules clarification per FR-016.
