<!--
Sync Impact Report
==================
Version change: 2.3.0 → 2.4.0  [MINOR: Principle IV rewritten to permit
                                  session-based authentication for the
                                  single Administrator role; new
                                  Principle IX (Security & Hardening)
                                  added covering CORS, CSP, CSRF, XSS;
                                  Stage Scope extended with a Stage 2
                                  section that authorises the
                                  authentication feature
                                  (`specs/004-user-auth/spec.md`) and
                                  the four web-hardening controls.]

Modified principles:
  IV. Single Role: Administrator → Single Role: Authenticated Administrator
       Title and intent changed. The previous principle was a strict
       "no auth boundary, no per-action authorization" rule; the new
       wording keeps the single-role posture (no new roles introduced)
       but adds a session-based authentication boundary for the
       existing Administrator role. The cross-cutting audit-column
       `created_by` / `modified_by` semantics are unchanged — they
       still store free-form strings; no FK migration to `users.id`
       is in Stage 1 or Stage 2 scope.

Modified sections (non-principle):
  Stage Scope
    - "Stage 1 — Explicitly Out of Scope" entry "Authentication,
      authorization, sessions, or any non-administrator role" is
      REMOVED.
    - New "Stage 2 — In Scope" block added covering:
        • Authentication feature (`specs/004-user-auth/spec.md`)
        • CORS allow-list enforcement
        • Content Security Policy (CSP) headers
        • CSRF protection for state-changing API requests
        • XSS prevention (input validation + output encoding + CSP
          defense-in-depth)
    - New "Stage 2 — Explicitly Out of Scope" block added listing the
      controls that are intentionally deferred (MFA, OAuth/SSO,
      password reset, self-registration, account lockout, rate
      limiting, audit logging beyond the existing audit columns).

Added principles:
  IX. Security & Hardening (mandatory web-security controls).
      New principle with the same MUST/SHOULD discipline as I–VIII.
      Covers CORS, CSP, CSRF, and XSS prevention in a single section
      because they are mutually reinforcing — CORS without CSP, or
      CSP without CSRF protection, would leave the application
      vulnerable even though the other control is in place.

Removed principles: none.
Removed sections: none.

