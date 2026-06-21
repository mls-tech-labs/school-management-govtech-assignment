# Feature Specification: Security Hardening (CORS, CSP, CSRF, XSS)

**Feature Branch**: `005-security-hardening`
**Created**: 2026-06-21
**Status**: Draft
**Input**: User description: "create a new spec under stage 2 to cover these CORS, XXS, CSRF, CSP requirements. all the necessary configurations will handle via .env file like other configurations. configurations should be minimal but neccessary ones to cover the security features."

> **Note on the input.** "XXS" in the input is read as **XSS** (Cross-Site Scripting). The constitution's `TODO(CRP_INTERPRETATION)` accepts this reading — CORS + XSS + CSRF + CSP is the standard OWASP web-security baseline; "CRP" / "XXS" do not correspond to recognised web-security acronyms in OWASP / MDN references. If the user meant COOP / CORP instead, that is a documented Stage-2-out-of-scope follow-up amendment, not this feature.

## Related specs & Constitutional alignment

**Constitutional alignment.** This spec implements the four mandatory web-security controls of **Principle IX (Security & Hardening, NON-NEGOTIABLE in Stage 2)** and is authorised by:

- **Principle IX (Security & Hardening)** — controls 1 (CORS), 2 (CSP),
  3 (CSRF), 4 (XSS). This spec is the *implementation* of those four
  controls at the application boundary.
- **Principle IV (Single Role: Authenticated Administrator)** — the
  session cookie's `SameSite=Strict` attribute (owned by
  `specs/004-user-auth/spec.md`) is the first line of CSRF defence;
  this spec adds the double-submit token as the defense-in-depth
  backstop.
- **Principle VII (Joi Schema Validation)** — every request body and
  query/path parameter crossing a trust boundary is already
  validated by Joi before any persistence or rendering; this spec
  reaffirms Joi as the **input-validation** layer of the layered
  XSS posture.
- **Stage Scope — Stage 2 In Scope — CORS hardening / CSP hardening /
  CSRF protection / XSS prevention** block.

**Related specs** (cross-cutting consumers / dependencies):

- `specs/004-user-auth/spec.md` — owner of the session cookie, the
  Redis session store, and the `GET /api/v1.0/me` route guard. This
  spec's CSRF token is minted on session creation (per FR-008) and
  stored alongside the session in Redis. The three auth endpoints
  (`POST /api/v1.0/login`, `POST /api/v1.0/logout`, `GET /api/v1.0/me`)
  are the explicit CSRF exempt list (FR-009); without that exemption
  the auth handshake would deadlock.
- `specs/003-backend-api-db/spec.md` — cross-cutting contract owner:
  error envelope (`{ "error": "..." }`), `Content-Type: application/json`
  requirement (FR-013 in 003), `/api/v1.0/*` version-prefix rule
  (FR-022 in 003 — note: this is a *different* FR-022 from the
  hardening `.env` knob surface FR-022 in this spec). This spec's
  `403` responses for disallowed-origin CORS rejections and CSRF
  mismatches reuse the same `{ "error": "..." }` envelope with
  `error: "csrf"` / `error: "cors"` discriminators.
- `specs/001-teachers/spec.md` and `specs/002-classes/spec.md` —
  consumers: every state-changing endpoint they own
  (`POST /api/v1.0/teachers`, `POST /api/v1.0/classes`) becomes
  CSRF-protected once this feature ships. The React UI in those
  features MUST be updated to send the CSRF header (FR-020).

**Cross-cutting rules inherited from 003 + CLAUDE.md** (no overrides):
no persisted entities (FR-016 / FR-017), no new endpoints (FR-018),
no migrations (FR-016 from 003), single-language TypeScript
(Principle II), unit tests required (Principle III).

## Clarifications

### Session 2026-06-21

- Q1 — Observability of security events (CSRF / CORS rejections,
  CSP report-only violations): should the spec commit to
  structured logging? → A: Yes — structured log lines to stdout
  via the existing logger (the same one used by 004 for login
  / logout). No new `security_events` table, no new dependency.
  Each log line MUST include the event name, request method +
  path, the rejected origin (for CORS / CSRF), and the rejection
  reason. Log lines MUST NOT contain the session cookie value,
  the CSRF token value, or the request body. Captured as FR-021
  + SC-011.
- Q2 — Per-control `*_ENABLED` toggles: how wide should the
  `.env` toggle surface be? → A: Toggles only for `HSTS_ENABLED`
  (dev HTTP relaxation) and `CSP_REPORT_ONLY` (audit rollouts).
  CORS and CSRF remain hard-on (no documented opt-out need;
  removing the toggle removes the foot-gun). The companion
  headers `X-Content-Type-Options` and `Referrer-Policy` are
  hard-on. Captured as FR-022 (explicit knob enumeration) and
  SC-001 (rewritten to list the actual knobs).
