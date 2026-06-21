# Feature Specification: User Authentication

**Feature Branch**: `004-user-auth`
**Created**: 2026-06-21
**Status**: Draft
**Input**: User description: "create a new spec on authentication page in this application. MUST only have simple page with user name field and password field and login button only"

## Related specs & Constitutional alignment

**Constitutional alignment.** This spec implements the **authentication
feature** of constitution v2.4.0 Stage 2 In Scope and is authorised
by:

- **Principle IV (Single Role: Authenticated Administrator)** — the
  session-based authentication boundary that this spec introduces.
- **Principle IX (Security & Hardening)** — the CORS, CSP, CSRF, and
  XSS posture this spec is built against. The auth middleware, the
  session cookie attributes, and the React route-guard component are
  the application-side consumers of this principle. The four
  hardening controls themselves are **out of this feature's scope**
  and are owned by a future `specs/005-security-hardening/spec.md`
  (per Clarifications Session 2026-06-21 round 1, Q1); 004 ships
  the auth feature only. The cross-cutting CSRF posture means the
  protected endpoints added by 004 (the existing
  `/api/v1.0/teachers`, `/api/v1.0/classes`, `/api/v1.0/subjects`,
  `/api/v1.0/levels` endpoints become protected once 004 ships)
  are not yet protected against CSRF between 004 and 005; this is
  acceptable because 005 is expected to land before any
  state-changing API request from a real browser.
- **Stage Scope — Stage 2 In Scope — Authentication feature** block.

The pre-amendment draft of this spec referenced a "Constitutional Note
(gate before planning)" describing the gap between Stage 1 and the
auth feature. That note is now **superseded** — the v2.4.0 amendment
closes the gap and this section replaces it as the in-spec pointer to
the constitutional authorisation.

**Related specs** (cross-cutting consumers / dependencies):

- `specs/003-backend-api-db/spec.md` — cross-cutting contract owner:
  error envelope (`{ "error": "..." }`), status-code table (this spec
  adds `401` for "no valid session"; `400 / 404 / 409 / 415 / 500 /
  503` continue to apply), content-type rule, and the
  `/api/v1.0/*` version-prefix rule (FR-022) that the three auth
  endpoints in this feature are now part of (per Clarification
  Session 2026-06-21 — versioned-path propagation below).
- `specs/001-teachers/spec.md` — consumer of the auth boundary: every
  endpoint it owns (`POST /api/v1.0/teachers`, `GET /api/v1.0/teachers`,
  `GET /api/v1.0/subjects`) becomes a protected endpoint that requires
  a valid session cookie once this feature ships. The existing
  pagination, ULID, and audit-column posture are unchanged.
- `specs/002-classes/spec.md` — same posture as 001: every endpoint
  it owns (`POST /api/v1.0/classes`, `GET /api/v1.0/classes`,
  `GET /api/v1.0/levels`) becomes a protected endpoint. The existing
  ULID, audit-column, and form-teacher uniqueness posture are
  unchanged.

**Cross-cutting rules inherited from 003 + CLAUDE.md** (no overrides;
the same rules apply to the new `users` table and the auth feature's
endpoints): ULID column FR-021, audit columns FR-018, surrogate id
FR-019, error envelope FR-012, `Content-Type: application/json`
requirement FR-010, no-migrations FR-016, Joi validation FR-007.

## Clarifications

### Session 2026-06-21 (capture)

The decisions captured here are the ones that would otherwise be left
as `[NEEDS CLARIFICATION]` markers in the spec. They were taken from the
user's natural-language description in the `/speckit-specify` invocation
and from the project's existing conventions (constitution v2.4.0 +
CLAUDE.md cross-cutting rules).

- **Q1: Login page UI scope.** → A: The login page is a single page
  with **three elements only**: a `username` text input, a `password`
  text input, and a `Log in` button. No "remember me", no "forgot
  password" link, no sign-up link, no branding surface beyond what is
  required to render the form. This matches the user requirement
  "MUST only have simple page with user name field and password field
  and login button only".
- **Q2: Server-side session store.** → A: **Redis**, run in a
  separate Docker container (the user runs it independently of the
  application). Sessions are stored as opaque `sessionId → userId`
  records with a **30-minute TTL** (hard expiry, no sliding
  extension). The TTL is set on session creation; it is not refreshed
  on every authenticated request.
- **Q3: User provisioning for Stage 2.** → A: **SQL-seeded** initial
  administrator account(s). The user inserts the `users` rows manually
  using the schema provided in this spec (see Key Entities). There is
  no sign-up endpoint, no admin "create user" endpoint, and no
  password-reset endpoint in this feature. Admin authoring of
  additional user records is out of scope and is a future-stage
  feature (per YAGNI / Principle V).
- **Q4: Password storage.** → A: The `password` column stores a
  cryptographically-salted password hash; the `salt` column stores the
  salt. The exact hashing algorithm (PBKDF2, scrypt, argon2, bcrypt,
  etc.), iteration count, and salt-generation strategy are
  implementation choices and are decided in `plan.md`. The Stage 2
  contract is the column shape only — `password VARCHAR(255) NOT NULL`
  and `salt VARCHAR(255) NOT NULL`. The plaintext password never
  reaches storage and never appears in logs or error messages.
- **Q5: Session cookie attributes.** → A: The session cookie is set
  with `HttpOnly`, `Secure` (HTTPS-only; the local-dev HTTP case is
  decided in `plan.md`), and `SameSite=Strict` to match the user's
  stated requirement. The cookie name, `Path`, and `Domain` are
  decided in `plan.md`.
- **Q6: Public-exception list for the auth middleware.** → A:
  `POST /api/v1.0/login`, `GET /api/v1.0/me`, and
  `POST /api/v1.0/logout` are exempt from the auth middleware.
  The login endpoint must be reachable without a session so the
  visitor can obtain one. The `/me` endpoint is the session-
  introspection handshake; the middleware lets it through and the
  handler itself returns `401` if the session is missing or
  invalid. The logout endpoint is exempt by idempotency — it MUST
  return HTTP `200 OK` and clear the session cookie even when no
  session is present (per FR-007), so a stale cookie on the
  browser can always be cleared by a single logout call. All other
  `/api/v1.0/*` endpoints (including the Stage 1
  `/api/v1.0/teachers`, `/api/v1.0/classes`, `/api/v1.0/subjects`,
  `/api/v1.0/levels` endpoints, which become protected by this
  feature on deploy) require a valid session.