Templates requiring updates:
  - .specify/templates/plan-template.md      ✅ no change (template is generic)
  - .specify/templates/spec-template.md       ✅ no change (template is generic)
  - .specify/templates/tasks-template.md      ✅ no change (template is generic)
  - .specify/templates/checklist-template.md ✅ no change (template is generic)
  - .specify/templates/commands/*.md          ✅ none present

Dependent artifacts flagged for manual follow-up (NOT amended by this
constitution update — they are downstream of `specs/004-user-auth/` and
the per-feature specs and require their own PRs):
  - ⚠ specs/004-user-auth/spec.md — Section "Constitutional Note
    (gate before planning)" was written before this amendment and
    references the pre-amendment Stage 1 scope as the gate. That
    section is now HISTORICAL context (it documents the gap that
    this amendment closes) and SHOULD be reviewed at
    `/speckit-plan` time, but no structural change is required.
  - ⚠ specs/003-backend-api-db/spec.md — the cross-cutting
    status-code table (FR-013) currently lists
    `400 / 404 / 409 / 415 / 500 / 503`. Stage 2 adds `401` for the
    "no valid session" case. The 401 entry is propagated by the
    `specs/004-user-auth/spec.md` Clarifications section (Session
    2026-06-21 — cross-cutting propagation) but the 003 spec itself
    should be updated to reflect the new status code in its next
    edit cycle.
  - ⚠ specs/003-backend-api-db/contracts/common.yaml — same
    status-code propagation; the shared contract document should
    gain a `401` row. (The versioned-path propagation
    `/api/login` → `/api/v1.0/login` is a separate
    `003-backend-api-db` Clarification Session 2026-06-21
    entry that has been propagated to `004-user-auth/spec.md` and
    `005-security-hardening/spec.md`.)
  - ⚠ README.md — "Architecture", "API contract", "Stage 1
    assumptions" sections reference the Stage 1 posture verbatim
    ("No auth, no sessions"). They SHOULD be updated to describe
    Stage 2's authentication + hardening posture at the next README
    edit. The new directories (`app/api/login/`, `app/api/logout/`,
    `app/api/me/`, `app/login/`, `lib/auth/`, `lib/security/`) and
    the new `docker-compose.yml` Redis service (or user-managed
    Redis) SHOULD be added to the Directory layout and Quick-start
    sections.
  - ⚠ next.config.mjs — security headers (CSP, HSTS, X-Frame-Options,
    X-Content-Type-Options, Referrer-Policy) are not yet configured.
    This is implementation work for the Stage 2 plan, not a
    constitutional amendment.
  - ⚠ docker/docker-compose.yml — no Redis service yet. Either a
    new `redis` service is added here OR the README documents the
    user-managed Redis as the runtime prerequisite (consistent with
    the FR-016 pattern for MySQL). Decision is in the Stage 2 plan.
  - ⚠ requirements/Full Stack Assignment.md — informational only;
    the original requirement already mentions "secure" and
    "authentication" as candidate concerns, so this amendment
    brings the implementation in line with the original brief.

Follow-up TODOs (carry forward, plus the new ones):
  - TODO(ANTD_TAILWIND_VERSION): pin the `antd`, `tailwindcss`,
    `postcss`, and `autoprefixer` package versions in `package.json`
    at the first frontend plan so the constitution's version-pin
    requirement is reflected in the dependency tree. (Unchanged.)
  - TODO(JOI_ALIGNMENT): on the first PR that adds a typeORM entity,
    verify a matching Joi schema exists with identical field-level
    constraints (required-ness, length, regex, format). (Unchanged.)
  - TODO(FUNCTIONAL_REVIEW): on first PR, verify no class-based
    service / controller / domain-model code is introduced; the only
    allowed classes are framework-mandated (typeORM entities, Joi
    schema helpers where required, error subclasses where
    appropriate). (Unchanged.)
  - TODO(PROFILE_PAGE_OUT_OF_SCOPE): a "change password" or account
    profile page is NOT in Stage 2 scope. The login page is the only
    authentication-related UI in Stage 2. Adding a profile page is a
    future-stage amendment (Principle V — YAGNI).
  - TODO(RATE_LIMITING_OUT_OF_SCOPE): brute-force protection beyond
    Joi rate checks (e.g., per-IP login attempt limits,
    captcha-after-N-failures) is NOT in Stage 2 scope. A future
    stage may add it under Principle V (YAGNI).
  - TODO(CRP_INTERPRETATION): the user's amendment request
    ("secure on CORS, XXS CSRF, CRP") was interpreted as
    **CORS + XSS + CSRF + CSP (Content Security Policy)**. "CRP" is
    treated as a typo for "CSP" (the standard web-security triad of
    CORS + CSP + CSRF; "CRP" does not correspond to a recognised
    web-security acronym in OWASP / MDN references). If the user
    meant **COOP** (Cross-Origin Opener Policy) or **CORP**
    (Cross-Origin Resource Policy) instead, Principle IX can be
    extended in a PATCH-level amendment without changing the
    version major.
  - TODO(LOCAL_DEV_HTTP_POSTURE): the `Secure` cookie attribute
    (per Principle IX + 004 spec FR-017) requires HTTPS in
    production. Local development runs over HTTP, so the
    application MUST relax the `Secure` attribute in dev mode via
    the runtime configuration. The exact mechanism is decided in
    the Stage 2 plan; the constitutional requirement is just that
    the relaxation is environment-driven, not hard-coded.
-->

# pvt-edu-admin-project Constitution

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)

Every feature in this project MUST be produced through the Spec Kit workflow:
`/speckit-specify` → review → `/speckit-plan` → review → `/speckit-tasks` →
`/speckit-implement`. No source code, schema, migration, or contract is
written before its `spec.md`, `plan.md`, and `tasks.md` exist for the active
feature in `specs/[###-feature-name]/`. Reviewers MUST stop at each gate and
explicitly approve before the next step runs.

**Rationale:** The repository exists as interview-prep learning material
built around the SDD cycle. Skipping steps collapses the very practice the
project is meant to teach.

### II. TypeScript End-to-End

All source code — UI, API route handlers, scripts, type definitions,
tests, and infrastructure glue — MUST be written in **TypeScript** with
`strict: true`. JavaScript source files (`.js`, `.mjs`, `.cjs`) MUST NOT be
introduced except as auto-generated build output. A single `tsconfig` MUST
cover the whole application so that types cross the network boundary
between the React UI and the API routes without manual re-declaration.

**Rationale:** The requirement is "a single language across both frontend
and backend". Drift to JS fragments is the silent failure mode that erodes
that property.

### III. Unit Tests Required

Unit tests MUST exist for all domain logic — teacher/class CRUD invariants,
scheduling constraints, authentication flows, password hashing/verification,
session-store helpers, CSRF-token minting/validation, and any computation
specific to the active feature. Tests MUST be runnable without a network
call or a live MySQL / Redis connection (use the typeORM test fixtures /
in-memory patterns documented in `plan.md`). The order in which tests and
implementation are written is the contributor's choice; the requirement is
that every domain rule is covered by a passing unit test at the moment the
feature is marked done (see Development Workflow).

**Rationale:** Unit tests are an explicit project requirement. Dropping the
test-first ordering keeps the safety net without imposing a process the
project does not need.

### IV. Single Role: Authenticated Administrator

The application has exactly one user role: **Administrator**. Stage 2
introduces a **session-based authentication boundary** for that role; every
request to a protected resource is rejected with HTTP `401 Unauthorized`
when the caller does not present a valid session cookie. There is no
role switcher, no per-action authorization matrix, and no additional roles
(no Teacher role, no Student role, no Parent role). Introducing any
additional role is a constitutional amendment and MUST NOT be done in a
feature spec without first amending this principle.

The authentication boundary is owned by the auth middleware in
`lib/auth/`, applied to every `/api/*` endpoint except the explicit
exempt list (login, session-introspection). The session cookie carries
`HttpOnly`, `Secure` (HTTPS-only in production; the local-dev HTTP
posture is decided in `plan.md`), and `SameSite=Strict`; the cookie value
is opaque and is the lookup key for the server-side session record in
Redis. Per-action authorization (the visitor may perform action X) is
out of Stage 2 scope — every authenticated Administrator can perform
every action.

**Rationale:** The application is an internal admin tool. A multi-role
authorization framework is over-engineering for the stated scope and adds
attack surface without corresponding value; a session-based
authentication boundary, by contrast, is the standard minimum for any
web app that exposes data over the public internet.

### V. Simplicity (YAGNI)

Prefer the simplest design that satisfies the active spec. New abstractions,
dependencies, and services MUST be justified in `plan.md` under "Complexity
Tracking". Speculative features for future user stories MUST NOT be built.
A dependency added "because we might need it" is a violation, not a
forward-looking decision.

**Rationale:** Interview prep rewards clarity. A small, sharp implementation
demonstrates mastery better than a sprawling one.

### VI. Functional-First (Classes Only When Necessary)

Code MUST be written in a functional style by default: pure functions,
immutable data structures, and explicit composition over inheritance.
React code MUST use function components and hooks (no class components).
Server code MUST be organized as small modules of pure functions (no
class-based service layers, controllers, or repositories). Classes are
permitted only when a framework or library requires them — for example,
**typeORM entity classes** — or when no reasonable functional alternative
exists. Introducing a class for any other reason requires justification in
`plan.md` → Complexity Tracking.

**Rationale:** Functional code is easier to unit test (Principle III falls
out naturally), easier to reason about, and aligns with the interview-prep
goal of demonstrating clarity of intent.

### VII. Joi Schema Validation

**Joi MUST validate every payload that crosses a trust boundary** —
in particular, every Next.js Route Handler request body and every
query/path parameter consumed by an API, and the `POST /api/v1.0/login`
request body. Validation MUST run before any business logic, typeORM
call, persistence write, or authentication logic. Validation errors
MUST be returned to the client with HTTP `400 Bad Request` and a
structured `{ error, details }` payload; they MUST NOT leak
internal messages, stack traces, or database column names.

The Joi schema for an entity MUST mirror the typeORM entity columns
field-for-field: same required-ness, same length bounds, same string
format / regex, same numeric range. Where a constraint is awkward to
express in typeORM decorators (e.g. cross-field rules), the Joi
schema is the source of truth and the typeORM column is the relaxed
default — but the mismatch MUST be documented in `plan.md`.

Joi schemas live in plain `.ts` modules (functional: exported factory
functions or const schemas), not in classes. They are unit-tested
(Principle III): at least one test per schema covers the happy path
and one test per constraint covers the rejection path.

**Rationale:** Manual, ad-hoc validation drifts away from the
typeORM columns and silently lets malformed data into MySQL.
Joi-as-source-of-truth gives the app one declarative contract
that is easy to unit test, hard to bypass, and explicitly
defends the database boundary — which is the security property
the project asked for.

### VIII. UI Quality — Self-Explanatory, Reusable, Simple

Every UI component — page, section, form control, table, button — MUST
satisfy three properties:

1. **Self-explanatory.** Clear, domain-meaningful name; explicit, typed
   props with no hidden coupling to global state or ambient config;
   one obvious place to look for its behaviour. Props MUST be
   documented (TSDoc or equivalent) when their meaning is not obvious
   from the type alone.
2. **Reusable.** No feature-specific hard-coding (no `Teacher` field
   names baked into a "Form" component). Composed from generic
   **Ant Design** primitives and styled with **Tailwind CSS**
   utility classes (see Technical Stack Constraints) rather than
   re-implementing them per page.
3. **Simple.** No abstractions ahead of the current requirement
   (Principle V applies here too). If a component needs three layers
   of indirection to render one button, it is the wrong component.

UI work is reviewed against these three properties in addition to
the standard Spec-Driven gates.

**Rationale:** Self-explanatory + reusable + simple components are
the difference between an admin tool a single developer can read
end-to-end and one that requires tribal knowledge to extend. The
project's interview-prep goal is to demonstrate that clarity, not
to demonstrate framework acrobatics.

### IX. Security & Hardening (NON-NEGOTIABLE in Stage 2)

Stage 2 introduces four mandatory web-security controls. They are
mutually reinforcing — implementing CORS without CSP, or CSP without
CSRF protection, would leave the application vulnerable even though
the other control is in place. Each control is a hard requirement;
relaxing any of them requires a constitutional amendment.

1. **CORS (Cross-Origin Resource Sharing).** The API MUST enforce an
   explicit allow-list of trusted origins. Wildcard origins
   (`Access-Control-Allow-Origin: *`) MUST NOT be used in
   combination with credentialed requests; wildcard MAY be used for
   non-credentialed, fully-public endpoints, but no Stage 2 endpoint
   is fully public. The allow-list is configured via runtime
   configuration (not hard-coded) and the CORS middleware rejects
   any origin not on the list with HTTP `403 Forbidden`. The
   preflight `OPTIONS` response MUST echo the request's
   `Access-Control-Request-Method` and
   `Access-Control-Request-Headers` headers for the allowed origins.

2. **CSP (Content Security Policy).** Every response from the Next.js
   application MUST carry a `Content-Security-Policy` header. The
   Stage 2 policy is restrictive by default:
   - `default-src 'self'`
   - `script-src 'self'` — **no `'unsafe-inline'`** in production.
     Stage 2 ships no inline scripts; if a future feature needs one,
     it MUST use a per-request nonce.
   - `style-src 'self' 'unsafe-inline'` — Tailwind's JIT runtime and
     Ant Design's style injection are documented exceptions; the
     relaxation is acknowledged in the response header comment
     inside `next.config.mjs`.
   - `img-src 'self' data:` — covers Ant Design's data-URI icons
     and any user-uploaded avatars.
   - `object-src 'none'` — no `<object>`, `<embed>`, or `<applet>`.
   - `frame-ancestors 'none'` — the application cannot be framed;
     this is the modern equivalent of `X-Frame-Options: DENY`.
   - `base-uri 'self'` — `<base>` cannot be hijacked.
   - `form-action 'self'` — `<form action>` cannot target an
     external origin.
   In addition to CSP, every response MUST carry
   `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`, and (in
   production) `Strict-Transport-Security: max-age=63072000;
   includeSubDomains`.

3. **CSRF (Cross-Site Request Forgery).** Every state-changing API
   request (`POST`, `PUT`, `PATCH`, `DELETE` under`/api/v1.0/*`)
    MUST be protected against CSRF. The chosen
   mechanism is the **double-submit cookie pattern**: a CSRF token
   is generated server-side when the session is created, set as a
   non-`HttpOnly` cookie named (e.g.) `csrfToken`, and the
   browser-side React code MUST echo the same value in an
   `X-CSRF-Token` request header on every state-changing request.
   The API middleware compares the two values (constant-time
   comparison) and rejects any state-changing request whose
   cookie / header pair does not match with HTTP `403 Forbidden`.
   The session cookie's `SameSite=Strict` attribute (per Principle
   IV) is the first line of defence; the double-submit token is the
   defense-in-depth backstop. `GET` requests are exempt from the
   CSRF check (they MUST be safe and idempotent).

4. **XSS (Cross-Site Scripting).** XSS prevention is layered:
   - **Input validation** at the trust boundary (Principle VII —
     Joi) rejects malformed input before it reaches persistence.
   - **Output encoding** is the default behaviour of React and of
     the JSON-stringify path in the API; the application MUST NOT
     use `dangerouslySetInnerHTML`, `eval`, `Function(...)`, or any
     other string-to-code sink.
   - **CSP** (control 2 above) is the last line of defence — even
     if a stored XSS slips through, the CSP `script-src 'self'`
     rule blocks the inline `<script>` that the attacker would need.
   The dependency on a sanitization library (e.g., `DOMPurify`) is
   NOT in Stage 2 scope; the existing input-validation +
   output-encoding + CSP triple is sufficient for the Stage 2
   surface (no rich-text fields, no user-generated HTML).

**Rationale:** A web application that exposes data over the public
internet without these four controls is one incident away from a
full compromise. They are the OWASP-recommended baseline; each one
closes a specific class of attack, and the four together close the
classes most likely to hit a small internal admin tool.

## Stage Scope

This section pins what the current constitution actually authorises.
A feature spec that exceeds this scope MUST first amend this section
(or amend Principle IV, Principle V, etc., as relevant).

**Stage 1 — In Scope (UNCHANGED):**

- **Teachers UI**: Create and Read operations only.
- **Classes UI**: Create and Read operations only.
- **Backend APIs**: the corresponding `POST` and `GET` endpoints for
  Teachers and Classes, exposed as Next.js Route Handlers under
  `app/api/v1.0/`, validated by Joi (Principle VII) and persisted via
  typeORM (Technical Stack Constraints).
- **Data model**: the MySQL tables backing Teachers and Classes, as
  defined in `specs/003-backend-api-db/spec.md` and locked into
  typeORM entities with matching Joi schemas.

**Stage 1 — Explicitly Out of Scope** (requires a constitutional
amendment to enter scope; the "Authentication, authorization,
sessions, or any non-administrator role" entry was REMOVED by the
v2.4.0 amendment and is now Stage 2 In Scope):

- Update and Delete operations on Teachers / Classes.
- New entities beyond Teachers and Classes.
- Production deployment, observability, or non-MySQL storage.

**Stage 2 — In Scope (NEW, authorised by v2.4.0):**

- **Authentication feature** (`specs/004-user-auth/spec.md`):
  - The single login page at `/login` with username, password, and
    "Log in" button only.
  - The three authentication endpoints: `POST /api/v1.0/login`,
    `POST /api/v1.0/logout`, `GET /api/v1.0/me`
  - The auth middleware protecting every `/api/*` endpoint except
    the explicit exempt list (`POST /api/v1.0/login`, `GET /api/v1.0/me`).
  - The server-side session store in Redis with a hard 30-minute
    TTL.
  - The session cookie with `HttpOnly`, `Secure`,
    `SameSite=Strict`.
  - The React route guard component protecting every private page
    (calls `GET /api/v1.0/me` on mount; redirects to `/login` on `401`).
  - The `users` table (user-prepared MySQL, FR-016 pattern) with
    the standard audit + ULID columns (FR-018, FR-021).
- **CORS hardening**: explicit allow-list of trusted origins,
  no wildcard with credentials, runtime-configured allow-list.
- **CSP hardening**: the restrictive CSP policy in Principle IX
  (control 2) is the default for every response; nonce-based
  inline-script relaxation is supported but not used in Stage 2.
- **CSRF protection**: the double-submit-cookie CSRF token on every
  state-changing API request; `GET` requests are exempt.
- **XSS prevention**: layered — Joi input validation, React's
  default output encoding, and CSP as defense-in-depth.

**Stage 2 — Explicitly Out of Scope** (requires a constitutional
amendment to enter scope):

- Multi-factor authentication (MFA / 2FA).
- OAuth2 / OpenID Connect / SSO integration (Google, Microsoft,
  Apple, etc.).
- Password reset, forgot-password, or account-recovery flows.
- Self-registration / sign-up endpoints.
- Admin authoring of `users` rows (the SQL-seeded initial
  administrator(s) are the only user-creation path in Stage 2).
- Account lockout, brute-force throttling, or captcha-after-N-failures.
- Rate limiting beyond what Joi's input validation provides.
- Audit logging beyond the existing `created_by` / `modified_by`
  / `created_at` / `modified_at` columns (no separate
  `auth_events` table, no per-request log of authentication
  outcomes beyond what's needed for the session store).
- Migration of the `created_by` / `modified_by` audit columns on
  `teachers`, `classes`, `subjects`, and `levels` to FKs against
  `users.id`.
- HTTPS termination / TLS configuration (the application runs
  behind a reverse proxy in production; the proxy is responsible
  for TLS, the `Strict-Transport-Security` header, etc.).
- COOP (Cross-Origin Opener Policy), CORP (Cross-Origin Resource
  Policy), COEP (Cross-Origin Embedder Policy) — Stage 2 ships
  CSP, CORS, CSRF, XSS. The remaining COOP / CORP / COEP triad
  is a documented future-stage amendment (see
  TODO(CRP_INTERPRETATION) in the Sync Impact Report).

## Technical Stack Constraints

- **Language**: TypeScript with `strict: true`. No `.js` source files.
- **Runtime**: Node.js LTS, via a single **Next.js** application. The
  application is one process; the UI lives under `app/` (or `src/app/`)
  and the API lives under `app/api/` as **Next.js Route Handlers**. There
  is no separate Node.js HTTP service, Express/Fastify/NestJS app, or
  microservice in scope.
- **Database**: **MySQL** (RDBMS), running in a **Docker container**.
  All persistence MUST go through **typeORM** entities, repositories,
  and migrations. Raw SQL is permitted only inside typeORM migrations
  or query builders, not in business code.
- **Session store**: **Redis**, running in a **Docker container**
  (either as a `docker-compose` service or as a user-managed
  container — the choice is decided in `plan.md`). All session
  records are opaque `sessionId → userId` mappings with a hard
  30-minute TTL (per Principle IV). The application MUST NOT
  introduce an alternative session store (in-memory, file-based,
  database-backed) — Redis is the single source of truth for
  session state.
- **Frontend**: **Next.js** with the **App Router**, using **client
  components** (client-side rendering is the default for this project).
- **UI components**: **Ant Design (`antd`)** is the required component
  library for the active feature. Every interactive control (button,
  input, select, table, modal, form, etc.) MUST be composed from `antd`
  primitives — third-party UI deps in addition to `antd` require
  justification in `plan.md` and a Complexity Tracking entry. The
  exact `antd` package version is pinned in `package.json` at the
  first frontend task — see TODO(ANTD_TAILWIND_VERSION) in the Sync
  Impact Report.
- **Styling**: **Tailwind CSS** is the required styling solution for
  the active feature. All visual presentation — layout, spacing,
  colour, typography, responsive behaviour — MUST be expressed via
  Tailwind utility classes (in JSX `className`, or template strings
  consumed by Tailwind's content scanner) rather than hand-written
  CSS files, inline `style` objects, or per-component CSS modules,
  except where Ant Design's documented escape hatches (e.g. `ConfigProvider`
  token overrides) require it. The Tailwind config
  (`tailwind.config.*`) is the single place where project tokens
  (colour palette, font stack, breakpoints, spacing scale) are
  defined; component code MUST reference those tokens via utility
  classes, not raw hex values or one-off class names. The exact
  `tailwindcss`, `postcss`, and `autoprefixer` package versions
  are pinned in `package.json` at the first frontend task.
- **Validation**: **Joi** schemas (Principle VII), aligned field-for-field
  with the typeORM entity columns.
- **Security headers**: every response MUST carry the headers listed
  in Principle IX (control 2 — CSP + `X-Content-Type-Options` +
  `Referrer-Policy` + `Strict-Transport-Security` in production).
  The configuration lives in `next.config.mjs` (the single place
  where the security posture is centralised).
- **Delivery**: the application MUST run in a **Docker** container,
  and the MySQL database MUST also run in a Docker container. The
  Redis container layout (managed by `docker-compose` or
  user-managed) is decided per feature in `plan.md`.
- **Configuration**: runtime application configuration (database URL,
  Redis URL, server port, feature flags, CORS allow-list, the
  environment-driven `Secure` cookie flag, etc.) is provided via
  the `.env` file loaded by Next.js / the Node.js runtime, in
  standard dotenv format.
- **Testing**: unit tests are mandatory (per Principle III). The runner
  (Vitest, Jest, or equivalent) is decided per feature in `plan.md`.
- **Secrets**: passwords, API keys, session secrets, and other
  values that MUST NOT be committed live in `.env.local` (gitignored)
  or are passed at container run time. The repo-level `.env` that
  the coding-agent harness reads as JSON and that holds model
  configuration only — see `CLAUDE.md` → Environment — is a
  separate concern and MUST NOT be used as the source of
  application runtime configuration.

## Development Workflow

- Each feature lives in its own `specs/[###-feature-name]/` directory and
  goes through the SDD cycle in order. Gates are enforced by the Spec Kit
  skills under `.claude/skills/speckit-*`.
- A feature is "done" only when all of the following hold: (a) every
  `tasks.md` item is checked, (b) the `quickstart.md` validation steps
  pass, (c) `/speckit-analyze` reports no cross-artifact inconsistencies,
  (d) `README.md` reflects any new run / deploy / assumption, and (e)
  for security-sensitive features (anything that touches Principle IV
  or Principle IX), a manual review of the security-control coverage
  is recorded in `plan.md` → Constitution Check.
- `README.md` at the repository root is a **contract** for every release.
  It MUST contain: clear instructions to run a working local instance of
  the web app and API server; documented assumptions; links to the hosted
  web app and API when applicable; and (optionally) notes or suggestions
  on the API design. A PR that changes behavior without updating the
  README is incomplete.
- Pull requests for code MUST link the active spec, plan, and tasks.
  Reviewers MUST reject PRs whose artifacts were not produced through the
  SDD skills, and PRs that violate Principle II–IX.
- When in doubt, prefer amending this constitution over maintaining
  out-of-band conventions.

## Governance

- This constitution supersedes all other written or unwritten development
  practices in this repository.
- Amendments require a written rationale, a Sync Impact Report at the top
  of this file, and a version bump per the rules below.
- **Versioning policy** follows semantic versioning:
  - **MAJOR** — principle removal or incompatible redefinition.
  - **MINOR** — new principle or section added, or material guidance
    expanded.
  - **PATCH** — clarifications, wording fixes, non-semantic refinements.
- Compliance review: every `/speckit-implement` run MUST include a
  Constitution Check section in `plan.md`; deviations from Principles
  II–IX require an entry in `plan.md` → Complexity Tracking with the
  simpler alternative that was rejected and why. The Constitution Check
  MUST, for security-sensitive features (any feature that touches
  Principle IV or Principle IX), explicitly verify the four hardening
  controls (CORS allow-list, CSP header, CSRF token middleware, XSS
  posture) are present and configured per Principle IX.
- The authoritative runtime guidance for coding agents is `CLAUDE.md`;
  the authoritative process guidance is the Spec Kit skill documentation
  under `.claude/skills/speckit-*`.

**Version**: 2.4.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-21 (PATCH: clarified the versioned-path commitment already present in the Stage 2 In Scope block; propagated to 003 FR-022, 004 spec, 005 spec)