- Q3 — Default value of `CORS_ALLOWED_ORIGINS` for dev
  onboarding (`.env.example` content): should the file ship a
  working dev default or an empty value + comment? → A: Empty
  default + one-line comment. The runtime default is empty
  (fail-closed per FR-013). `.env.example` ships
  `CORS_ALLOWED_ORIGINS=` with a one-line comment explaining
  "leave empty for same-origin dev; populate with comma-separated
  origins for cross-origin". Matches the simplicity rule (no
  magic defaults) and the fail-closed posture (no permissive
  fall-through). Captured as FR-020 (strengthened with the
  comment policy).
- Q4 — CORS preflight `Access-Control-Allow-Headers`
  enumeration: which request headers must the preflight
  response allow for the React UI's `X-CSRF-Token` header
  to flow on cross-origin state-changing requests? → A:
  Explicit allow-list `Content-Type, X-CSRF-Token`. A wildcard
  `*` is rejected by browsers when combined with
  `Access-Control-Allow-Credentials: true`; echoing
  `Access-Control-Request-Headers` verbatim requires a
  `Vary: Access-Control-Request-Headers` response header to
  keep caches honest. Pinning the two headers Stage 2 actually
  needs keeps the tests deterministic and matches the
  simplicity posture. Captured as FR-001a (new sub-bullet
  under FR-001) and as SC-012 (new measurable outcome).
- Q5 — How does the React UI obtain the CSRF token to put in
  the `X-CSRF-Token` header on state-changing requests? → A:
  A small `lib/security/csrf-client.ts` helper reads
  `document.cookie` and exposes the value (one call site per
  fetch wrapper, one unit test, one place to change if the
  cookie name rotates). The helper is a trivial one-liner
  over `document.cookie` and does not violate YAGNI. The
  alternative (read `document.cookie` directly in each call
  site) repeats parsing logic and silently breaks if the
  cookie name is ever rotated; the alternative (server
  includes the CSRF token in `GET /api/v1.0/me` response body)
  adds redundant contract surface since the non-HttpOnly cookie
  already carries the value. Captured as FR-019a (new
  sub-bullet under FR-019) and as SC-013 (new measurable
  outcome).
