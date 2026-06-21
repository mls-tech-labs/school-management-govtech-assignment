# Implementation Plan: Security Hardening (005-security-hardening)

**Branch**: `005-security-hardening` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-security-hardening/spec.md`

## Summary

Ship the **four Principle IX hardening controls** — CORS
allow-list, CSP header, double-submit CSRF token, layered XSS
posture — that gate every cross-origin browser request and
every state-changing API call, making the application
OWASP-baseline-secure.

This feature:

1. **Introduces the `middleware.ts` layer** at the repo
   root. The middleware runs on every `/api/:path*` request
   before the route handler and enforces two pre-handler
   controls: CORS (allow-list + preflight response) and
   CSRF (double-submit cookie + exempt list). The auth
   middleware from `004-user-auth` continues to run **inside**
   the route handler via `withAuth(handler)` — the layering
   is `middleware.ts (CORS) → middleware.ts (CSRF) →
   withAuth (auth) → route handler`, with each layer the
   single source of truth for its concern.
2. **Introduces the `lib/security/*` helper modules** —
   `cors.ts`, `csrf.ts`, `csrf-client.ts`, `headers.ts`,
   `log.ts`. Every helper is a pure function (or a thin
   side-effecting wrapper around `console.log`) and is
   covered by unit tests per FR-015 + SC-007.
3. **Updates `next.config.mjs`** to add the four static
   per-response headers (`Content-Security-Policy`,
   `X-Content-Type-Options`, `Referrer-Policy`,
   `Strict-Transport-Security`) via Next.js's
   `headers()` function. The CSP value is computed by
   `lib/security/headers.ts → buildCspHeader()` so the
   builder is unit-testable.
4. **Updates the React `fetch` wrapper** in
   `001-teachers` and `002-classes` (and any future
   state-changing feature) to populate `X-CSRF-Token`
   from the non-`HttpOnly` `csrfToken` cookie via
   `lib/security/csrf-client.ts → getCsrfToken()`. The
   helper is the **only** call site that reads
   `document.cookie` for CSRF purposes (per
   Clarifications Q5 / FR-019a).
5. **Amends 004's session record** to carry the CSRF
   token. The CSRF token is minted on successful login
   alongside the session, stored in the same Redis
   `SessionRecord`, rotated with the session, and cleared
   on logout (alongside the session cookie). The CSRF
   cookie and the session cookie share the same
   `Secure` env-driven flag.

The feature does **NOT** ship any new persisted entities
(per FR-016 — the CSRF token lives in the existing
session record) and does **NOT** ship any new endpoints
(per FR-017 — the CSP report-only mode is a header-only
toggle per Clarifications Q6; there is no
`/api/v1.0/csp-report` collector). The data-model.md is
a single paragraph; the contracts/ directory ships a
single shared security contract that documents the
per-response headers, the request-side CSRF requirement,
and the new error discriminators (`cors`, `csrf`).

The plan inherits the stack, the `next.config.mjs`
base, the `lib/config.ts` env-loader, the `lib/api/*`
contract wrapper, the `lib/db/*` typeORM stack, and the
Vitest unit/contract/integration test tiers from
[`001-teachers/plan.md`](../001-teachers/plan.md),
[`002-classes/plan.md`](../002-classes/plan.md),
[`003-backend-api-db/plan.md`](../003-backend-api-db/plan.md),
and [`004-user-auth/plan.md`](../004-user-auth/plan.md).
This feature introduces **zero new runtime dependencies**
and **zero new devDependencies** — every helper is
hand-rolled (see research §1 for the alternatives
rejection list).

---

## Technical Context

**Language/Version**: TypeScript 5.x with `strict: true`
(per Constitution Principle II). No `.js` source files.
The new `lib/security/*` modules are pure-function `.ts`
modules; the React-side helper
`lib/security/csrf-client.ts` is a single `.ts` module
with an SSR-safe `typeof document === 'undefined'`
guard; the `middleware.ts` at the repo root is a
Next.js 15 middleware `.ts` module.

**Runtime**: Node.js LTS via the **same single Next.js 15
application** as `001-teachers`, `002-classes`,
`003-backend-api-db`, and `004-user-auth`. The 005 code
lives in:

- `middleware.ts` (repo root, Next.js middleware) — the
  CORS + CSRF pre-handler layer.
- `lib/security/*` — the helper modules.
- `next.config.mjs` — adds the four static headers.
- The 004 amendment (one new field on
  `SessionRecord`, one new cookie helper, the login /
  logout handler updates) is documented in
  [research §9](./research.md#9-backwards-compatibility-surface-for-001--002--004).

**Primary Dependencies**: same as
[`004-user-auth/plan.md` Primary Dependencies](../004-user-auth/plan.md#technical-context)
(Next.js 15, React 19, typeORM, MySQL driver, Joi,
Vitest, Ant Design, Tailwind CSS, PostCSS, autoprefixer,
ulid, argon2, ioredis, ioredis-mock). **No new packages
are introduced** — the five hardening helpers are
hand-rolled to avoid adding `cors`, `csurf`, or
`js-cookie` for a few lines of code each (see
[research §1](./research.md#1-where-each-control-is-wired)).

**Storage**:

- **MySQL 8** (user-prepared Docker container) —
  **unchanged**. Spec FR-016 pins "no new tables"; the
  CSRF token is stored alongside the session record in
  Redis (owned by 004).
- **Redis 7** (user-managed Docker container, already
  added by 004) — the `SessionRecord` value gains one
  field: `csrfToken: string`. The TTL is unchanged
  (hard 30 minutes). See [research §3](./research.md#3-csrf-token-crypto-source-and-storage-resolves-spec-fr-007-fr-019a).

**Testing**: Vitest (inherited from `001-teachers`). Two
tiers per [research §8](./research.md#8-helpers-inventory-and-unit-test-map):

| Tier | Path | Coverage |
|---|---|---|
| **Unit** | `tests/unit/security/*.spec.ts` | Every helper in `lib/security/*` — pure-function tests for `cors.ts`, `csrf.ts`, `headers.ts`; stdout-spy tests for `log.ts`; JSDOM-stub test for `csrf-client.ts` |
| **Contract** | `tests/contract/security.spec.ts` | Full request lifecycle against a test Next.js server: preflight handling, CSRF mismatch, exempt-list bypass, static headers present, companion headers present, HSTS conditional on `NODE_ENV` |
| **Integration** | `tests/integration/security.spec.ts` | Real Next.js + real Redis containers; SC-001..SC-013 end-to-end, including the manual browser dev-tools checks for SC-002 / SC-005 / SC-006 / SC-012 |

**Target Platform**: same as `001-teachers` — Docker
Desktop, Linux / macOS / Windows host, Docker Compose v2.
No new container, no new service, no new runtime.

**Project Type**: same as `001-teachers` / `002-classes` /
`003-backend-api-db` / `004-user-auth` — single Next.js
web application. 005 adds the `middleware.ts` at the repo
root, the `lib/security/*` directory, the `next.config.mjs`
amendment, the `.env.example` amendment, and the React
`fetch` wrapper amendment. No new project, no new process,
no new container runtime.

**Performance Goals**:

- The CORS middleware adds **one `Set` membership check
  per request** for the request's `Origin` header
  (~tens of nanoseconds). On a preflight, it adds the
  preflight response itself (`204 No Content` with the
  four `Access-Control-*` headers).
- The CSRF middleware adds **two cookie / header reads
  per state-changing request** + **one
  `crypto.timingSafeEqual` call** for the comparison
  (~hundreds of nanoseconds for tokens of the chosen
  length). Safe-method and exempt-list requests skip
  the comparison entirely.
- No new API-level latency target is added in Stage 2.
  The auth-feature SC-001 form-time budget
  (≤ 10 s from page load to logged-in state) is
  unchanged; the four controls add less than 1 ms
  total on a typical request.

**Constraints**:

- All `001-teachers`, `002-classes`,
  `003-backend-api-db`, and `004-user-auth` constraints
  apply (TS strict, no class-based code outside typeORM
  entities, Joi mirroring, etc.).
- The cross-cutting contract is **non-negotiable**: every
  `4xx` / `5xx` response uses `{ "error": "..." }`
  (this feature adds two new discriminators: `cors`,
  `csrf`); every status code is in the cross-cutting
  table; every endpoint uses the `/api/v1.0/` version
  prefix.
- The CORS middleware and the CSRF middleware have
  **no escape-hatch toggle** (per FR-022 + Clarifications
  Q2). Removing the toggle removes the foot-gun.
- The shipped CSP forbids `'unsafe-inline'` in
  `script-src` (per FR-004). The only relaxation is
  `style-src 'self' 'unsafe-inline'`, documented in the
  constitution Principle IX §2 as the Ant Design /
  Tailwind JIT exception.
- The shipped CSP MUST NOT include any `report-uri` /
  `report-to` directive (per Clarifications Q6 /
  FR-003 amendment). Violations under
  `CSP_REPORT_ONLY=true` are observed in the browser
  dev-tools console, not server-side.
- The CSRF token is bound to the session. A state-changing
  request without a session is rejected by the auth
  middleware (004) **before** the CSRF middleware runs
  (auth is the inner layer; CSRF is the outer layer that
  only fires when a session is present). See
  [research §4](./research.md#4-csrf-middleware-resolves-spec-fr-006-fr-008).
- The `Secure` cookie flag is environment-driven per
  Principle IV (inherited from 004 + research §5).
  The `HSTS_ENABLED` flag follows the same pattern.
- Local dev HTTP posture (`NODE_ENV=development`):
  the session cookie's `Secure` flag and the HSTS
  header are relaxed. Documented in `.env.example`.

**Scale/Scope**:

- 1 application process (Next.js, same as Stage 1) +
  1 MySQL container (same as Stage 1) + 1 Redis
  container (added by 004). **No new containers.**
- 0 new DB tables (FR-016).
- 0 new API endpoints (FR-017).
- 0 new runtime dependencies; 0 new devDependencies.
- 5 new `lib/security/*` modules + 1 `middleware.ts`
  + the `next.config.mjs` amendment + the
  `.env.example` amendment + the React fetch-wrapper
  amendment in `001-teachers` and `002-classes`.
- 5 new `.env` keys:
  `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_HEADERS`,
  `CSP_POLICY`, `CSP_REPORT_ONLY`, `HSTS_ENABLED`.
- 5 new test files (1 per `lib/security/*` module) +
  1 contract test + 1 integration test.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after
Phase 1 design (re-evaluation in [§"Re-evaluation"](#re-evaluation-constitution-check-post-design)
below).*

| Principle | Status | Notes |
|---|---|---|
| I. Spec-Driven Development | ✅ Pass | Plan is generated by `/speckit-plan` after `/speckit-specify` + 3 clarification rounds in this session (Q4 CORS preflight allowed-headers, Q5 CSRF client-side acquisition, Q6 CSP report-only posture) and the prior session's Q1..Q3 (logging, `.env` knob surface, default value of `CORS_ALLOWED_ORIGINS`). Tasks will be generated by `/speckit-tasks`; no source code is written before this plan is approved. |
| II. TypeScript End-to-End (`strict: true`) | ✅ Pass | Same single `tsconfig.json` as `001-teachers` covers the whole app. The new `lib/security/*.ts` modules and `middleware.ts` are pure-function `.ts` modules; the test suites are `.spec.ts`. No `.js` source files. |
| III. Unit Tests Required | ✅ Pass | Same Vitest setup as `001..004`. Every helper in `lib/security/*` is covered by at least one unit test covering the happy path and one covering each rejection path (per FR-015 + SC-007). The full inventory is in [research §8](./research.md#8-helpers-inventory-and-unit-test-map). The contract tier covers the full preflight / state-changing / safe-method / exempt-list lifecycle; the integration tier covers SC-001..SC-013 end-to-end. |
| IV. Single Role: Authenticated Administrator | ✅ Pass | This feature composes **on top of** 004's auth boundary. The CSRF middleware is the outer layer (runs before `withAuth`); the auth middleware is the inner layer (runs in the route handler). A state-changing request without a session is rejected with `401` by 004's auth middleware before the CSRF check fires (per Edge Cases). No new role is introduced. |
| V. Simplicity (YAGNI) | ✅ Pass | Zero new npm dependencies — every helper is hand-rolled (research §1 alternatives rejection). Zero new endpoints (FR-017). Zero new entities (FR-016). The middleware layer is a thin shell that delegates to small, single-purpose helpers (`cors.ts`, `csrf.ts`, `headers.ts`, `log.ts`). The CSRF-client helper is a 5-line regex over `document.cookie`. MFA / OAuth / password-reset / sign-up / lockout / rate-limiting / COOP-CORP-COEP / DOMPurify are all explicitly deferred (per constitution Stage Scope → Stage 2 Out of Scope; documented in [research §11](./research.md#11-things-explicitly-not-in-this-feature-out-of-scope-guards)). |
| VI. Functional-First (Classes Only When Necessary) | ✅ Pass | All new `lib/security/*` modules are pure functions: `matchOrigin`, `buildCorsHeaders`, `mintCsrfToken`, `compareCsrfTokens`, `buildCspHeader`, `buildCompanionHeaders`, `logCorsRejection`, `logCsrfRejection`, `getCsrfToken`. No class-based service layers, controllers, or repositories. The `middleware.ts` exports a Next.js middleware function (Next.js's required shape), not a class. The React fetch-wrapper amendment is a function-component change, not a class change. |
| VII. Joi Schema Validation | ✅ Pass | No new request body / query / path validation is needed — every input that crosses a trust boundary is already Joi-validated by the existing route handlers (per Principle VII + the constitution's reaffirmation in spec FR-009). The five `.env` keys are parsed by the existing `lib/config.ts` string / boolean helpers (research §10). |
| VIII. UI Quality — Self-Explanatory, Reusable, Simple | ✅ Pass | The CSRF-client helper (`lib/security/csrf-client.ts → getCsrfToken()`) is a single function with a single return type (`string \| null`). The fetch-wrapper amendment is a one-line call (`headers: { 'X-CSRF-Token': getCsrfToken() ?? '' }`). No feature-specific hard-coding; the helper is shared by every state-changing fetch in `001-teachers` and `002-classes`. |
| IX. Security & Hardening | ✅ Pass | This feature IS the implementation of Principle IX. All four controls are present and configured per Principle IX §1..§4 (see "Security-sensitive feature manual review" table below). |

**Stage Scope compliance** (per Constitution → Stage Scope):

- ✅ In scope (Stage 2): CORS hardening, CSP hardening,
  CSRF protection, XSS prevention. Per the constitution
  Stage Scope → Stage 2 In Scope block, this feature is
  the entirety of those four blocks.
- ✅ In scope (Stage 2, owned by 004): the authentication
  feature. This feature amends 004's `SessionRecord` to
  carry the CSRF token (additive only — no behavioural
  change to 004's surface) and amends the login / logout
  handlers to mint / clear the CSRF cookie. The
  constitution Stage Scope authorises the cross-feature
  amendment.
- ✅ Out of scope (Stage 2): MFA / 2FA, OAuth / OIDC /
  SSO, password reset, self-registration, admin
  authoring of `users`, account lockout, rate limiting
  beyond Joi, audit logging beyond existing columns, FK
  migration of `created_by` / `modified_by`, COOP / CORP
  / COEP. All of these are documented as deferred (per
  Principle V + [research §11](./research.md#11-things-explicitly-not-in-this-feature-out-of-scope-guards))
  and this feature does **not** introduce any of them.
- ✅ No migrations: per FR-016, the schema is unchanged.
  The application does not run any typeORM migration on
  boot. The CSRF token lives in Redis alongside the
  session.

**Security-sensitive feature manual review** (per
Constitution → Governance → Compliance review: "for
security-sensitive features (any feature that touches
Principle IV or Principle IX), explicitly verify the
four hardening controls (CORS allow-list, CSP header,
CSRF token middleware, XSS posture) are present and
configured per Principle IX"):

| Control | Status in 005 | Notes |
|---|---|---|
| CORS allow-list | ✅ Pass | `lib/security/cors.ts → matchOrigin` enforces exact match on the lowercased origin against the lowercased, trimmed `CORS_ALLOWED_ORIGINS` set. `middleware.ts` runs the check on every `/api/:path*` request. Wildcard `*` is rejected by the matcher when `Access-Control-Allow-Credentials: true` is set (FR-002). Preflight requests without an `Origin` are rejected `403`. Per spec FR-001a, the preflight response's `Access-Control-Allow-Headers` enumerates `Content-Type, X-CSRF-Token` (Clarifications Q4 / SC-012). |
| CSP header | ✅ Pass | `next.config.mjs → headers()` emits `Content-Security-Policy` on every response with the shipped restrictive policy from FR-003. `lib/security/headers.ts → buildCspHeader()` builds the header (unit-testable). `script-src 'self'` — no `'unsafe-inline'` in production. `style-src 'self' 'unsafe-inline'` is the documented Ant Design / Tailwind JIT relaxation per the constitution Principle IX §2. No `report-uri` / `report-to` directive is emitted (Clarifications Q6). `CSP_REPORT_ONLY=true` flips the header name (FR-004 / SC-011 amendment). |
| CSRF token middleware | ✅ Pass | `lib/security/csrf.ts → mintCsrfToken + compareCsrfToken` use the same crypto source as 004's session token (`crypto.randomBytes(32).toString('base64url')` — 256 bits). The token is stored in the `SessionRecord` (no new table — FR-016). `middleware.ts` runs the double-submit check on every state-changing `/api/:path*` request with the explicit exempt list (FR-008). The compare is constant-time (`crypto.timingSafeEqual`). The React fetch wrapper reads the token via `lib/security/csrf-client.ts → getCsrfToken()` (Clarifications Q5 / FR-019a / SC-013). |
| XSS posture | ✅ Pass (all three layers) | Input: Joi validation at the trust boundary (Principle VII + spec FR-009 — already in place, this feature reaffirms). Output: React's default output encoding — no `dangerouslySetInnerHTML`, no `eval`, no `Function(...)` (spec FR-010). CSP: `script-src 'self'` blocks injected inline scripts as defense-in-depth (spec FR-011 / SC-006). No DOMPurify / sanitisation library is introduced (no rich-text fields in Stage 2 per the constitution Principle IX §4). |

**Constitution TODO items status**:

- All `TODO(FEATURE_001)` items remain resolved in the
  `001-teachers` plan.
- All `TODO(FEATURE_004)` items remain resolved in the
  `004-user-auth` plan.
- `TODO(ANTD_TAILWIND_VERSION)`: the 001 plan pinned
  the `antd`, `tailwindcss`, `postcss`, `autoprefixer`
  versions in `package.json`. No change from 005.
- `TODO(JOI_ALIGNMENT)`: no new entity is introduced
  (FR-016); no new Joi schema is needed. The existing
  Joi schemas (inherited from 001 / 002 / 004) are
  unchanged.
- `TODO(FUNCTIONAL_REVIEW)`: all new code is
  pure-function modules + a Next.js middleware
  function. No class-based service layers, controllers,
  or repositories introduced. No new typeORM entity.
- `TODO(PROFILE_PAGE_OUT_OF_SCOPE)`: confirmed — no
  profile / change-password page. The CSRF cookie is
  set by 004's login handler and cleared by 004's
  logout handler; no new UI is introduced.
- `TODO(RATE_LIMITING_OUT_OF_SCOPE)`: confirmed — no
  per-IP / per-origin rate limiting. The CORS middleware
  rejects disallowed origins; the CSRF middleware
  rejects token mismatches; both are rate-limit-equivalent
  at the application boundary but do not implement a
  sliding-window throttle.
- `TODO(CRP_INTERPRETATION)`: confirmed — this feature
  ships CSP (not COOP / CORP / COEP). The remaining
  three headers are documented as a future amendment in
  the constitution's Sync Impact Report.
- `TODO(LOCAL_DEV_HTTP_POSTURE)`: confirmed — the
  `Secure` cookie flag and the HSTS header are
  environment-driven. `HSTS_ENABLED` defaults to `true`
  in `NODE_ENV=production` and `false` in
  `NODE_ENV=development`. The CSRF cookie shares the
  same `Secure` env-var as the session cookie (per
  research §3 + 004's research §5).
- New TODO introduced by this plan:
  `TODO(FEATURE_005_FETCH_WRAPPER_TEST)` — write a
  JSDOM-based unit test that asserts the React fetch
  wrapper sets `X-CSRF-Token` to the value returned by
  `getCsrfToken()` when the `csrfToken` cookie is
  present, and omits the header when the cookie is
  absent (per SC-013). Tracked in `tasks.md`.
- New TODO introduced by this plan:
  `TODO(FEATURE_005_CSP_TEST_ROUNDTRIP)` — write a unit
  test that asserts `buildCspHeader(policy, false)`
  emits `Content-Security-Policy: <policy>` (not
  `Report-Only`), and `buildCspHeader(policy, true)`
  emits `Content-Security-Policy-Report-Only: <policy>`
  (per FR-004 + SC-011 amendment). Tracked in
  `tasks.md`.
- New TODO introduced by this plan:
  `TODO(FEATURE_005_LOG_SCRUB)` — write a
  `log-scrub.spec.ts` unit test that asserts no
  structured security-event log entry contains the
  session cookie value, the CSRF token value, the
  request body, the response body, or the
  `Authorization` header (per spec FR-021 + SC-011).
  Tracked in `tasks.md`.

**No violations.** No entries required in
**Complexity Tracking**.

---

## Project Structure

### Documentation (this feature)

```text
specs/005-security-hardening/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — resolves every NEEDS CLARIFICATION
├── data-model.md        # Phase 1 output — minimal (FR-016: no new entities)
├── quickstart.md        # Phase 1 output — runnable validation scenarios for SC-001..SC-013
├── contracts/
│   └── security.yaml    # Phase 1 output — the shared security contract (headers, CSRF, error discriminators)
├── checklists/
│   └── requirements.md  # pre-existing — quality checklist (13/13)
└── spec.md              # pre-existing (clarifications updated)
```

### Source Code (repository root)

The 005 feature extends the same Next.js codebase as
`001-teachers`, `002-classes`, `003-backend-api-db`, and
`004-user-auth`. New files are marked `(+)`; pre-existing
files are unmarked for clarity. The 005 layer is
**purely additive at the framework boundary** — no
pre-existing module is rewritten.

```text
middleware.ts                                                 # (+) NEW — Next.js middleware (CORS + CSRF for /api/:path*)
                                                            # Composes: cors() → csrf() → next()
                                                            # Sits OUTSIDE the route handler; withAuth() (004)
                                                            # sits INSIDE the route handler.

next.config.mjs                                               # (amended) +headers() function emitting CSP,
                                                            #   X-Content-Type-Options, Referrer-Policy,
                                                            #   Strict-Transport-Security (production only).
                                                            #   CSP value is computed by lib/security/headers.ts.

lib/
├── security/                                                # (+) NEW directory — the hardening helpers
│   ├── cors.ts                                              # (+) matchOrigin, buildCorsHeaders, corsMiddleware factory
│   ├── csrf.ts                                              # (+) mintCsrfToken, compareCsrfTokens, csrfMiddleware factory
│   ├── csrf-client.ts                                       # (+) getCsrfToken (React-side; reads document.cookie)
│   ├── headers.ts                                           # (+) buildCspHeader, buildCompanionHeaders
│   ├── log.ts                                               # (+) logCorsRejection, logCsrfRejection
│   └── index.ts                                             # (+) barrel export
├── api/                                                     # (pre-existing from 001 / 003)
├── auth/                                                    # (pre-existing from 004; amended — see research §9)
│   ├── session.ts                                           # (amended) +csrfToken field on SessionRecord
│   ├── cookie.ts                                            # (amended) +setCsrfCookie, +clearCsrfCookie helpers
│   ├── middleware.ts                                        # (unchanged) withAuth — the inner auth layer
│   └── (pre-existing 004 modules — unchanged)
├── db/                                                      # (pre-existing)
├── ulid.ts                                                  # (pre-existing)
├── validation/                                              # (pre-existing)
└── config.ts                                                # (amended) +5 new keys (research §10)

app/
├── api/v1.0/                                                # (pre-existing from 001 / 002 / 003 / 004)
│   ├── login/route.ts                                       # (amended — 004) +mintCsrfToken, +setCsrfCookie after successful argon2id verify
│   ├── logout/route.ts                                      # (amended — 004) +clearCsrfCookie alongside clearSessionCookie
│   └── (pre-existing 001 / 002 / 003 / 004 routes — unchanged)
├── teachers/                                                # (pre-existing from 001; amended — fetch wrapper sends X-CSRF-Token)
├── classes/                                                 # (pre-existing from 002; amended — fetch wrapper sends X-CSRF-Token)
├── login/                                                   # (pre-existing from 004; unchanged — login is CSRF-exempt)
├── (private)/layout.tsx                                     # (pre-existing from 004; unchanged)
├── layout.tsx                                               # (pre-existing)
└── page.tsx                                                 # (pre-existing)

scripts/                                                     # (pre-existing from 004; unchanged)
tests/
├── unit/
│   ├── security/                                            # (+) NEW
│   │   ├── cors.spec.ts                                     # (+) matchOrigin + buildCorsHeaders + preflight
│   │   ├── csrf.spec.ts                                     # (+) mintCsrfToken + compareCsrfTokens + exempt-list bypass
│   │   ├── csrf-client.spec.ts                              # (+) getCsrfToken (JSDOM-stub)
│   │   ├── headers.spec.ts                                  # (+) buildCspHeader + buildCompanionHeaders (CSP_TEST_ROUNDTRIP TODO)
│   │   └── log.spec.ts                                      # (+) LOG_SCRUB TODO — never-leak-secrets spec
│   └── (pre-existing from 001 / 002 / 003 / 004 — unchanged)
├── contract/
│   ├── security.spec.ts                                     # (+) preflight + state-changing + safe-method + exempt-list + static-headers + HSTS-conditional
│   └── (pre-existing — unchanged)
└── integration/
    ├── security.spec.ts                                     # (+) SC-001..SC-013 end-to-end (real Next.js + real Redis)
    └── (pre-existing — unchanged)

.env.example                                                 # (amended) +CORS_ALLOWED_ORIGINS +CORS_ALLOWED_HEADERS +CSP_POLICY
                                                            #   +CSP_REPORT_ONLY +HSTS_ENABLED — each with a one-line comment
.env.local                                                   # (pre-existing, gitignored; operator-populated)
.env                                                         # (pre-existing, JSON, model config only — no change)
docker/                                                      # (pre-existing from 001 / 004; unchanged — no new services)
package.json                                                 # (unchanged — zero new deps)
tsconfig.json                                                # (pre-existing, strict: true)
vitest.config.ts                                             # (pre-existing)
README.md                                                    # (amended) +security-quickstart section + new env vars
```

**Structure Decision**: the four controls are split
across exactly **two Next.js wire-up points** (the
framework-level `headers()` function in
`next.config.mjs` for static headers, and the
request-level `middleware.ts` for dynamic CORS / CSRF)
and **one helper directory** (`lib/security/`). No
file in `app/` needs to be touched for the security
middleware itself — the existing route handlers
continue to use `withAuth(handler)` from 004, and the
CSRF check runs in `middleware.ts` **before** the
route handler runs. The React fetch-wrapper amendment
in `app/teachers/` and `app/classes/` is the **only**
UI-side change.

---

## Cross-feature updates

Per spec FR-019 and FR-019a, the React UI in
`001-teachers` and `002-classes` MUST send the
`X-CSRF-Token` header on every state-changing call.
The list of files to edit is enumerated below; each
edit is a one-line change (read the token, set the
header) inside the existing `fetch` wrapper.

| File (pre-existing) | Change |
|---|---|
| `app/teachers/*/components/*.tsx` (the fetch wrapper used by the create-teacher form) | Add `'X-CSRF-Token': getCsrfToken() ?? ''` to the `fetch` options for `POST`. |
| `app/classes/*/components/*.tsx` (the fetch wrapper used by the create-class form) | Same. |

The CSRF-exempt endpoints (`POST /api/v1.0/login`,
`POST /api/v1.0/logout`, `GET /api/v1.0/me`) are NOT
amended — they are exempt per FR-008 and the server
does not require the header.

The 004 amendment is documented in
[research §9](./research.md#9-backwards-compatibility-surface-for-001--002--004)
and is purely additive (one new field on
`SessionRecord`, one new cookie helper, the login /
logout handler updates).

---

## Complexity Tracking

> **No Constitution Check violations.** The deferred
> hardening-adjacent features (MFA, OAuth, password
> reset, self-registration, account lockout, rate
> limiting beyond Joi, audit logging beyond the
> existing columns, FK migration of `created_by` /
> `modified_by`, COOP / CORP / COEP, DOMPurify) are
> all documented as out-of-scope per the constitution
> Stage Scope → Stage 2 Out of Scope block and
> [research §11](./research.md#11-things-explicitly-not-in-this-feature-out-of-scope-guards).
>
> The four new TODOs (`FETCH_WRAPPER_TEST`,
> `CSP_TEST_ROUNDTRIP`, `LOG_SCRUB`) are tracked in
> `tasks.md`.

---

## Re-evaluation: Constitution Check post-design

*After Phase 1 design ([research.md](./research.md),
[data-model.md](./data-model.md),
[contracts/security.yaml](./contracts/security.yaml),
[quickstart.md](./quickstart.md)) — re-checking the
gates above.*

| Principle | Status | Re-evaluation notes |
|---|---|---|
| I. Spec-Driven Development | ✅ Pass | The plan.md is complete; research.md resolves every implementation-level question from the spec (including the three added by the Clarifications session — Q4 / Q5 / Q6); data-model.md, contracts/security.yaml, and quickstart.md are written. No source code has been written yet — that is `/speckit-tasks` + `/speckit-implement` work. |
| II. TypeScript End-to-End | ✅ Pass | All new modules specified as `.ts`; `middleware.ts` is a Next.js 15 middleware function; the test suites are `.spec.ts`. No `.js` source files. |
| III. Unit Tests Required | ✅ Pass | The unit tier is enumerated in [research §8](./research.md#8-helpers-inventory-and-unit-test-map); the contract tier is in the `Project Structure` section above; the integration tier covers SC-001..SC-013 in `tests/integration/security.spec.ts`. |
| IV. Single Role: Authenticated Administrator | ✅ Pass | The plan composes on top of 004's auth boundary. The layering (CORS → CSRF → withAuth → handler) is documented in [research §1](./research.md#1-where-each-control-is-wired) and the "Constraints" section above. |
| V. Simplicity (YAGNI) | ✅ Pass | Zero new npm dependencies. Zero new endpoints. Zero new entities. The middleware layer is ~50 lines. The helpers are 5-50 lines each. |
| VI. Functional-First | ✅ Pass | All new modules are pure functions; the Next.js middleware function is the framework-mandated shape, not a class. |
| VII. Joi Schema Validation | ✅ Pass | No new request body / query / path validation is needed; the existing Joi schemas (inherited from 001 / 002 / 004) cover every trust-boundary input. |
| VIII. UI Quality | ✅ Pass | The CSRF-client helper is a single function with a single return type; the fetch-wrapper amendment is a one-line call. |
| IX. Security & Hardening | ✅ Pass | All four controls are present, configured per Principle IX §1..§4, and covered by unit + contract + integration tests. See "Security-sensitive feature manual review" table above. |

No new violations introduced by the design phase. The
plan is ready for `/speckit-tasks`.