### Session 2026-06-21 (versioned-path propagation)

- **Q1: Version prefix for the three auth endpoints.** → A:
  The three auth endpoints are exposed at the **versioned** paths
  `POST /api/v1.0/login`, `POST /api/v1.0/logout`, `GET /api/v1.0/me`
  (per `003-backend-api-db` Clarification Session 2026-06-21, Q1).
  The previous Q6 capture (which assumed unversioned paths and an
  FR-022 exemption) is superseded; the cross-cutting propagation
  block below, the FR-006..FR-008 path declarations, the FR-011
  exempt list, and the Assumptions block are updated to match.
  `005-security-hardening/spec.md` FR-008 / FR-018 are also updated
  to reference the versioned paths.

### Session 2026-06-21 (cross-cutting propagation)

The constitution v2.4.0 + CLAUDE.md cross-cutting rules apply to this
spec with one extension (the version-prefix exemption for the three
auth endpoints, see above) and no overrides. Principle IX
(Security & Hardening) of the constitution is the application-side
counterpart to this spec; the auth feature implements the
authentication half, and the four hardening controls (CORS, CSP,
CSRF, XSS) are applied at the HTTP boundary in `next.config.mjs`
and a single CSRF-middleware module that this spec does not
introduce as a new file (the requirement is the behaviour, not the
file layout, which `plan.md` decides):

- **ULID column (FR-021)**: the new `users` table carries
  `ulid CHAR(26) UNIQUE NOT NULL`. Generated server-side by the
  `ulid` npm package via a typeORM `@BeforeInsert()` hook.
- **Audit columns (FR-018)**: the `users` table carries
  `created_at`, `created_by`, `modified_at`, `modified_by`, and
  `version`. `created_by` / `modified_by` are set to `'admin'` for
  SQL-seeded rows.
- **Surrogate id (FR-019)**: the `users` table has
  `id BIGINT UNSIGNED AUTO_INCREMENT` as the PK. The Stage 2 API
  responses do **not** expose `id` (consistent with the teachers /
  classes posture in 001 / 002).
- **API version prefix (FR-022)**: the three authentication endpoints
  in this feature are exposed at the versioned paths
  `/api/v1.0/login`, `/api/v1.0/logout`, `/api/v1.0/me` — they are
  NOT exempt from the `/api/v1.0/` prefix rule (per
  `003-backend-api-db` Clarification Session 2026-06-21, Q1;
  this updates the original Q6 capture that assumed unversioned
  paths). The Stage 1 `/api/v1.0/teachers`, `/api/v1.0/classes`,
  `/api/v1.0/subjects`, `/api/v1.0/levels` endpoints continue to
  use the versioned prefix and become protected endpoints once
  this feature ships (per FR-011).
- **Migrations out of Stage 2 (FR-016)**: the `users` table is
  created by the user with their own SQL against the user-prepared
  MySQL container. The application MUST NOT run a typeORM migration
  on boot. No migration file or `migration:run` step is added for this
  feature.
- **Frontend stack**: the login page and route-guard components are
  composed from **Ant Design (`antd`)** primitives styled with
  **Tailwind CSS** utility classes, consistent with constitution
  v2.4.0 (replacing SGDS v3 per the 2026-06-19 amendment).
- **Validation**: Joi validates the `POST /api/v1.0/login` request body
  (constitution Principle VII) — `username` (string, required, length
  bounded to the column constraint) and `password` (string, required,
  non-empty). The Joi schema for the login body is the source of
  truth; the typeORM entity mirrors it field-for-field.
- **Functional-first (Principle VI)**: route handlers, middleware,
  password-verification, and session-store helpers are written as
  small modules of pure functions. Classes appear only where the
  framework mandates them (typeORM entity).

### Session 2026-06-21 (clarification round 1)

This block records the answers captured during the
`/speckit-clarify` invocation that followed the constitution v2.4.0
amendment. Each answer is mirrored into the spec body (Functional
Requirements, Key Entities, Success Criteria, Assumptions, or Related
specs block as appropriate) and is the canonical record.

- **Q1: Scope of this feature vs. separate hardening feature.** → A:
  This feature (`004-user-auth`) ships the **authentication feature
  only**. The four Principle IX hardening controls (CORS allow-list,
  CSP header, double-submit CSRF token, XSS posture) are **deferred
  to a future `005-security-hardening` spec** and are explicitly
  OUT of this feature's scope. The cross-cutting propagation block
  above records this split. The pre-`005` window — between 004
  shipping and 005 shipping — is acceptable because (a) the
  application is internal-admin and (b) no real browser-driven
  state-changing request happens before 005 lands.
- **Q2: User provisioning mechanism.** → A: Ship a
  `npm run seed:admin` helper command (functional requirement
  FR-026) that takes a username + plaintext password, runs them
  through the project's standard password-hashing helper, and
  prints the resulting `INSERT INTO users (...)` SQL for the user
  to pipe into `mysql`. This keeps the hash format in lockstep
  with the verification path (no risk of algorithm / parameter
  mismatch), is reproducible, and is unit-testable. The script
  refuses to run without an explicit `--confirm` flag.
- **Q3: Login observability.** → A: Every `POST /api/v1.0/login` and
  every `POST /api/v1.0/logout` request emits exactly one structured
  log entry (per FR-027 and FR-028). Success and failure are both
  logged; the server-side log distinguishes `"unknown_user"`,
  `"wrong_password"`, `"inactive_user"`, `"validation_error"`,
  and `"internal_error"` reasons even though the client only sees
  the generic `"Invalid username or password"` envelope. The
  password, hash, salt, and full session cookie value are NEVER
  logged.
- **Q4: Session fixation prevention.** → A: On successful
  `POST /api/v1.0/login`, the server MUST mint a fresh, opaque
  sessionId and overwrite any pre-existing session cookie the
  client may have sent (per FR-006). The pre-existing sessionId
  (if any) is removed from Redis. This is the standard OWASP
  defence against session fixation — an attacker who pre-seeds a
  victim's cookie cannot ride the session after the victim logs
  in, because the cookie value the attacker knew no longer maps
  to any session in Redis.