- Q6 — CSP `report-only` mode without a `report-uri` endpoint:
  the spec contained a tension between FR-017 (no new
  endpoints) and FR-021 (the CSP report-only "handler"
  receives violations). What is the simplest posture that
  makes `CSP_REPORT_ONLY=true` operationally useful without
  adding a new endpoint or dependency? → A: Ship the CSP
  without any `report-uri` / `report-to` directive.
  `CSP_REPORT_ONLY=true` flips only the header name (from
  `Content-Security-Policy` to
  `Content-Security-Policy-Report-Only`); the browser then
  enforces in observe-only mode, prints violations to its
  dev-tools console where operators read them, and does NOT
  POST anywhere (no report destination is configured).
  Resolves the FR-017 ↔ FR-021 contradiction (no new endpoint
  needed; the browser's built-in console is the "handler"),
  keeps the `.env` surface lean, and matches the user's
  "simplest yet full functional" lens — the audit-rollout
  use case is still served (operators watch the console),
  the runtime footprint stays small, and there is zero new
  endpoint surface to test or harden. Captured as
  FR-021 amendment (remove case (c)), FR-003 amendment
  (no `report-uri` / `report-to`), FR-004 amendment
  (scope clarified), edge-case amendment under
  "CSP report-only mode", and SC-011 amendment (the
  CSP log-line clause is removed; SC-011 now covers
  CORS + CSRF only).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — CORS allow-list rejects unauthorised origins (Priority: P1)

The administrator opens the admin dashboard in a browser. The browser
makes an API request to the same origin (or, in dev, to the configured
allow-listed origin). The request succeeds. A different browser tab
from a non-allow-listed origin attempts the same API call and the
browser blocks the response at the CORS layer.

**Why this priority**: CORS is the first wall between a compromised
browser and the API. Without an explicit allow-list, a stale wildcard
origin would silently leak credentials (the "browser strips credentials"
failure mode).

**Independent Test**: Deploy the app, point a browser at a known
allow-listed origin and observe a successful API response. Point a
browser at a non-allow-listed origin (e.g., `http://evil.example.com`)
and observe the API rejects the cross-origin request with `403`.

**Acceptance Scenarios**:

1. **Given** the application is running with `CORS_ALLOWED_ORIGINS` set
   to a comma-separated list, **When** a browser makes an API request
   from an origin on the list, **Then** the response carries
   `Access-Control-Allow-Origin: <that-origin>` and the request succeeds.
2. **Given** the application is running, **When** a browser makes an
   API request from an origin NOT on the allow-list, **Then** the API
   responds with `HTTP 403 Forbidden` and a `Access-Control-Allow-Origin`
   header that does NOT echo the disallowed origin.
3. **Given** the application is running, **When** a browser sends an
   `OPTIONS` preflight from an allowed origin with a non-simple method
   (`POST`), **Then** the response includes `Access-Control-Allow-Methods`
   echoing the requested method and `Access-Control-Allow-Credentials: true`.

---

### User Story 2 — CSP header blocks injected inline scripts (Priority: P1)

An attacker manages to inject an inline `<script>...</script>` payload
into a persisted field that is later rendered into a page (a stored XSS
vector). The browser receives the page, the CSP header is present with
`script-src 'self'`, and the injected inline script does NOT execute.
The page text is rendered (React's default output encoding kept the
angle brackets inert), and the user sees the literal text of the
payload rather than running code.

**Why this priority**: CSP is the only defense-in-depth against XSS
that holds even when validation or output encoding is bypassed. It is
the difference between "the bug is in production" and "the bug
attempted execution and was blocked".

**Independent Test**: Inject a `<script>alert(1)</script>` payload into
a teacher name field that is later rendered on a page; observe that
the browser renders the text literally and does not execute the
script, and that the response carries the CSP header.

**Acceptance Scenarios**:

1. **Given** a request to any page or API response, **When** the
   response is received, **Then** it carries a
   `Content-Security-Policy` header whose `script-src` directive is
   `'self'` (no `'unsafe-inline'`, no wildcard).
2. **Given** a stored XSS payload in a persisted field, **When** that
   field is rendered on a page, **Then** the payload is rendered as
   inert text (no script execution) and the browser dev-tools
   console reports the CSP violation.

---

### User Story 3 — CSRF double-submit token blocks forged state changes (Priority: P1)

A logged-in administrator is lured to a malicious site. The malicious
site's hidden form posts to the API on the administrator's behalf. The
browser sends the session cookie (SameSite=Strict blocks the cross-site
post, but assume an attacker found a same-site vector), but the browser
does NOT send the `X-CSRF-Token` header because the malicious site
cannot read the non-`HttpOnly` `csrfToken` cookie from a different
origin. The CSRF middleware rejects the request with `403`. A genuine
same-origin state-changing request from the legitimate React UI sends
both the cookie and the header and succeeds.

**Why this priority**: CSRF is the difference between "an admin can be
tricked into deleting teachers" and "the malicious post is rejected".

**Independent Test**: Log in, observe the `csrfToken` cookie set.
Issue a same-origin `POST /api/v1.0/teachers` with `credentials:
'include'` but no `X-CSRF-Token` header — observe `403`. Issue the
same request with both the cookie and the header — observe `201`.

**Acceptance Scenarios**:

1. **Given** an authenticated session, **When** a state-changing
   request (`POST`, `PUT`, `PATCH`, `DELETE`) arrives without an
   `X-CSRF-Token` header, **Then** the API rejects it with `403
   Forbidden` and `{ "error": "csrf" }`.
2. **Given** an authenticated session, **When** a state-changing
   request arrives with `X-CSRF-Token` matching the `csrfToken`
   cookie, **Then** the request succeeds.
3. **Given** an authenticated session, **When** a state-changing
   request arrives with `X-CSRF-Token` mismatching the `csrfToken`
   cookie, **Then** the API rejects it with `403 Forbidden`.
4. **Given** a request to `GET`, `HEAD`, or `OPTIONS`, **When** the
   request arrives, **Then** the CSRF check is skipped (safe methods
   are exempt).

---

### User Story 4 — Layered XSS posture (Priority: P2)

A user submits a teacher record whose name contains HTML-like characters
(e.g., `<script>alert(1)</script>`). The Joi schema for the teacher
name accepts the text (it's just a name field — no rich-text input),
persists it to MySQL via typeORM, and the page renders the literal text
through React's default output encoding. The CSP header is the
defense-in-depth backstop.

**Why this priority**: XSS is the most common web vulnerability class.
The layered posture is what makes each layer optional rather than
load-bearing.

**Independent Test**: Submit a teacher name containing `<`, `>`, `&`,
`'`, `"` characters; observe the persisted row, observe the rendered
page shows the literal text, observe no script executes.

**Acceptance Scenarios**:

1. **Given** a request body containing HTML-like characters in a
   text field, **When** the request is processed, **Then** Joi
   accepts the field (no rich-text semantics), the API persists the
   raw text, and the page renders the text inert (no script
   execution).
2. **Given** any rendered component, **When** the component is
   inspected, **Then** it does NOT use `dangerouslySetInnerHTML`,
   `eval`, `Function(...)`, or any string-to-code sink for
   user-controlled data.

---

### User Story 5 — Environment-driven configuration (Priority: P2)

A site-reliability engineer needs to rotate the CORS allow-list
(add a new staging origin) or temporarily disable HSTS in a
non-standard environment. They edit `.env`, restart the application,
and the new posture is in effect — no source change, no rebuild.

**Why this priority**: Configuration that requires a code change to
rotate is configuration that will not be rotated. The user explicitly
asked for `.env`-driven hardening.

**Independent Test**: Change `CORS_ALLOWED_ORIGINS` in `.env`, restart
the app, issue a request from the new origin — observe it succeeds.
Change it back, restart, observe it fails. The `.env.example` documents
every key.

**Acceptance Scenarios**:

1. **Given** an `.env` file with a hardening knob (e.g.,
   `CORS_ALLOWED_ORIGINS`, `CSP_POLICY`, `HSTS_ENABLED`,
   `CSRF_ENABLED`), **When** the value is changed and the app is
   restarted, **Then** the new value takes effect on the next
   request — no source change required.
2. **Given** the shipped `.env.example`, **When** a new operator
   reads it, **Then** every hardening-related key is documented with
   a default value and a one-line description.

---

### User Story 6 — Local-dev HTTP posture (Priority: P3)

A developer runs the app over HTTP on `localhost:3000` against a
local MySQL container. The CSP, CORS, CSRF, and XSS controls are all
in effect, but the `Secure` cookie attribute and the
`Strict-Transport-Security` header are relaxed (they are meaningless
over HTTP). The developer can sign in, exercise the UI, and observe
all four controls via dev tools.

**Why this priority**: The dev experience is a precondition for
testing the other five stories. If HSTS over HTTP blocks the dev
loop, the controls will be "tested in prod", which is the failure mode
the controls exist to prevent.

**Independent Test**: Run the app with `NODE_ENV=development`, open
dev tools, observe the response headers — `Secure` is absent on the
session cookie, HSTS is absent on responses. Run with `NODE_ENV=production`
behind HTTPS, observe both are present.

**Acceptance Scenarios**:

1. **Given** `NODE_ENV=development`, **When** a response is served,
   **Then** the session cookie's `Secure` attribute is absent and the
   `Strict-Transport-Security` header is absent.
2. **Given** `NODE_ENV=production`, **When** a response is served over
   HTTPS, **Then** the session cookie carries `Secure` and the response
   carries `Strict-Transport-Security: max-age=63072000; includeSubDomains`.

### Edge Cases

- **Empty / missing `CORS_ALLOWED_ORIGINS`**: the application MUST
  refuse to serve cross-origin requests (fail-closed). The startup
  check logs a clear warning so an operator notices the misconfig
  rather than silently serving a permissive app.
- **Preflight from a non-allow-listed origin**: rejected with `403`
  before any handler runs (CORS middleware is the outermost layer).
- **`Origin: null` request** (file://, sandboxed iframe): rejected —
  `null` is never on the allow-list.
- **`HEAD` / `OPTIONS` request**: bypasses CSRF (safe methods) but
  still goes through CORS.
- **State-changing request with no session**: rejected by the CSRF
  middleware in `middleware.ts` with `403` + `{"error":"csrf"}` —
  the CSRF check runs OUTSIDE the route handler (before `withAuth`
  is invoked) because the cookie + header pair is the trust boundary
  the middleware verifies directly. A request with no session cookie
  and no `X-CSRF-Token` header is the missing-cookie path of
  `compareCsrfTokens` and short-circuits to `403` before `withAuth`
  ever runs. The `401` case (a valid `csrfToken` cookie is presented
  but the session no longer resolves in Redis — a stale session)
  is enforced by `withAuth` AFTER the CSRF check passes. The
  layering is `middleware.ts (CORS) → middleware.ts (CSRF) →
  withAuth (auth) → route handler`, consistent with
  [`./data-model.md` §2.1](./data-model.md) ("exactly one Redis
  `GET` per protected request") and with the plan's
  [`./plan.md` §Project Structure](./plan.md#project-structure)
  note that the CSRF middleware reads the session inline.
- **CSRF token on the login endpoint itself**: the login endpoint
  (`POST /api/v1.0/login`) is on the explicit CSRF exempt list
  (FR-009) — there is no session yet to bind the token to.
- **CSRF token rotation on login**: when the auth middleware mints a
  fresh session at login, the CSRF middleware mints a fresh CSRF
  token bound to that session. The previous CSRF token (if any) is
  invalidated along with the previous session — defense against
  session fixation extends naturally to CSRF.
- **CSP report-only mode**: `CSP_REPORT_ONLY=true` in `.env` switches
  the header to `Content-Security-Policy-Report-Only` so an operator
  can audit violations without breaking the UI during rollout. The
  browser enforces in observe-only mode and prints any violation to
  its dev-tools console (per Clarifications Session 2026-06-21, Q6);
  no server-side collector is configured, and there is no `report-uri`
  directive in the shipped CSP.
- **HSTS over HTTP**: the `Strict-Transport-Security` header is
  silently dropped when the request is not HTTPS, because browsers
  ignore it over HTTP anyway and emitting it would be misleading.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 — CORS allow-list (P1)**: The system MUST enforce an
  explicit allow-list of trusted origins for every API response. The
  allow-list is loaded from `.env` via the key `CORS_ALLOWED_ORIGINS`
  (comma-separated). Origins not on the list are rejected with `403
  Forbidden`. A preflight `OPTIONS` request from an allowed origin
  succeeds and echoes the requested method + headers.
  - **FR-001a — CORS preflight allowed-headers (P1)** (per
    Clarifications Session 2026-06-21, Q4): The preflight
    response's `Access-Control-Allow-Headers` MUST enumerate
    the explicit allow-list `Content-Type, X-CSRF-Token`. A
    wildcard `*` is forbidden — browsers reject it when
    `Access-Control-Allow-Credentials: true` is also set.
    The list is overridable via `.env` key
    `CORS_ALLOWED_HEADERS` (default
    `Content-Type, X-CSRF-Token`); the `.env.example`
    documents the default with a one-line comment.
- **FR-002 — CORS no wildcard with credentials (P1)**: The system MUST
  NOT emit `Access-Control-Allow-Origin: *` together with
  `Access-Control-Allow-Credentials: true`. If the operator
  misconfigures the allow-list, the middleware fails closed (rejects
  every origin) rather than falling back to wildcard.
- **FR-003 — CSP header on every response (P1)**: Every response from
  the application MUST include a `Content-Security-Policy` header.
  The shipped default policy is:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
  The policy MUST NOT include any `report-uri` / `report-to`
  directive (per Clarifications Session 2026-06-21, Q6) — the
  Stage 2 surface has no server-side CSP-violation collector,
  and configuring a destination that does not exist would
  either introduce a new endpoint (forbidden by FR-017) or
  silently drop the report. The exact policy is overridable
  via `.env` key `CSP_POLICY` so future features can adjust
  without a code change.
- **FR-004 — CSP `script-src` forbids `'unsafe-inline'` in production (P1)**: The shipped CSP MUST NOT include `'unsafe-inline'` in
  `script-src` in production. `CSP_REPORT_ONLY=true` in `.env`
  switches the header to `Content-Security-Policy-Report-Only` for
  audit rollouts — the browser then enforces in observe-only mode
  and prints violations to its dev-tools console (the operator
  reads them there; no server-side collector is configured per
  Clarifications Session 2026-06-21, Q6).
- **FR-005 — Companion security headers (P1)**: Every response MUST
  carry `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin` (no toggle —
  these are hard-on per FR-022). In production over HTTPS, every
  response MUST additionally carry
  `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
  The HSTS header is opt-out via `.env` key `HSTS_ENABLED=false`
  (default `true` in `NODE_ENV=production`, default `false` in
  `NODE_ENV=development`); the opt-out exists so that non-HTTPS
  local-dev environments do not emit a meaningless header.
- **FR-006 — CSRF double-submit on state-changing requests (P1)**: Every
  state-changing API request (`POST`, `PUT`, `PATCH`, `DELETE` under
  `/api/*`) MUST be rejected with `403 Forbidden` and
  `{ "error": "csrf" }` when the `csrfToken` cookie and the
  `X-CSRF-Token` request header do not match. The comparison is
  constant-time. `GET`, `HEAD`, and `OPTIONS` are exempt.
- **FR-007 — CSRF token minting and rotation (P1)**: A CSRF token MUST
  be minted when a session is created (on successful login), set as a
  non-`HttpOnly` cookie named `csrfToken`, and bound to the session
  record in Redis. The token MUST be rotated whenever the session is
  rotated (defence against session fixation extends naturally).
- **FR-008 — CSRF exempt list (P1)**: The CSRF middleware MUST NOT
  apply to the explicit exempt list: `POST /api/v1.0/login`,
  `POST /api/v1.0/logout`, `GET /api/v1.0/me`. These endpoints are
  part of the auth handshake and the CSRF check would deadlock with
  the auth middleware.
- **FR-009 — XSS via input validation (P1)**: Per Principle VII,
  every request body and query/path parameter crossing a trust
  boundary MUST be validated by Joi before any persistence or
  rendering. Joi's rejection of malformed input is the first
  XSS-defence layer; this spec reaffirms that posture.
- **FR-010 — XSS via output encoding (P1)**: The application MUST NOT
  use `dangerouslySetInnerHTML`, `eval`, `Function(...)`, or any
  string-to-code sink for user-controlled data. All rendered text
  passes through React's default output encoding. (No rich-text
  fields exist in Stage 2 — no DOMPurify or sanitisation library is
  required.)
- **FR-011 — CSP as XSS defense-in-depth (P1)**: The CSP `script-src
  'self'` rule MUST be the last line of defence against stored XSS.
  Even if input validation or output encoding is bypassed, an
  injected inline `<script>` MUST NOT execute.
- **FR-012 — Environment-driven configuration (P1)**: Every value
  described in FR-001..FR-011 that has a runtime default MUST be
  overridable via `.env`. The shipped `.env.example` MUST document
  every hardening-related key with a default value and a one-line
  description. No security-relevant default is hard-coded in source
  without a corresponding `.env` override.
- **FR-013 — Fail-closed defaults (P1)**: When a required hardening
  configuration value is missing or empty, the system MUST refuse to
  serve rather than fall back to a permissive default (no wildcard
  origin, no `unsafe-inline`, no `null` origin). The startup check
  logs a clear, actionable error.
- **FR-014 — Dev/prod posture switch (P2)**: Per Principle IV's
  TODO(LOCAL_DEV_HTTP_POSTURE), the `Secure` cookie attribute and
  the `Strict-Transport-Security` header MUST be relaxed in
  `NODE_ENV=development` and re-enabled in `NODE_ENV=production`.
  The switch is environment-driven, not source-flagged.
- **FR-015 — Unit-testable helpers (P2)**: Per Principle III, every
  hardening helper (allow-list matcher, CSP builder, CSRF token
  compare, dev-vs-prod posture switch) MUST be covered by a unit
  test that runs without a network call or live MySQL / Redis
  connection.
- **FR-021 — Structured security-event logging (P1)** (per
  Clarifications Session 2026-06-21, Q1, amended by Q6):
  The system MUST emit a structured log line to stdout via
  the existing logger (the same one used by
  `specs/004-user-auth/spec.md` for login / logout events)
  whenever (a) the CORS middleware rejects a cross-origin
  request or (b) the CSRF middleware rejects a
  state-changing request. Each log line MUST include an
  `event` field set to `cors_rejected` / `csrf_rejected`
  respectively, plus the request method, request path, the
  rejected origin (for CORS / CSRF), and a short rejection
  reason. Log lines MUST NOT include the session cookie
  value, the CSRF token value, the request body, the
  response body, or any other secret. No new logger, no new
  dependency, no new persistence — stdout only. CSP
  report-only violations are NOT server-side observable in
  Stage 2 (per Clarifications Session 2026-06-21, Q6 — no
  `report-uri` is configured); operators observe them in the
  browser dev-tools console.
- **FR-016 — No new persisted entities (P1)**: This feature introduces
  zero new database tables. The CSRF token is stored alongside the
  session record in Redis (owned by 004). No data-model.md artifact
  is produced for 005.
- **FR-017 — No new endpoints (P1)**: This feature introduces zero new
  `/api/*` endpoints. All hardening applies to existing endpoints.
- **FR-018 — Backwards compatible with 004 (P1)**: The CSRF middleware
  MUST NOT break the three 004 auth endpoints (`POST /api/v1.0/login`,
  `POST /api/v1.0/logout`, `GET /api/v1.0/me`). The CSRF exempt list
  in FR-008 is the contract.
- **FR-019 — Backwards compatible with 001 / 002 (P1)**: Every existing
  `/api/v1.0/teachers`, `/api/v1.0/classes`, `/api/v1.0/subjects`,
  `/api/v1.0/levels` endpoint MUST remain operational once CSRF is
  enforced. The React UI in those features MUST be updated to send
  the CSRF header on every state-changing call.
  - **FR-019a — CSRF client-side acquisition helper (P1)** (per
    Clarifications Session 2026-06-21, Q5): The React UI MUST
    obtain the CSRF token via a single helper at
    `lib/security/csrf-client.ts` that reads the non-`HttpOnly`
    `csrfToken` cookie via `document.cookie` and exposes the
    value to the `fetch` wrappers. The helper MUST be the
    only call site that reads `document.cookie` for CSRF
    purposes; state-changing fetch wrappers MUST call the
    helper to populate the `X-CSRF-Token` request header.
    The helper is unit-testable in isolation (FR-015).
- **FR-020 — `.env.example` ships with the feature (P2)**: The
  hardening-related entries in `.env.example` MUST be added or
  updated as part of this feature's implementation. The `.env.example`
  file is the single source of truth for "what knobs exist and what
  are the safe defaults". Every key MUST be shipped with a one-line
  comment that explains the safe default, the expected format, and
  any non-obvious constraint (per Clarifications Session
  2026-06-21, Q3). `CORS_ALLOWED_ORIGINS` is shipped with an empty
  value and a comment that names the fail-closed posture
  ("leave empty for same-origin; populate with comma-separated
  origins for cross-origin"); the operator explicitly populates
  it for cross-origin environments.
- **FR-022 — Exhaustive `.env` knob surface (P1)** (per
  Clarifications Session 2026-06-21, Q2, amended by Q4): The
  hardening feature ships with exactly the following five
  `.env` keys; no other hardening-related keys are introduced:
  - `CORS_ALLOWED_ORIGINS` — comma-separated allow-list of
    trusted origins (FR-001). Empty at startup; the application
    MUST fail closed (reject every cross-origin request) until
    the operator populates this key (FR-013).
  - `CSP_POLICY` — the full `Content-Security-Policy` header
    value (FR-003). Default = the shipped restrictive policy:
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
  - `CSP_REPORT_ONLY` — when set to `true`, the CSP header is
    emitted as `Content-Security-Policy-Report-Only` for audit
    rollouts (FR-004). Default `false`.
  - `HSTS_ENABLED` — when set to `false`, the
    `Strict-Transport-Security` header is suppressed (FR-005).
    Default `true` when `NODE_ENV=production`, default `false`
    when `NODE_ENV=development` (FR-014).
  - `CORS_ALLOWED_HEADERS` — comma-separated list of request
    header names the preflight's
    `Access-Control-Allow-Headers` enumerates (FR-001a).
    Default `Content-Type, X-CSRF-Token`.
  The CORS middleware and the CSRF middleware have NO
  escape-hatch toggle — there is no documented operator use
  case for disabling either control, and removing the toggle
  removes the foot-gun. The companion headers
  `X-Content-Type-Options` and `Referrer-Policy` are hard-on.
  Every key is documented in `.env.example` with a default
  value and a one-line description (FR-020).

### Key Entities

This feature introduces **no new persisted entities**. The CSRF token
is a property of the existing Redis-backed session record owned by
`specs/004-user-auth/spec.md`. The CORS allow-list, CSP policy, and
companion-header toggles are in-memory configuration loaded from
`.env` at startup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can change `CORS_ALLOWED_ORIGINS`,
  `CSP_POLICY`, `CSP_REPORT_ONLY`, or `HSTS_ENABLED` by editing
  `.env` and restarting the app — no source change is required.
  The four keys are the complete hardening `.env` surface
  (per FR-022); no other hardening-related keys exist.
- **SC-002**: A cross-origin browser request from an origin NOT on
  the allow-list is rejected by the API with `HTTP 403 Forbidden`
  and a `Access-Control-Allow-Origin` header that does NOT echo the
  disallowed origin. (Verified end-to-end with a non-allow-listed
  origin in browser dev tools.)
- **SC-003**: A preflight `OPTIONS` request from an allowed origin
  succeeds; the response `Access-Control-Allow-Methods` echoes the
  requested method, `Access-Control-Allow-Headers` echoes the
  requested headers, and `Access-Control-Allow-Credentials: true`
  is present.
- **SC-004**: A state-changing API request (`POST` / `PUT` / `PATCH`
  / `DELETE`) without a matching `csrfToken` cookie +
  `X-CSRF-Token` header pair is rejected with `HTTP 403 Forbidden`
  and `{ "error": "csrf" }`. The same request from the React UI
  (which sends both) succeeds.
- **SC-005**: Every HTTP response from the application carries
  `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and
  `Referrer-Policy: strict-origin-when-cross-origin`. Production
  responses additionally carry
  `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
- **SC-006**: A stored XSS vector injected into a persisted text
  field is rendered as inert text in the browser — no script
  executes — and the browser dev-tools console reports the CSP
  violation as a backstop (defense-in-depth).
- **SC-007**: A unit-test suite covering the allow-list matcher, the
  CSP builder, the CSRF token compare, and the dev-vs-prod posture
  switch passes with 100% line coverage of the hardening helpers.
- **SC-008**: The `.env.example` file lists every hardening-related
  key with a default value and a one-line description. An operator
  with no prior context can configure hardening by reading
  `.env.example` alone.
- **SC-009**: The application refuses to start (or refuses to serve a
  request) when a required hardening configuration key is missing —
  there is no permissive fall-through path.
- **SC-010**: All four hardening controls (CORS, CSP, CSRF, XSS) are
  independently testable. Removing or disabling one does not
  silently disable the others.
- **SC-011** (per Clarifications Session 2026-06-21, Q1, amended by
  Q6): A triggered CSRF rejection and a triggered CORS
  rejection each produce exactly one structured log line on
  stdout, with `event` set to `csrf_rejected` / `cors_rejected`
  respectively, and neither log line contains the session
  cookie value, the CSRF token value, or the request body.
  The log lines are visible in `docker compose logs` (or the
  equivalent stdout capture) without any additional
  configuration. CSP report-only violations are observed in
  the browser dev-tools console (per Q6); no server-side log
  line is produced for them.
- **SC-012** (per Clarifications Session 2026-06-21, Q4): A
  preflight `OPTIONS` response from an allowed origin carries
  `Access-Control-Allow-Headers: Content-Type, X-CSRF-Token`
  verbatim. A cross-origin browser request that includes the
  `X-CSRF-Token` request header is NOT silently stripped by
  the browser before reaching the API (verified end-to-end
  via browser dev tools: the request as sent by the browser
  contains the header).
- **SC-013** (per Clarifications Session 2026-06-21, Q5): The
  helper at `lib/security/csrf-client.ts` returns the value
  of the `csrfToken` cookie when one is present, returns
  `null` (or an equivalent empty value) when none is
  present (e.g., before login), and is the **only** place
  in the React codebase that reads `document.cookie` for
  CSRF purposes. The helper is covered by at least one
  unit test per branch.

## Assumptions

- **Same-origin in production.** The React UI runs on the same
  origin as the API in production. CORS is therefore
  defense-in-depth for misconfigured browsers, not the primary
  request path; the primary path is same-origin. The allow-list
  exists for the documented cases where the UI is hosted on a
  different origin (e.g., staging, multi-domain rollout).
- **Comma-separated env lists.** The CORS allow-list is
  comma-separated; whitespace trimming is the loader's
  responsibility. (A future feature may extend the loader to JSON
  arrays; this spec does not require it.)
- **CSRF token shape.** The CSRF token is opaque (cryptographically
  random, ≥ 128 bits) and is bound to the session. The exact
  random-source and encoding are decided in `plan.md`; the spec
  pins the property, not the implementation.
- **Ant Design style injection.** The shipped CSP allows
  `style-src 'self' 'unsafe-inline'` because Ant Design's runtime
  injects styles inline; the relaxation is documented in the
  response-header comment inside the configuration loader (per the
  constitution's note about Tailwind JIT and Ant Design style
  injection). Stage 2 ships no inline `<script>`, so `script-src`
  has no analogous relaxation.
- **No rich-text fields.** The Stage 2 surface has no user-authored
  HTML (teachers' names, classes' descriptions, etc., are plain
  text). A sanitisation library like DOMPurify is therefore
  unnecessary in Stage 2 and is not introduced; the input-validation
  + output-encoding + CSP triple is sufficient.
- **Local-dev HTTP posture.** `NODE_ENV=development` relaxes the
  `Secure` cookie flag and the HSTS header. The mechanism is
  environment-driven; an operator who needs HTTPS in dev sets
  `NODE_ENV=production` and provisions TLS at the reverse proxy
  (out of Stage 2 scope per constitution).
- **`.env` is JSON.** Per `CLAUDE.md` → Environment, the repo-level
  `.env` is JSON (model configuration only) and MUST NOT be used as
  application runtime configuration. The hardening knobs in this
  feature live in a Next.js-style dotenv file (the application's own
  `.env.local` / `.env`, separate from the coding-agent harness's
  JSON `.env`).
- **Cross-feature updates.** Updating the React UI in `001-teachers`
  and `002-classes` to send the CSRF header (per FR-019) is
  authorised by this spec and is the explicit dependency on the
  earlier features. The plan phase will produce the precise edit
  list; the spec pins the contract.
