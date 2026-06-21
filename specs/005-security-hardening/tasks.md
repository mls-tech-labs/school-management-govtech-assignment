---
description: "Task list for Security Hardening (005-security-hardening) implementation"
---

# Tasks: Security Hardening (005-security-hardening)

**Input**: Design documents from `/specs/005-security-hardening/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/security.yaml, quickstart.md

**Tests**: Tests are **required** per Constitution Principle III (every domain rule is covered by a passing unit test) and per the spec's SC-001..SC-013 success criteria. Tests are written **first within each phase** (after the helpers land in Phase 2) and **must pass** at the phase checkpoint.

**Organization**: This feature is **infrastructure-heavy**: most of the implementation is shared middleware + helper modules that touch every endpoint. The Phase 2 (Foundational) phase therefore does almost all of the implementation; Phases 3..8 are **one phase per user story** and are primarily **verification + acceptance test** tasks. The MVP scope is Phase 1 + Phase 2 + Phase 3 (CORS works end-to-end).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (`[US1]`..`[US6]`); REQUIRED for user-story phases only
- Include exact file paths in descriptions

## Path Conventions

- **Single Next.js application** (per Constitution → Technical Stack Constraints). Paths are repository-relative:
  - `app/` — Next.js App Router (pages + route handlers)
  - `lib/` — application modules (server + client + shared)
  - `lib/security/` — security-hardening pure-function modules (this feature)
  - `lib/auth/` — auth-feature modules owned by 004 (amended by 005)
  - `tests/` — three-tier test suite (unit + contract + integration)
  - `middleware.ts` — Next.js middleware at the repo root (the CORS + CSRF pre-handler layer)
  - `next.config.mjs` — static per-response security headers

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the five new `.env` keys to `.env.example`. No new packages, no new containers, no new dependencies.

- [ ] T001 [P] Add the following keys to `.env.example` with safe defaults and a one-line comment documenting each key's purpose, default, format, and fail-closed posture: `CORS_ALLOWED_ORIGINS` (default empty; fail-closed per FR-013), `CORS_ALLOWED_HEADERS` (default `Content-Type, X-CSRF-Token`), `CSP_POLICY` (default the shipped restrictive policy from FR-003), `CSP_REPORT_ONLY` (default `false`), `HSTS_ENABLED` (default `true` when `NODE_ENV=production`, default `false` otherwise).

**Checkpoint**: `.env.example` lists all five keys with one-line comments; no other config files changed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `lib/security/*` helper modules, the `middleware.ts` Next.js middleware, the `next.config.mjs` static-headers configuration, the `lib/config.ts` exposure of the five new keys, and the four amendments to the existing 004-owned `lib/auth/*` modules. **No user story verification can begin until this phase is complete.**

- [ ] T002 [P] Implement `lib/security/headers.ts` — exports `buildCspHeader(policy: string, reportOnly: boolean)` (returns `{ name: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only', value: policy }`) and `buildCompanionHeaders(nodeEnv: 'development' | 'production', hstsEnabled: boolean)` (returns the record `{ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Strict-Transport-Security'?: 'max-age=63072000; includeSubDomains' }`). HSTS is present only when `nodeEnv === 'production' && hstsEnabled`.
- [ ] T003 [P] Implement `lib/security/log.ts` — exports `logCorsRejection(req, reason)` and `logCsrfRejection(req, reason)`. Each emits exactly one structured JSON line to stdout via `console.log(JSON.stringify(...))`; the line MUST include `event` ('cors_rejected' or 'csrf_rejected'), `method`, `path`, `reason`, `timestamp`, and `origin` (when present); MUST NOT include the session cookie value, the CSRF token value, the request body, the response body, or any password / hash / salt.
- [ ] T004 [P] Implement `lib/security/csrf.ts` — exports `mintCsrfToken(): string` (uses `crypto.randomBytes(32).toString('base64url')` — 256 bits, identical source to the session token per research §3) and `compareCsrfTokens(cookie: string | undefined, header: string | undefined): boolean` (constant-time via `crypto.timingSafeEqual` on equal-length buffers; returns `false` when either side is missing or when lengths differ; runs a deliberate dummy compare when lengths differ so timing doesn't leak length info).
- [ ] T005 [P] Implement `lib/security/cors.ts` — exports `matchOrigin(origin: string | null, allowedCsv: string): boolean` (lowercases both sides, trims whitespace, rejects `null` and empty strings, uses a `Set` for membership) and `buildCorsHeaders(allowedOrigin: string, allowedHeaders: string, req: NextRequest): Record<string, string>` (returns `{ 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': allowedHeaders, 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD', 'Vary': 'Origin' }` for preflight; the slimmed-down `{ Allow-Origin, Allow-Credentials, Vary }` set for non-preflight).
- [ ] T006 [P] Implement `lib/security/csrf-client.ts` — exports `getCsrfToken(): string | null` (SSR-safe via `typeof document === 'undefined'` short-circuit; reads `document.cookie` via a single anchored regex `/(?:^|;\s*)csrfToken=([^;]+)/`; returns the decoded value or `null`). This is the **only** call site in the codebase that reads `document.cookie` for CSRF purposes (per spec FR-019a + SC-013).
- [ ] T007 Create the barrel export `lib/security/index.ts` — re-exports `matchOrigin`, `buildCorsHeaders`, `mintCsrfToken`, `compareCsrfTokens`, `buildCspHeader`, `buildCompanionHeaders`, `logCorsRejection`, `logCsrfRejection`, `getCsrfToken`. One import per consumer.
- [ ] T008 Amend `lib/config.ts` — export the five new constants: `CORS_ALLOWED_ORIGINS` (string, empty default), `CORS_ALLOWED_HEADERS` (string, `Content-Type, X-CSRF-Token` default), `CSP_POLICY` (string, the shipped restrictive policy default), `CSP_REPORT_ONLY` (boolean, `false` default), `HSTS_ENABLED` (boolean, `NODE_ENV === 'production'` default when unset).
- [ ] T009 [P] Amend `lib/auth/session.ts` (004-owned) — add `csrfToken: string` to the `SessionRecord` interface; update the `redis SET` payload to include the field; update the `getSession` parsing to read it; no other behavioural change.
- [ ] T010 [P] Amend `lib/auth/cookie.ts` (004-owned) — add `setCsrfCookie(res, token, options)` and `clearCsrfCookie(res, options)` helpers; the CSRF cookie uses the same `Secure` env-driven flag, `Path=/`, `SameSite=Strict`, `Max-Age=SESSION_TTL_SECONDS`, `HttpOnly=false`; the cookie name is `csrfToken`.
- [ ] T011 Amend `tests/unit/auth/cookie.spec.ts` (004-owned test file) — add coverage for `setCsrfCookie` (every attribute including the `Secure` env-driven relaxation) and `clearCsrfCookie` (Max-Age=0 + cleared value).
- [ ] T012 Amend `tests/unit/auth/session.spec.ts` (004-owned test file) — add coverage for the `csrfToken` field round-trip through `createSession` + `getSession` (asserts the field is set on create and read on get).
- [ ] T013 Implement `middleware.ts` at the repo root — exports the default `middleware(req: NextRequest)` Next.js middleware function. The matcher is `['/api/:path*']` so static pages bypass the middleware. The middleware composes (in order): (1) `corsCheck(req)` — returns a `NextResponse` with the CORS headers on preflight from an allowed origin; returns `403` (with `{ "error": "cors" }` and a `cors_rejected` log line) on disallowed origin or preflight without `Origin`; on a non-preflight from an allowed origin, sets the slim CORS headers and continues. (2) `csrfCheck(req)` — for `GET`/`HEAD`/`OPTIONS` requests OR requests matching the exempt list `['/api/v1.0/login', '/api/v1.0/logout', '/api/v1.0/me']`, continues. For other state-changing requests, compares the `csrfToken` cookie to the `X-CSRF-Token` header via `compareCsrfTokens`; on miss or mismatch, returns `403` with `{ "error": "csrf" }` and a `csrf_rejected` log line. (3) `next()` (the default Next.js behaviour — passes through to the route handler where 004's `withAuth` runs). The CSRF step reads the session record inline to look up `SessionRecord.csrfToken` for the constant-time compare (per `data-model.md` §2.1 — exactly one Redis `GET` per protected request). A request with NO session cookie and NO `X-CSRF-Token` header is the missing-cookie path of `compareCsrfTokens` → `403` + `{"error":"csrf"}` (the CSRF check is the trust boundary, NOT `withAuth`; see the spec Edge Case "State-changing request with no session" for the rationale). The `withAuth` 401 path is only hit when a valid CSRF pair is presented against a session that has since expired in Redis.
- [ ] T014 Amend `next.config.mjs` — add a `headers()` async function that returns the array of `{ source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: buildCspHeader(CSP_POLICY, CSP_REPORT_ONLY).value }, ...buildCompanionHeaders(NODE_ENV, HSTS_ENABLED) ] }`. The CSP header name is `Content-Security-Policy-Report-Only` when `CSP_REPORT_ONLY=true`. The function imports from `lib/security/headers.ts` so the builder is unit-testable.
- [ ] T015 [P] Unit tests for `lib/security/headers.ts` in `tests/unit/security/headers.spec.ts` — `buildCspHeader(policy, false)` returns the enforce header; `buildCspHeader(policy, true)` returns the report-only header (the round-trip from spec FR-004 / SC-011 amendment / TODO(FEATURE_005_CSP_TEST_ROUNDTRIP)); `buildCompanionHeaders('production', true)` includes HSTS; `buildCompanionHeaders('development', true)` omits HSTS; `buildCompanionHeaders('production', false)` omits HSTS.
- [ ] T016 [P] Unit tests for `lib/security/log.ts` in `tests/unit/security/log.spec.ts` — the never-leak-secrets log-scrub spec (per TODO(FEATURE_005_LOG_SCRUB)): assert that `logCorsRejection` and `logCsrfRejection` produce structured entries that contain the `event` discriminator and the mandatory fields (`method`, `path`, `reason`, `timestamp`) but NEVER the session cookie value, the CSRF token value, the request body, the response body, or any password / hash / salt. Use a stdout spy via `vi.spyOn(console, 'log')`.
- [ ] T017 [P] Unit tests for `lib/security/csrf.ts` in `tests/unit/security/csrf.spec.ts` — `mintCsrfToken()` returns a 43-character `base64url` string (no `+`, `/`, or `=`); two calls return different values (CSPRNG sanity); `compareCsrfTokens` returns `true` for matching inputs, `false` for missing inputs, `false` for mismatched inputs, `false` for different-length inputs; the compare is constant-time (verified via a high-iteration timing comparison — the variance is below the threshold for the chosen lengths).
- [ ] T018 [P] Unit tests for `lib/security/cors.ts` in `tests/unit/security/cors.spec.ts` — `matchOrigin(null, 'http://a.com')` returns `false`; `matchOrigin('', 'http://a.com')` returns `false`; `matchOrigin('http://a.com', '')` returns `false`; exact-match case insensitive; whitespace-trimmed CSV; `buildCorsHeaders` returns the full preflight set (Allow-Origin, Allow-Credentials, Allow-Headers, Allow-Methods, Vary) for preflight, and the slim non-preflight set (Allow-Origin, Allow-Credentials, Vary) for non-preflight.
- [ ] T019 [P] Unit tests for `lib/security/csrf-client.ts` in `tests/unit/security/csrf-client.spec.ts` — `getCsrfToken()` returns the value of the `csrfToken` cookie when one is present; returns `null` when none is present (per spec SC-013); returns `null` when `document` is undefined (SSR safety). Use a JSDOM-stub for `document.cookie`. Verify the codebase grep test (no other file reads `document.cookie` for CSRF purposes) is documented as a CI check.

**Checkpoint**: All six `lib/security/*` helper modules are unit-tested; the `middleware.ts` orchestrator is implemented and matches the layering documented in `research.md` §1; `next.config.mjs` emits the four static headers via the unit-tested `buildCspHeader` and `buildCompanionHeaders`; 004's `SessionRecord` carries the `csrfToken` field; 004's cookie helpers cover the CSRF cookie. The application MUST boot with the new env keys and serve the four static headers on every response.

---

## Phase 3: User Story 1 — CORS allow-list rejects unauthorised origins (Priority: P1) 🎯 MVP

**Goal**: The browser blocks cross-origin API responses whose `Origin` is not on the `CORS_ALLOWED_ORIGINS` allow-list; the same-origin and allow-listed cross-origin paths succeed.

**Independent Test**: With `CORS_ALLOWED_ORIGINS=http://allowed.example.com`, issue a `GET /api/v1.0/subjects` from `Origin: http://allowed.example.com` and observe `Access-Control-Allow-Origin: http://allowed.example.com` + `Access-Control-Allow-Credentials: true`. Issue the same request from `Origin: http://evil.example.com` and observe `403` with no `Access-Control-Allow-Origin` echo. Issue an `OPTIONS` preflight from `http://allowed.example.com` with `Access-Control-Request-Method: POST` and observe `204` with the full CORS preflight header set (per spec FR-001a + SC-003).

### Tests for User Story 1

- [ ] T020 [P] [US1] Contract test in `tests/contract/security/cors.spec.ts` — preflight from allowed origin (SC-003): `OPTIONS /api/v1.0/teachers` with `Origin: http://allowed.example.com` + `Access-Control-Request-Method: POST` returns `204` with `Access-Control-Allow-Origin: http://allowed.example.com`, `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD`, `Access-Control-Allow-Headers: Content-Type, X-CSRF-Token` (per FR-001a), `Access-Control-Allow-Credentials: true`, `Vary: Origin`.
- [ ] T021 [P] [US1] Contract test in `tests/contract/security/cors.spec.ts` — disallowed origin rejected (SC-002): `GET /api/v1.0/subjects` with `Origin: http://evil.example.com` returns `403` with `{ "error": "cors" }` and NO `Access-Control-Allow-Origin` echo.
- [ ] T022 [P] [US1] Contract test in `tests/contract/security/cors.spec.ts` — `Origin: null` request rejected (Edge Case): `GET /api/v1.0/subjects` with `Origin: null` returns `403` with `{ "error": "cors" }`.

**Checkpoint**: User Story 1 is fully functional and independently testable. The MVP is deliverable at the end of this phase (Phases 1 + 2 + 3).

---

## Phase 4: User Story 2 — CSP header blocks injected inline scripts (Priority: P1)

**Goal**: Every response carries the restrictive `Content-Security-Policy` header from spec FR-003; the `script-src 'self'` directive blocks injected inline `<script>` tags as defense-in-depth.

**Independent Test**: Make any request and observe the `Content-Security-Policy` header in the response. Confirm `script-src 'self'` is present (no `'unsafe-inline'`). Confirm `Content-Security-Policy-Report-Only` header is emitted when `CSP_REPORT_ONLY=true`. Confirm `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` are present on every response (per SC-005).

### Tests for User Story 2

- [ ] T023 [P] [US2] Contract test in `tests/contract/security/csp.spec.ts` — CSP header present on every response (SC-005): `GET /api/v1.0/subjects` returns the `Content-Security-Policy` header with the shipped policy from FR-003; `X-Content-Type-Options: nosniff` is present; `Referrer-Policy: strict-origin-when-cross-origin` is present.
- [ ] T024 [P] [US2] Contract test in `tests/contract/security/csp.spec.ts` — `CSP_REPORT_ONLY=true` switches the header name (SC-011 amendment + FR-004): restart with the env var set; `GET /api/v1.0/subjects` returns `Content-Security-Policy-Report-Only` with the same policy string; the enforce header is absent.

**Checkpoint**: User Story 2 is fully functional and independently testable. The CSP posture is documented in `next.config.mjs` and the builder is unit-tested.

---

## Phase 5: User Story 3 — CSRF double-submit token blocks forged state changes (Priority: P1)

**Goal**: Every state-changing API request is rejected with `403` + `{"error":"csrf"}` when the `csrfToken` cookie and the `X-CSRF-Token` request header do not match. The three explicit exempt endpoints (`POST /api/v1.0/login`, `POST /api/v1.0/logout`, `GET /api/v1.0/me`) bypass the check. Safe methods (`GET` / `HEAD` / `OPTIONS`) bypass the check.

**Independent Test**: Log in (CSRF-exempt), observe the `csrfToken` cookie set. Issue `POST /api/v1.0/teachers` without `X-CSRF-Token` → expect `403` + `{"error":"csrf"}`. Issue the same request with the matching `X-CSRF-Token` → expect `201` (per SC-004). Issue `POST /api/v1.0/login` without `X-CSRF-Token` → expect `200` (exempt).

### Implementation for User Story 3 (cross-feature amendments)

- [ ] T025 [US3] Amend `app/api/v1.0/login/route.ts` (004-owned) — after a successful argon2id verify + session mint, call `mintCsrfToken()`, write the token to the session record via the amended `lib/auth/session.ts → createSession`, and call `setCsrfCookie(res, csrfToken, cookieOptions)` (cookie options match the session cookie's `Secure` env-driven flag, `Path=/`, `SameSite=Strict`, `Max-Age=SESSION_TTL_SECONDS`).
- [ ] T026 [US3] Amend `app/api/v1.0/logout/route.ts` (004-owned) — alongside `clearSessionCookie`, call `clearCsrfCookie(res, cookieOptions)` so the browser drops the `csrfToken` cookie on logout.
- [ ] T027 [P] [US3] Amend the React fetch wrapper used by the create-teacher form in `app/teachers/` (001-owned) — import `getCsrfToken` from `lib/security/csrf-client`; add `'X-CSRF-Token': getCsrfToken() ?? ''` to the `fetch` options for `POST` calls. (The `getCsrfToken() ?? ''` fallback preserves the existing behaviour when the user has not yet logged in — the auth middleware will reject with `401` before the CSRF middleware runs.)
- [ ] T028 [P] [US3] Amend the React fetch wrapper used by the create-class form in `app/classes/` (002-owned) — same change as T027.

### Tests for User Story 3

- [ ] T029 [P] [US3] Contract test in `tests/contract/security/csrf.spec.ts` — CSRF mismatch rejected (SC-004): log in, then `POST /api/v1.0/teachers` with no `X-CSRF-Token` header returns `403` + `{"error":"csrf"}`. Same call WITH the matching `X-CSRF-Token` returns `201`. Same call with a deliberately-wrong `X-CSRF-Token` returns `403` + `{"error":"csrf"}`. Asserts that the response carries a structured stdout log line with `event: "csrf_rejected"` and NEVER the session cookie value or the CSRF token value (per TODO(FEATURE_005_LOG_SCRUB) + SC-011).
- [ ] T030 [P] [US3] Contract test in `tests/contract/security/csrf.spec.ts` — CSRF exempt list honoured (FR-008): `POST /api/v1.0/login` with no `X-CSRF-Token` returns `200` (success path) or `401` (credential path) — never `403 csrf`. `POST /api/v1.0/logout` with no `X-CSRF-Token` returns `200` and clears both cookies. `GET /api/v1.0/me` with no `X-CSRF-Token` returns `200` or `401` — never `403 csrf`.
- [ ] T031 [P] [US3] Contract test in `tests/contract/security/csrf.spec.ts` — CSRF skips safe methods (FR-006): `GET /api/v1.0/teachers` with no `X-CSRF-Token` returns `200` (or whatever the upstream 001 endpoint returns). `HEAD /api/v1.0/teachers` and `OPTIONS /api/v1.0/teachers` likewise bypass the check.
- [ ] T044 [P] [US3] Contract test in `tests/contract/security/csrf.spec.ts` — cross-origin `X-CSRF-Token` header preserved end-to-end (SC-012 second clause): with `CORS_ALLOWED_ORIGINS=http://allowed.example.com` and the user logged in, issue a cross-origin `POST /api/v1.0/teachers` from `Origin: http://allowed.example.com` with the preflight advertising `Access-Control-Request-Headers: content-type, x-csrf-token`, followed by the actual POST with `X-CSRF-Token` set to the value of the `csrfToken` cookie. Asserts: (1) the preflight response carries `Access-Control-Allow-Headers: Content-Type, X-CSRF-Token` (per FR-001a / T020), AND (2) the route handler sees the `X-CSRF-Token` header with the matching value (verified by the 201 success response, not a 403 csrf). Closes the second clause of SC-012 — "A cross-origin browser request that includes the `X-CSRF-Token` request header is NOT silently stripped by the browser before reaching the API" — with an automated CI assertion rather than a manual browser-dev-tools check. (The manual browser end-to-end verification remains documented in `quickstart.md` §2 SC-012; this contract test is the CI gate.)

**Checkpoint**: User Story 3 is fully functional and independently testable. The CSRF cookie is minted on login, cleared on logout, compared on every state-changing request, and the React UI in `001` + `002` sends the `X-CSRF-Token` header.

---

## Phase 6: User Story 4 — Layered XSS posture (Priority: P2)

**Goal**: The three XSS-defence layers (Joi input validation + React output encoding + CSP `script-src 'self'`) are present and verified. No sanitisation library (DOMPurify) is required because no rich-text fields exist in Stage 2.

**Independent Test**: Submit a teacher record whose name contains `<script>alert(1)</script>`. Persist the row via the existing 001 endpoint (the CSRF-protected POST returns `201`). GET the teacher list via the browser and observe the literal text rendered (no script execution). The browser dev-tools console reports the CSP violation as defense-in-depth (per SC-006).

### Tests for User Story 4

- [ ] T032 [P] [US4] Audit script in `tests/unit/security/xss-audit.spec.ts` — runs once and asserts no source file under `app/` uses `dangerouslySetInnerHTML`, `eval(`, `new Function(`, `setTimeout('...')`, or `setInterval('...')` (per spec FR-010). On any match, the test fails with the offending file path + line number. The test is documentation-as-code — the codebase simply does not use these sinks.
- [ ] T033 [P] [US4] Integration test in `tests/integration/security/xss.spec.ts` — stored XSS rendered as inert text (SC-006): create a teacher via `POST /api/v1.0/teachers` with `firstName: '<script>alert(1)</script>'` (and the required CSRF header); assert `201` + the literal payload persisted in the row; GET the teacher list via the browser and assert the rendered text contains `<script>alert(1)</script>` literally and the page does NOT execute the script. Browser dev-tools console will report the CSP violation as defense-in-depth.

**Checkpoint**: User Story 4 is fully verified. The audit script enforces the no-sink rule; the integration test demonstrates end-to-end XSS resistance.

---

## Phase 7: User Story 5 — Environment-driven configuration (Priority: P2)

**Goal**: An operator can change any of the five hardening `.env` keys by editing `.env.local`, restarting the app, and observing the new posture — no source change required. The application refuses to serve when a required key is missing (fail-closed per FR-013).

**Independent Test**: Change `CORS_ALLOWED_ORIGINS` from `http://allowed.example.com` to `http://other.example.com`, restart, issue a request from the new origin and observe `Access-Control-Allow-Origin: http://other.example.com`. Change `CSP_POLICY` to a custom value, restart, observe the new policy in the response header. Set `CORS_ALLOWED_ORIGINS=` (empty), restart, observe the startup warning and the 403 on any cross-origin request (per SC-001 + SC-009).

### Tests for User Story 5

- [ ] T034 [P] [US5] Integration test in `tests/integration/security/env-config.spec.ts` — `.env`-driven config change (SC-001): set `CORS_ALLOWED_ORIGINS=http://A.example.com`, start the app, issue a CORS request from `Origin: http://A.example.com` and observe success; stop the app, change the env var to `http://B.example.com`, restart, repeat the request from `http://A.example.com` and observe `403`; repeat from `http://B.example.com` and observe success. No source files were changed.
- [ ] T035 [P] [US5] Integration test in `tests/integration/security/env-config.spec.ts` — fail-closed on missing required key (SC-009): set `CORS_ALLOWED_ORIGINS=` (empty), start the app, observe the startup warning in the logs; issue a cross-origin request and observe `403` (no permissive fall-through, no wildcard).
- [ ] T036 [P] [US5] Audit assertion in `tests/integration/security/env-config.spec.ts` — `.env.example` completeness (SC-008): grep `.env.example` for the five key names (`CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_HEADERS`, `CSP_POLICY`, `CSP_REPORT_ONLY`, `HSTS_ENABLED`); assert each appears with a one-line comment explaining the default + format + non-obvious constraint. Asserts every hardening-related key is documented.

**Checkpoint**: User Story 5 is fully verified. An operator with no prior context can configure hardening by reading `.env.example` alone.

---

## Phase 8: User Story 6 — Local-dev HTTP posture (Priority: P3)

**Goal**: In `NODE_ENV=development`, the session cookie's `Secure` attribute is absent and the `Strict-Transport-Security` header is suppressed (the dev loop is unblocked). In `NODE_ENV=production` behind HTTPS, both are present.

**Independent Test**: Run with `NODE_ENV=development`; open browser dev-tools; observe the session cookie has no `Secure` attribute and no `Strict-Transport-Security` header on responses. Run with `NODE_ENV=production`; observe the session cookie carries `Secure` and responses carry `Strict-Transport-Security: max-age=63072000; includeSubDomains` (per SC-005 production clause).

### Tests for User Story 6

- [ ] T037 [P] [US6] Integration test in `tests/integration/security/dev-posture.spec.ts` — `NODE_ENV=development` relaxes Secure + HSTS: start with `NODE_ENV=development`, log in, assert the `Set-Cookie` response header does NOT include `Secure`; assert the response does NOT include `Strict-Transport-Security`.
- [ ] T038 [P] [US6] Integration test in `tests/integration/security/dev-posture.spec.ts` — `NODE_ENV=production` re-enables Secure + HSTS: start with `NODE_ENV=production` + `HSTS_ENABLED=true`, log in, assert the `Set-Cookie` response header INCLUDES `Secure`; assert the response INCLUDES `Strict-Transport-Security: max-age=63072000; includeSubDomains`.

**Checkpoint**: User Story 6 is fully verified. The dev experience is unblocked over HTTP; production posture is correct over HTTPS.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final cross-cutting work after all user stories are verified.

- [ ] T039 [P] Amend the four existing endpoint contracts to reference `contracts/security.yaml` for the shared security envelope:
  - `specs/001-teachers/contracts/teachers.yaml`
  - `specs/001-teachers/contracts/subjects.yaml`
  - `specs/002-classes/contracts/classes.yaml`
  - `specs/002-classes/contracts/levels.yaml`
  - `specs/004-user-auth/contracts/auth.yaml`
  Each gets a `$ref` to the shared security envelope at the operation level for headers (response) and the `X-CSRF-Token` parameter (request, on state-changing methods only).
- [ ] T040 Amend `README.md` — add a **Security Hardening** section that links to `specs/005-security-hardening/quickstart.md`, lists the five `.env` keys, and links to `contracts/security.yaml` for the shared security contract. Update the Stage 2 assumption block to reflect that 005 ships the four Principle IX controls.
- [ ] T041 Run `quickstart.md` validation end-to-end — every scenario in §2 of the quickstart must pass against a fresh `docker compose up` environment. Record the result in the PR description.
- [ ] T042 [P] Update `tasks.md` — close out completed tasks (set `[x]`); record any deferred items; add a "Done when" section that ticks off SC-001..SC-013 + TODO(FEATURE_005_FETCH_WRAPPER_TEST) + TODO(FEATURE_005_CSP_TEST_ROUNDTRIP) + TODO(FEATURE_005_LOG_SCRUB).
- [ ] T043 [P] Independence meta-test in `tests/unit/security/independence.spec.ts` — closes SC-010 ("All four hardening controls are independently testable. Removing or disabling one does not silently disable the others"). The test performs a static-grep assertion on `lib/security/*.ts` (excluding the `index.ts` barrel): no module imports from any of the other control modules. Specifically: `cors.ts` does not import from `csrf.ts`, `csrf-client.ts`, or `headers.ts`; `csrf.ts` does not import from `cors.ts`, `csrf-client.ts`, or `headers.ts`; `headers.ts` does not import from `cors.ts`, `csrf.ts`, or `csrf-client.ts`; `csrf-client.ts` does not import from `cors.ts`, `csrf.ts`, or `headers.ts`. The only cross-module consumer is the `middleware.ts` orchestrator (which composes all four). The test fails on any cross-import with the offending module + line. The test is documentation-as-code — it locks in the per-control test independence that SC-010 demands, so removing or disabling one control module cannot silently break another. (No network, no DB, no Next.js server — pure static-grep unit test.)

**Checkpoint**: All success criteria and constitutional requirements verified. Feature is deliverable.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. **BLOCKS all user stories.**
- **Phases 3..8 (User Stories)**: All depend on Phase 2.
  - User stories can proceed sequentially in priority order (P1 → P1 → P1 → P2 → P2 → P3).
  - User stories can also proceed in parallel by different contributors after Phase 2 — they are independent.
- **Phase 9 (Polish)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (CORS, P1)**: Can start after Phase 2 — no dependencies on other stories.
- **US2 (CSP, P1)**: Can start after Phase 2 — independent of US1 / US3 (different wire-up points).
- **US3 (CSRF, P1)**: Can start after Phase 2 — depends on the 004 amendment (`SessionRecord.csrfToken` field, `setCsrfCookie` / `clearCsrfCookie`) which is in Phase 2. The login / logout handler amendments are US3's own work.
- **US4 (XSS, P2)**: Can start after Phase 2 — independent verification (the audit script reads code, the integration test exercises the existing 001 endpoint).
- **US5 (env config, P2)**: Can start after Phase 2 — independent verification (the integration tests restart the app with different env vars).
- **US6 (dev posture, P3)**: Can start after Phase 2 — independent verification.

### Within Each Phase

- Unit tests for the helpers (Phase 2 — T015..T019) MUST be written **first** and **fail** before the corresponding implementation runs (TDD order — though the helpers themselves are in T002..T006 which run before the tests; flip the order if the project prefers strict test-first).
- Phase 5 (US3) implementation (T025..T028) MUST run before the Phase 5 tests (T029..T031) — the tests need the login / logout handlers to mint / clear the cookie.
- Contract tests in each US phase run **after** the implementation they verify.

### Parallel Opportunities

- All Phase 2 helper-implementation tasks marked `[P]` (T002..T006, T009..T012) can run in parallel.
- All Phase 2 unit-test tasks marked `[P]` (T015..T019) can run in parallel.
- All cross-feature amendment tasks (T027 + T028 in US3) can run in parallel — they touch different files.
- All contract tests within a single US phase marked `[P]` can run in parallel.
- Different user stories (after Phase 2) can be worked on by different contributors in parallel.
- All Phase 9 polish tasks marked `[P]` (T039 + T042) can run in parallel.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch the six helper-implementation tasks in parallel:
Task: "T002 Implement lib/security/headers.ts"
Task: "T003 Implement lib/security/log.ts"
Task: "T004 Implement lib/security/csrf.ts"
Task: "T005 Implement lib/security/cors.ts"
Task: "T006 Implement lib/security/csrf-client.ts"

# Launch the two 004-amendment tasks in parallel:
Task: "T009 Amend lib/auth/session.ts (SessionRecord.csrfToken)"
Task: "T010 Amend lib/auth/cookie.ts (setCsrfCookie + clearCsrfCookie)"

# Launch the five unit-test tasks in parallel (after the helpers land):
Task: "T015 tests/unit/security/headers.spec.ts"
Task: "T016 tests/unit/security/log.spec.ts"
Task: "T017 tests/unit/security/csrf.ts"
Task: "T018 tests/unit/security/cors.spec.ts"
Task: "T019 tests/unit/security/csrf-client.spec.ts"
```

---

## Parallel Example: Phase 3 (US1 — CORS) + Phase 4 (US2 — CSP) in parallel

```bash
# After Phase 2 checkpoint passes, US1 and US2 can run in parallel:
Task: "T020 [US1] Contract test — CORS preflight from allowed origin"
Task: "T021 [US1] Contract test — CORS rejection from disallowed origin"
Task: "T022 [US1] Contract test — Origin: null rejected"
Task: "T023 [US2] Contract test — CSP header present on every response"
Task: "T024 [US2] Contract test — CSP_REPORT_ONLY switches header name"
```

---

## Implementation Strategy

### MVP First (Phases 1 + 2 + 3)

1. Complete Phase 1: Setup (`.env.example` keys).
2. Complete Phase 2: Foundational (every helper + middleware + next.config.mjs + 004 amendments).
3. Complete Phase 3: User Story 1 (CORS verification).
4. **STOP and VALIDATE**: the CORS control is end-to-end working.
5. The MVP is the smallest delivery that demonstrates the four Principle IX controls are wired (CSP and HSTS land via `next.config.mjs` in Phase 2; CSRF middleware is also wired but the React fetch wrappers are still pending the US3 amendments; CORS is the first user-observable behaviour).

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready (all four controls wired; no end-to-end verification yet).
2. Phase 3 (US1 — CORS) → Test independently → Demo (MVP!).
3. Phase 4 (US2 — CSP) → Test independently → Demo.
4. Phase 5 (US3 — CSRF) → Test independently → Demo (requires the 004 + 001 + 002 amendments in this phase).
5. Phase 6 (US4 — XSS) → Test independently → Demo.
6. Phase 7 (US5 — env config) → Test independently → Demo.
7. Phase 8 (US6 — dev posture) → Test independently → Demo.
8. Phase 9 (Polish) → Final cross-cutting concerns.

Each phase adds value without breaking previous phases.

### Parallel Team Strategy

With multiple developers:

1. Team completes Phase 1 + Phase 2 together (the foundation is blocking).
2. Once Phase 2 is done:
   - Developer A: Phase 3 (US1 — CORS)
   - Developer B: Phase 4 (US2 — CSP)
   - Developer C: Phase 5 (US3 — CSRF; the largest phase)
3. After US1 / US2 / US3:
   - Developer A or D: Phase 6 (US4 — XSS)
   - Developer B or D: Phase 7 (US5 — env config)
   - Developer C or D: Phase 8 (US6 — dev posture)
4. Team completes Phase 9 (Polish) together.

---

## Notes

- `[P]` tasks = different files, no dependencies.
- `[Story]` label maps task to the user story for traceability (`[US1]`..`[US6]`).
- Each user story is independently completable and testable after Phase 2 lands.
- Commit after each task or logical group (e.g., after each helper + its unit test).
- Stop at each phase checkpoint to validate the story independently.
- The four Principle IX controls are wired in **Phase 2** — Phases 3..8 are **verification + acceptance**, not additional implementation. This is unusual for the Spec Kit template but matches the feature's nature (one wire-up, four user-observable outcomes).
- The three new `TODO`s introduced by the plan (`FETCH_WRAPPER_TEST`, `CSP_TEST_ROUNDTRIP`, `LOG_SCRUB`) are covered by T019, T015, and T016 respectively — close them when those tests pass.
- Constitution Principle III (Unit Tests Required) is satisfied: every helper in `lib/security/*` has a unit test; every user story has at least one contract or integration test.
- The constitution's security-sensitive-feature manual review (per Governance → Compliance review) is mapped to the Phase 2 Constitution Check + the Phase 3..8 acceptance scenarios; the four hardening controls are explicitly verified in those phases.