- **Q5: Post-logout URL preservation.** → A: Always redirect to
  `/login` on logout — the originally-requested URL is NOT
  preserved across logout. After a fresh login following a
  logout, the visitor lands on the post-login default page (the
  same default used on a clean `GET /` → `/login` → login flow),
  not on the page they were viewing when they logged out. This
  matches the user's stated scope for the login page ("MUST only
  have simple page with username and password fields and login
  button only") and avoids the additional complexity of a
  logout-time URL capture + persistence mechanism.

## User Scenarios & Testing *(mandatory)*

The "user" in this feature is the **administrator** of the
application — the single role already defined by Principle IV — who
must prove their identity before they can use the application. The
scenarios below describe the journey from "unauthenticated visitor
who cannot see anything" to "authenticated administrator who can use
the app" and back to "unauthenticated visitor who can no longer see
anything".

### User Story 1 - Reach the Login Page (Priority: P1)

An unauthenticated visitor who navigates to any page of the
application is presented with the login page. The page contains
exactly three elements: a username input, a password input, and a
"Log in" button.

**Why this priority**: Without a reachable login page, no other part
of this feature is testable end-to-end. This is the entry point of
the authentication flow.

**Independent Test**: Can be fully tested by loading any URL of the
application while no session cookie is set and verifying that the
page that is rendered is the login page containing exactly the three
elements listed above.

**Acceptance Scenarios**:

1. **Given** no session cookie is set on the visitor's browser,
   **When** the visitor navigates to the application root, **Then**
   the login page is rendered with a `username` input, a `password`
   input, and a `Log in` button, and no other interactive elements.
2. **Given** no session cookie is set on the visitor's browser,
   **When** the visitor navigates to any private URL of the
   application, **Then** the visitor is redirected to the login page.
3. **Given** the login page is rendered, **When** the visitor views
   the page source, **Then** the page does not contain a "Sign up",
   "Register", "Forgot password", or "Remember me" control.

---

### User Story 2 - Log In with Valid Credentials (Priority: P1)

An unauthenticated visitor who enters a valid username and password
on the login page and clicks "Log in" is authenticated. The server
creates a server-side session, returns a session cookie to the
browser, and the browser is taken to the page the visitor originally
intended to visit (or to a sensible default).

**Why this priority**: This is the core value the feature delivers —
the administrator can actually use the application. Without a
working login, the application is unreachable.

**Independent Test**: Can be fully tested by (a) inserting one valid
user row via SQL, (b) loading the login page in a browser, (c)
entering that user's username and password, (d) clicking "Log in",
and (e) verifying that a session cookie is set on the browser and
that the browser is no longer on the login page.

**Acceptance Scenarios**:

1. **Given** a user exists with `username = "admin"` and
   `password = "<the salted hash of 'correct horse battery staple'>"`
   and `active = true`, **When** the visitor submits the login form
   with `username = "admin"` and `password = "correct horse battery
   staple"`, **Then** the server returns HTTP `200 OK`, sets a
   session cookie on the response, and the browser is no longer on
   the login page.
2. **Given** the visitor just logged in successfully, **When** the
   browser reloads any page of the application, **Then** the page
   loads normally (no redirect to login, no `401` error).
3. **Given** the visitor just logged in successfully, **When** the
   browser calls any protected `/api/*` endpoint, **Then** the
   request succeeds (the session cookie is attached automatically
   by the browser and the server accepts it).

---

### User Story 3 - Reject Invalid Credentials (Priority: P1)

An unauthenticated visitor who enters an unknown username, an
inactive username, or a username paired with the wrong password is
shown a meaningful error message on the login page and is **not**
authenticated.

**Why this priority**: The login endpoint must not leak which
credential was wrong (username vs password) and must not let an
attacker enumerate valid usernames; this is the security floor of
the feature.

**Independent Test**: Can be fully tested by attempting to log in
with each of (a) an unknown username, (b) a known username with the
wrong password, (c) a known username whose `active = false`, and
verifying that all three attempts are rejected with the same generic
error message and that no session cookie is set on the response.

**Acceptance Scenarios**:

1. **Given** no user exists with `username = "nobody"`, **When** the
   visitor submits the login form with `username = "nobody"` and any
   non-empty password, **Then** the server returns HTTP `401
   Unauthorized` with a generic error message ("Invalid username or
   password"), no session cookie is set, and the login form is
   re-displayed with the password field cleared.
2. **Given** a user exists with `username = "admin"` and a known
   password, **When** the visitor submits the login form with
   `username = "admin"` and the wrong password, **Then** the server
   returns HTTP `401 Unauthorized` with the same generic error
   message, no session cookie is set, and the login form is
   re-displayed with the password field cleared.
3. **Given** a user exists with `username = "disabled"` and
   `active = false`, **When** the visitor submits the login form
   with that username and any password, **Then** the server returns
   HTTP `401 Unauthorized` with the same generic error message, no
   session cookie is set, and the login form is re-displayed with
   the password field cleared.
4. **Given** the visitor submits the login form with a missing or
   empty `username` or `password`, **When** the request is
   processed, **Then** the server returns HTTP `400 Bad Request` with
   a field-level error message; no session is created and no cookie
   is set.

---

### User Story 4 - Inspect the Current Session (Priority: P1)

The frontend needs to know, on page load, whether the visitor is
already logged in. The browser calls `GET /api/v1.0/me`; if a session
cookie is present and valid, the server returns the user profile;
otherwise the server returns HTTP `401 Unauthorized` so the
frontend can redirect to the login page.

**Why this priority**: Without `GET /api/v1.0/me`, the React route guard
on page boot has no way to know whether to render the protected
page or redirect to `/login`. This is the bootstrap handshake.

**Independent Test**: Can be fully tested by (a) calling
`GET /api/v1.0/me` without any session cookie and verifying the response
is `401`, then (b) logging in to obtain a session cookie, then (c)
calling `GET /api/v1.0/me` again with the cookie and verifying the
response is `200` with the user profile.

**Acceptance Scenarios**:

1. **Given** no session cookie is set on the browser, **When** the
   browser calls `GET /api/v1.0/me`, **Then** the server returns HTTP
   `401 Unauthorized` with the agreed error envelope and no body.
2. **Given** a session cookie that maps to a live user is set on the
   browser, **When** the browser calls `GET /api/v1.0/me`, **Then** the
   server returns HTTP `200 OK` with the user profile (see FR-009 for
   the response shape).
3. **Given** a session cookie that does not map to any live session
   in Redis (e.g., expired, never existed, manually deleted), **When**
   the browser calls `GET /api/v1.0/me`, **Then** the server returns HTTP
   `401 Unauthorized` (the same response as the "no cookie" case).

---

### User Story 5 - Log Out (Priority: P2)

An authenticated visitor can log out, which destroys the server-side
session and clears the session cookie from the browser. After
logout, the browser is unconditionally navigated to `/login`. The
originally-requested URL is **not** preserved across logout — a
logout-then-relogin lands the visitor on the post-login default
page, not on the page they were viewing when they logged out (per
Clarifications Session 2026-06-21 round 1, Q5).

**Why this priority**: Logout is essential for shared devices and for
principle-of-least-privilege (an administrator who steps away from
the terminal should be able to end their session). It is P2 because
the system is functional and demonstrably secure without it
(cookies expire on TTL; the administrator can clear their own
cookies).

**Independent Test**: Can be fully tested by (a) logging in, (b)
calling `POST /api/v1.0/logout`, and (c) verifying that the same session
cookie is now rejected by the next protected request, and (d)
verifying that the browser is on `/login` (not on the originally
visited private page).

**Acceptance Scenarios**:

1. **Given** the visitor is logged in (a session cookie is set),
   **When** the visitor calls `POST /api/v1.0/logout`, **Then** the
   server deletes the session record from Redis, returns HTTP
   `200 OK` with an empty success body, and sets a `Set-Cookie`
   header that clears the session cookie on the browser.
2. **Given** the visitor has just logged out, **When** the browser
   calls any protected `/api/*` endpoint, **Then** the server
   returns HTTP `401 Unauthorized`.
3. **Given** no session cookie is set on the browser, **When** the
   visitor calls `POST /api/v1.0/logout`, **Then** the server returns
   HTTP `200 OK` (logout is idempotent — it succeeds even if there
   was no session to destroy).
4. **Given** the visitor was on a private page (e.g., `/teachers`)
   when they triggered logout, **When** the logout completes,
   **Then** the browser is on `/login`, NOT on `/teachers` — the
   original URL is dropped (per Clarifications Session 2026-06-21
   round 1, Q5).

---

### User Story 6 - React Route Guard (Priority: P1)

The frontend wraps every private page in a guard component that
checks the session state before rendering. The guard calls
`GET /api/v1.0/me` on mount; if the response is `200`, the private page
renders; if the response is `401`, the visitor is redirected to the
login page.

**Why this priority**: Without route guards, the URL bar is the only
authentication boundary — typing `/teachers` in the URL would render
the page regardless of session state. Route guards close that hole.

**Independent Test**: Can be fully tested by (a) opening a private
page directly via URL while no session cookie is set and verifying
that the URL bar ends up on `/login`, and (b) opening the same page
while a valid session cookie is set and verifying that the page
renders.

**Acceptance Scenarios**:

1. **Given** no session cookie is set, **When** the visitor
   navigates to a private URL, **Then** the route guard calls
   `GET /api/v1.0/me`, receives `401`, and redirects the browser to the
   login page.
2. **Given** a valid session cookie is set, **When** the visitor
   navigates to a private URL, **Then** the route guard calls
   `GET /api/v1.0/me`, receives `200`, and renders the private page.
3. **Given** a valid session cookie is set, **When** the visitor
   logs out from any page, **Then** the application navigates to
   the login page and any subsequent navigation to a private URL
   redirects back to login.

---

### Edge Cases

- **What happens when the Redis container is unreachable?** The
  middleware cannot validate the session; the protected request MUST
  be rejected with HTTP `503 Service Unavailable` and the agreed
  error envelope (the same response used elsewhere for transient
  infrastructure failures). The `GET /api/v1.0/me` and `POST /api/v1.0/logout`
  endpoints are protected endpoints and follow the same rule.
- **What happens when Redis is reachable but returns an error
  (e.g., connection drop mid-request)?** The middleware MUST treat
  this the same as "session not found" — return HTTP `401
  Unauthorized` for protected endpoints — so the failure mode is
  indistinguishable from a missing session. Surface-level
  information about Redis errors MUST NOT leak in the response body
  or logs.
- **What happens when the request `Content-Type` for `POST /api/v1.0/login`
  is not `application/json`?** The request MUST be rejected with
  HTTP `415 Unsupported Media Type` and the agreed error envelope
  (consistent with the cross-cutting contract in FR-013 of the
  003-backend-api-db spec).
- **What happens when the visitor submits the login form with
  extra unknown fields (e.g., a stray `rememberMe` from a future
  build)?** Joi MUST reject the request with HTTP `400 Bad
  Request` and a field-level error; unknown fields are not silently
  ignored at the trust boundary (consistent with Principle VII).
- **What happens when the visitor submits the login form with the
  `username` longer than `VARCHAR(64)`?** Joi MUST reject the
  request with HTTP `400 Bad Request` and a field-level length
  error before any database lookup is performed.
- **What happens when the same session cookie is presented from two
  different browsers / IPs?** Both requests are independently
  authenticated. Stage 2 does not bind a session to a client IP or
  user-agent (those are documented as hardening options for a
  future stage, not part of the current contract).
- **What happens when a session is destroyed on the server (Redis
  eviction, manual `DEL`) but the browser still presents the
  cookie?** The middleware MUST treat this as a missing session and
  return HTTP `401 Unauthorized`. The browser MAY then be redirected
  to the login page by the route guard.
- **What happens at the 30-minute TTL boundary while the visitor is
  actively using the application?** The session expires
  **immediately** at 30 minutes (hard TTL, no sliding extension).
  The next protected request returns HTTP `401 Unauthorized`. The
  route guard catches this and redirects to the login page. The
  visitor must log in again. (Sliding-TTL extension is a documented
  future-stage option; see Assumptions.)
- **What happens when the user table is empty (no admin seeded)?**
  Every `POST /api/v1.0/login` returns HTTP `401 Unauthorized` because
  there is no user whose credentials match. This is the expected
  initial state until the user runs the seed SQL.
- **What happens when the session cookie value is well-formed but
  has never been seen by the server (e.g., a forged or copied
  cookie)?** The middleware MUST treat this as a missing session and
  return HTTP `401 Unauthorized`. The sessionId lookup is opaque —
  the server MUST NOT trust any client-supplied session metadata.
- **What happens when an attacker pre-seeds a victim's browser
  with a known session cookie value (classic session-fixation
  attempt) before the victim logs in?** Per FR-006 and
  Clarifications Session 2026-06-21 round 1, Q4, the server mints a
  fresh sessionId on successful login and removes the pre-seeded
  sessionId from Redis. The attacker's cookie is now invalid
  (`401 Unauthorized`); the victim's browser holds the new
  cookie. The pre-seed value the attacker knew is destroyed before
  it can be used.

## Requirements *(mandatory)*

### Functional Requirements

#### Login page (frontend)

- **FR-001**: The application MUST expose a single login page at the
  path `/login` (the exact path is decided in `plan.md`; this spec
  fixes only that `/login` is reachable from any other URL).
- **FR-002**: The login page MUST render exactly three interactive
  elements: a `username` text input, a `password` text input, and a
  `Log in` submit button. No additional controls are rendered (no
  "remember me", no "forgot password" link, no sign-up link, no
  third-party SSO button, no branding surface beyond the form
  chrome).
- **FR-003**: The login page MUST submit its form to `POST /api/v1.0/login`
  as `application/json` (the request body is a JSON object with
  `username` and `password` keys).
- **FR-004**: On a successful login (HTTP `200 OK`), the login page
  MUST navigate the browser away from `/login` to either (a) the URL
  the visitor originally tried to reach, or (b) a sensible default
  page (the default page is decided in `plan.md`; `/` is the
  recommended default).
- **FR-005**: On a failed login (HTTP `401 Unauthorized`), the login
  page MUST display a single, generic error message ("Invalid
  username or password") without distinguishing between the
  "unknown username", "wrong password", and "inactive user" cases,
  and MUST clear the `password` field.

#### Backend endpoints

- **FR-006**: The application MUST expose `POST /api/v1.0/login`
  (versioned path per FR-022 — `/api/v1.0/login`, not `/api/login`).
  Behaviour:
  - Request body: `{ "username": string, "password": string }`. Both
    fields are required, non-empty, and length-bounded to the column
    constraints (`username ≤ 64` chars per the schema below).
  - On success: HTTP `200 OK`, an empty body (the session cookie is
    set on the response — there is no payload to return), and a
    `Set-Cookie` header carrying the session cookie. The server
    **MUST mint a fresh, opaque sessionId** (per FR-016) for the
    new session and write a new Redis key under it — the server
    MUST NOT reuse any sessionId the client may have sent on the
    request. If a pre-existing session cookie was sent, the
    `Set-Cookie` overwrites it with the new value; the
    pre-existing sessionId (if any) is removed from Redis to
    prevent it from being used as a backdoor (per
    Clarifications Session 2026-06-21 round 1, Q4 — session
    fixation prevention).
  - On failure: HTTP `401 Unauthorized` for invalid credentials
    (unknown username, wrong password, inactive user) — the response
    body MUST be the agreed error envelope
    `{ "error": "Invalid username or password" }` and MUST NOT set a
    session cookie.
  - On validation failure: HTTP `400 Bad Request` with a field-level
    error envelope (missing field, wrong type, length exceeded).
  - On wrong content type: HTTP `415 Unsupported Media Type` with
    the agreed error envelope.
- **FR-007**: The application MUST expose `POST /api/v1.0/logout`
  (versioned path per FR-022). Behaviour:
  - On success: HTTP `200 OK`, an empty body, and a `Set-Cookie`
    header that clears the session cookie on the browser. The
    server MUST delete the session record from Redis.
  - On no-session: HTTP `200 OK` (logout is idempotent — no error is
    returned if the visitor was not logged in).
- **FR-008**: The application MUST expose `GET /api/v1.0/me` (versioned
  path per FR-022). Behaviour:
  - On valid session: HTTP `200 OK` with the user profile as a JSON
    object (see FR-009 for the response shape).
  - On missing or invalid session: HTTP `401 Unauthorized` with the
    agreed error envelope.
- **FR-009**: The `GET /api/v1.0/me` response body MUST contain the
  following user-profile fields and MUST NOT contain any other
  field:
  - `username` (string).
  - `active` (boolean).
  - `ulid` (string, 26-character Crockford Base32 — the
    frontend-stable handle, per FR-021 of the cross-cutting rules).
  - `createdAt` (string, ISO-8601 timestamp with microsecond
    precision, derived from `created_at`).
  Audit columns `id`, `created_by`, `modified_at`, `modified_by`,
  and `version` are not exposed (per FR-020 cross-cutting rule,
  consistent with the teachers / classes posture).

#### Backend auth middleware

- **FR-010**: The application MUST run an authentication middleware
  in front of every `/api/*` request whose path is **not** in the
  exempt list in FR-011.
- **FR-011**: The middleware exempt list is exactly:
  - `POST /api/v1.0/login` — the login endpoint itself; the visitor
    cannot be required to present a session cookie to obtain one.
  - `GET /api/v1.0/me` — the session-introspection endpoint; the visitor
    cannot be required to present a session cookie to ask whether
    they have one.
  - `POST /api/v1.0/logout` — the logout endpoint; exempt because
    logout must be idempotent and return HTTP `200 OK` even when no
    session is present, so the browser's stale session cookie can be
    cleared (per FR-007 — "On no-session: HTTP `200 OK` (logout is
    idempotent — no error is returned if the visitor was not logged
    in)"). The handler runs even when `withAuth` would otherwise
    reject the request, so the `Set-Cookie` clearing header is
    always emitted on a logout request.
  No other endpoint is exempt. The Stage 1 `/api/v1.0/teachers`,
  `/api/v1.0/classes`, `/api/v1.0/subjects`, `/api/v1.0/levels`
  endpoints (owned by the 001 / 002 specs) and every future
  `/api/v1.0/*` endpoint are protected by default once this feature ships.
- **FR-012**: For every protected request, the middleware MUST:
  1. Read the session cookie from the request (the cookie name is
     decided in `plan.md`; this spec fixes only that a single,
     specific cookie name is used and that the cookie value is
     opaque).
  2. Look up the cookie value in Redis (the key shape is decided in
     `plan.md`; this spec fixes only that a missing key means
     "unauthenticated").
  3. On a successful lookup, attach the resolved user identity to
     the request object so the downstream route handler can read it
     without a second Redis round-trip, and call `next()`.
  4. On any other outcome (no cookie, empty cookie, unknown cookie,
     Redis error) return HTTP `401 Unauthorized` with the agreed
     error envelope and do not call `next()`.
- **FR-013**: The middleware MUST NOT distinguish between "missing
  cookie", "unknown cookie", and "expired cookie" in its response —
  every unauthenticated case returns HTTP `401 Unauthorized` with
  the same error envelope. This is a deliberate security property:
  the response MUST NOT allow an attacker to enumerate valid
  session cookies by probing the endpoint.

#### Session storage

- **FR-014**: Sessions MUST be stored in Redis (separate Docker
  container, run by the user, connection details provided via the
  application's runtime configuration). Each session record is a
  mapping from the session cookie value to the resolved user
  identity (the user `id` and `ulid`); the user `id` is the join
  key for the application and the `ulid` is exposed to the
  frontend per FR-009.
- **FR-015**: Every session record MUST carry a **30-minute TTL**,
  set on session creation. The TTL is **not** extended on every
  authenticated request (hard expiry; see Edge Cases and
  Assumptions).
- **FR-016**: The session cookie value MUST be a cryptographically
  random, unguessable token of at least 128 bits of entropy (the
  exact generation algorithm is decided in `plan.md` — `crypto.randomUUID()`
  from Node's standard library is the recommended default). The
  token MUST be opaque to the client; the client MUST NOT be able
  to extract user information from the cookie value.
- **FR-017**: The session cookie MUST be set with `HttpOnly`, `Secure`
  (HTTPS-only in production; the local-dev HTTP posture is decided
  in `plan.md`), and `SameSite=Strict`. The cookie `Path` is `/`;
  the cookie `Domain` is the application's host (cross-host
  scoping is out of scope for Stage 2).
- **FR-018**: The session cookie MUST be cleared on logout by
  returning a `Set-Cookie` header with an empty value, a past
  `Expires` date, and the same `Path` / `HttpOnly` / `Secure` /
  `SameSite` attributes as the original cookie (per RFC 6265).

#### Frontend route guard

- **FR-019**: The application MUST wrap every private page in a
  route-guard component that, on mount, calls `GET /api/v1.0/me`.
- **FR-020**: On a `200 OK` response from `GET /api/v1.0/me`, the guard
  MUST render the private page.
- **FR-021**: On a `401 Unauthorized` response from `GET /api/v1.0/me`,
  the guard MUST redirect the browser to `/login`, preserving the
  originally requested URL so the post-login navigation can return
  to it (the preservation mechanism is decided in `plan.md`).
- **FR-022**: The `/login` page MUST be reachable without a session
  cookie (it is intentionally outside the guard's protected set).

#### Data layer

- **FR-023**: The system MUST persist a `users` table in the
  user-prepared MySQL container with the columns and constraints
  defined in the Key Entities section below. The application MUST
  NOT run a typeORM migration on boot; the table is created by the
  user with their own SQL.
- **FR-024**: The `users` table MUST carry the audit columns
  `created_at`, `created_by`, `modified_at`, `modified_by`, and
  `version` (per the cross-cutting FR-018 rule).
- **FR-025**: The `users` table MUST carry a `ulid CHAR(26) UNIQUE
  NOT NULL` column (per the cross-cutting FR-021 rule), generated
  server-side by the `ulid` npm package in a typeORM
  `@BeforeInsert()` hook on the entity.

#### Provisioning tooling

- **FR-026**: The project MUST ship a `npm run seed:admin` command
  (or equivalent project-defined script) that takes a `username`
  and a plaintext `password` from the command line (or environment
  variables), runs them through the project's standard
  password-hashing helper (the same helper the application uses to
  verify a login — see Clarifications Session 2026-06-21 round 1,
  Q2), and prints the resulting `INSERT INTO users (...)` SQL
  statement to stdout for the user to pipe into the
  `mysql` client against the user-prepared MySQL container. The
  script MUST NOT touch the database directly; it is a
  hash-and-print helper. The script MUST refuse to run without an
  explicit `--confirm` flag (or equivalent) so an unattended
  `npm run seed:admin` invocation does not silently emit SQL.

#### Observability

- **FR-027**: Every `POST /api/v1.0/login` request MUST emit exactly one
  structured log entry whose fields are:
  - `event` = `"auth.login"` (literal string).
  - `outcome` = `"success"` or `"failure"`.
  - `username` = the submitted username (the raw submitted value;
    NOT a hash; failure log entries MAY be the raw submitted value
    too — username is not a secret).
  - `ip` = the client source IP from the request (the value used
    for the future per-IP rate-limit posture, even though rate
    limiting itself is out of Stage 2 scope — see Assumptions).
  - `timestamp` = ISO-8601 with millisecond precision.
  - On `"failure"`: a `reason` field with one of `"unknown_user"`,
    `"wrong_password"`, `"inactive_user"`, `"validation_error"`,
    or `"internal_error"` (the application MUST NOT leak which
    credential was wrong to the *client* per FR-006, but the
    *server-side log* distinguishes them so brute-force detection
    has the signal it needs).
  The log entry MUST NOT contain the submitted password, the
  stored hash, the stored salt, the session cookie value, or any
  other secret. The implementation MAY use the application's
  existing logger (the same logger used for the
  `/api/v1.0/teachers` route handlers in Stage 1).
- **FR-028**: Every `POST /api/v1.0/logout` request MUST emit exactly one
  structured log entry whose fields are:
  - `event` = `"auth.logout"`.
  - `sessionIdPrefix` = the first 8 characters of the destroyed
    sessionId (enough to correlate with the `auth.login` log
    entry; not the full token).
  - `ip` = the client source IP.
  - `timestamp` = ISO-8601 with millisecond precision.
  Idempotent logout (no session present, per FR-007) still emits
  the entry but with `sessionIdPrefix = null`.

### Key Entities *(include if feature involves data)*

- **User** (data store table: `users`). The single role is the
  existing Administrator role; this entity exists to hold
  credentials for that role, not to introduce a new role.
  - `id` (`BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`, primary key,
    per FR-019 cross-cutting rule — surrogate PK; not exposed in
    the Stage 2 API response).
  - `username` (`VARCHAR(64) NOT NULL`, **UNIQUE** — `uq_users_username`
    is the single lookup key used by the login endpoint).
  - `password` (`VARCHAR(255) NOT NULL`) — the cryptographically-salted
    password hash. Plaintext passwords never reach this column.
  - `salt` (`VARCHAR(255) NOT NULL`) — the per-user salt used when
    computing the hash stored in `password`. Both columns are
    populated together at seed time and are never updated
    individually after the row is inserted.
  - `active` (`BOOLEAN NOT NULL DEFAULT TRUE`) — a `false` value
    blocks login regardless of password correctness (see Edge Cases
    and FR-006).
  - `created_at` (`DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`)
    — per FR-018 cross-cutting rule.
  - `created_by` (`VARCHAR(64) NOT NULL DEFAULT 'system'`) — set to
    `'admin'` for SQL-seeded rows; per FR-018 cross-cutting rule.
  - `modified_at` (`DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6)`) — per FR-018 cross-cutting rule.
  - `modified_by` (`VARCHAR(64) NOT NULL DEFAULT 'system'`) — per
    FR-018 cross-cutting rule.
  - `version` (`INT NOT NULL DEFAULT 1`) — per FR-018 cross-cutting
    rule.
  - `ulid` (`CHAR(26) NOT NULL UNIQUE`) — per FR-021 cross-cutting
    rule; `uq_users_ulid` is the secondary lookup key. Exposed in
    the `GET /api/v1.0/me` response.
  - Integrity rules: `username` is unique; `ulid` is unique.
  - Relationship: none in Stage 2 — the `users` table is not
    referenced by any other table (no `created_by` / `modified_by`
    FK migration in this feature). A future stage MAY migrate the
    audit columns to FKs against `users.id`; that is out of Stage 2
    scope per Principle V (YAGNI).

- **Session** (Redis key, not a relational entity). A single
  session record is the lifecycle carrier for an authenticated
  visitor. The record carries:
  - The session token (the opaque cookie value, used as the Redis
    key).
  - The user `id` and `ulid` (the resolved user identity attached
    to the request by the middleware, per FR-012).
  - The 30-minute TTL, set on creation per FR-015.
  No other fields are persisted. The session record is opaque to
  the client.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An unauthenticated visitor can complete a successful
  login (open the login page, enter valid credentials, submit, end
  up on a non-login page) in under 10 seconds on a typical
  broadband connection.
- **SC-002**: 100% of unauthenticated attempts to reach any
  protected `/api/*` endpoint (any endpoint other than
  `POST /api/v1.0/login` and `GET /api/v1.0/me`) are rejected with HTTP
  `401 Unauthorized` and the agreed error envelope.
- **SC-003**: 100% of valid-credential `POST /api/v1.0/login` requests
  result in (a) a server-side session record in Redis with the
  30-minute TTL and (b) a `Set-Cookie` response header carrying the
  session cookie with `HttpOnly`, `Secure`, and `SameSite=Strict`.
- **SC-004**: 100% of invalid-credential `POST /api/v1.0/login` requests
  (unknown username, wrong password, inactive user) return HTTP
  `401 Unauthorized` with the same generic error message and set
  no session cookie.
- **SC-005**: 100% of `POST /api/v1.0/logout` requests destroy the
  matching session record in Redis and clear the session cookie on
  the browser (verified by sending the now-cleared cookie back on
  a subsequent protected request and observing HTTP `401`).
- **SC-006**: After 30 minutes of inactivity, 100% of session
  records in Redis have been expired by the server (verified by
  observing the key disappear from Redis) and 100% of subsequent
  requests bearing the corresponding cookie return HTTP `401`.
- **SC-007**: 100% of `GET /api/v1.0/me` responses with a valid session
  return HTTP `200 OK` with a body that contains exactly
  `{ username, active, ulid, createdAt }` and no other top-level
  fields.
- **SC-008**: 100% of unauthenticated direct navigations to a
  private URL (e.g., `/teachers`) result in the browser ending up
  on `/login` after the React route guard's `GET /api/v1.0/me` call
  returns `401`.
- **SC-009**: 100% of authenticated direct navigations to a private
  URL render the private page (the route guard's `GET /api/v1.0/me`
  returns `200` and the page mounts).
- **SC-010**: The Redis container is reachable in development (the
  user runs it on the documented port) and the application
  authenticates against it without any additional configuration
  beyond the runtime-supplied connection string. Failure modes are
  documented (see Edge Cases and Assumptions).
- **SC-011**: The `npm run seed:admin` command (FR-026) accepts a
  username + plaintext password, generates a hash + salt using the
  project's standard password-hashing helper, and prints a
  parameterised `INSERT INTO users (...)` statement to stdout that
  the user can pipe directly into `mysql`. The printed SQL, when
  executed against a fresh user-prepared MySQL container, produces
  a `users` row that successfully logs in via the running
  application (verified by a unit-test fixture + an integration
  test).
- **SC-012**: 100% of `POST /api/v1.0/login` requests produce exactly
  one structured log entry per FR-027 (success or failure, with
  reason), 100% of `POST /api/v1.0/logout` requests produce exactly
  one structured log entry per FR-028, and 100% of those entries
  are free of plaintext passwords, stored hashes, stored salts,
  and full session cookie values (verified by a
  never-leak-secrets log-scrub unit test).
- **SC-013**: 100% of successful `POST /api/v1.0/login` responses carry
  a `Set-Cookie` header whose value is a freshly-minted, opaque
  sessionId — verified by an end-to-end test that pre-seeds a
  known session cookie value on the request, submits valid
  credentials, and observes (a) the response carries a different
  `Set-Cookie` value, (b) the pre-seeded sessionId is no longer
  in Redis, and (c) a subsequent request bearing the pre-seeded
  cookie returns HTTP `401 Unauthorized`.

## Assumptions

- **Single role.** This feature does **not** introduce any new
  user role. The application continues to have exactly one role
  (Administrator), per Principle IV of constitution v2.4.0; this
  feature adds the session-based authentication boundary around
  that role. The single-role posture is unchanged from Stage 1.
- **User provisioning is SQL-seeded via the project helper.** The
  user runs `npm run seed:admin -- --confirm --username=<u>
  --password=<p>` to print a parameterised `INSERT INTO users (...)`
  statement; the user pipes the printed SQL into `mysql` against
  the user-prepared MySQL container (per Clarifications Session
  2026-06-21 round 1, Q2). There is no sign-up endpoint, no admin
  "create user" endpoint, and no password-reset endpoint in Stage 2.
  The hash + salt pair is generated using the project's standard
  password-hashing helper (the same helper the application uses to
  verify a login); the exact algorithm and parameters are fixed at
  plan time so the helper is reusable and testable.
- **Hard 30-minute TTL.** The session expires 30 minutes after it
  was created; it is **not** refreshed on every authenticated
  request. A sliding-TTL (auto-extending) policy is a documented
  future-stage option but is out of Stage 2 scope per Principle V
  (YAGNI) — the current 30-minute policy matches the user's stated
  requirement and is sufficient for an internal admin tool.
- **HTTP vs HTTPS in local development.** The `Secure` cookie
  attribute is set in production (HTTPS) and MAY be relaxed in
  local development (HTTP) via the runtime configuration. The
  decision is documented in `plan.md` so the deployment posture is
  not ambiguous.
- **Cross-cutting rules apply unchanged.** The FR-018, FR-019,
  FR-020, FR-021, FR-022, and FR-016 cross-cutting rules from
  CLAUDE.md and the constitution v2.4.0 apply to this feature
  with no overrides (per `003-backend-api-db` Clarification
  Session 2026-06-21, Q1, the three auth endpoints are now under
  the same `/api/v1.0/` prefix as the Stage 1 endpoints). The
  cross-cutting error envelope (`{ "error": "..." }`) and the
  400 / 401 / 415 / 500 / 503 status codes defined in the
  003-backend-api-db spec apply to the new endpoints in this
  feature as well (with 401 replacing the 404 case for
  "session not found").
- **Redis is run by the user.** The application does not start or
  manage the Redis container. The user runs Redis separately and
  provides the connection string via the runtime configuration
  (per the constitution's Technical Stack Constraints on
  configuration). The Redis container layout (single instance,
  sentinel, cluster) is the user's choice and is out of scope for
  this feature.
- **No new server-side dependencies are introduced beyond Redis and
  the existing Node.js standard library.** The exact npm packages
  used to talk to Redis (e.g., `ioredis`, `redis`) are decided in
  `plan.md`; the spec does not name them.
- **No new migrations.** The `users` table is created by the user
  with their own SQL against the user-prepared MySQL container.
  The application MUST NOT run a typeORM migration on boot (per
  FR-016 cross-cutting rule).
- **No frontend library swap.** The login page and route-guard
  components are composed from **Ant Design (`antd`)** primitives
  styled with **Tailwind CSS** utility classes, consistent with
  constitution v2.4.0. No new UI library is added; no styling
  solution outside the constitution is introduced.
- **Password hashing is decided in `plan.md`.** The Stage 2
  contract is the column shape (`password VARCHAR(255) NOT NULL`,
  `salt VARCHAR(255) NOT NULL`) and the security property (the
  plaintext password never reaches storage or logs). The specific
  algorithm (PBKDF2 / scrypt / argon2id / bcrypt), the iteration
  count, the salt length, and the helper module structure are
  implementation choices and are documented in `plan.md`.
- **The `created_by` / `modified_by` audit columns remain free-form
  strings.** Even after `users` exists, the audit columns on
  `teachers`, `classes`, `subjects`, and `levels` are not migrated
  to FKs against `users.id` in this feature. They continue to store
  `'admin'` or `'system'` as they do today. The FK migration is a
  documented future-stage option (Principle V — YAGNI).
- **All Stage 1 and Stage 2 endpoints share the `/api/v1.0/` prefix.**
  The three new auth endpoints are exposed at `/api/v1.0/login`,
  `/api/v1.0/logout`, and `/api/v1.0/me` (per
  `003-backend-api-db` Clarification Session 2026-06-21, Q1).
  No unversioned paths are used; FR-022 applies uniformly.
- **The `users` table has no relationship to `teachers` or
  `classes` in Stage 2.** The audit columns on those tables remain
  free-form strings. Linking audit columns to the `users` table is
  a future-stage amendment.
- **The login page is the only authentication UI in Stage 2.**
  There is no profile page, no "change password" page, no account
  management page. The only authentication-related UI is the
  three-element login form.
- **The cross-cutting API contract from `003-backend-api-db/spec.md`
  is reused for this feature** — the same error envelope, the same
  status code table (including `401` for the "no session" case —
  now a first-class row in 003's FR-013, per
  `003-backend-api-db` Clarification Session 2026-06-21, Q1),
  and the same `Content-Type: application/json` requirement.
- **Principle IX hardening is OUT of scope for this feature.** Per
  Clarifications Session 2026-06-21 round 1, Q1, the CORS allow-list,
  CSP header, double-submit CSRF token, and XSS posture are deferred
  to a future `005-security-hardening` spec. The auth middleware, the
  session cookie attributes, and the React route-guard component are
  application-side consumers of the eventual hardening (the
  `Secure` cookie flag is already environment-driven per Principle
  IV), but the four hardening controls themselves are added by 005.
  This split keeps 004 focused on the authentication surface and
  lets 005 own the cross-cutting security-headers configuration in
  `next.config.mjs`.