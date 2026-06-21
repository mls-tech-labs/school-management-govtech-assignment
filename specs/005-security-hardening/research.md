# Research: Security Hardening (005-security-hardening)

**Date**: 2026-06-21
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)

This document is the Phase 0 research output for the security
hardening feature. It resolves every implementation-level
question left open in `spec.md` (including the three questions
added by the Clarifications session — Q4 CORS preflight
allowed-headers, Q5 CSRF client-side acquisition, Q6 CSP
report-only posture) and records the implementation choices,
the alternatives that were rejected, and the rationale.

The decisions here are grouped by the **decision point** they
resolve. Each entry is **Decision · Rationale · Alternatives
considered**, in that order, so the spec-level requirement and
the implementation-level answer are traceable in one read.

The feature **does not introduce any new persisted entities**
(spec FR-016) and **does not introduce any new endpoints**
(spec FR-017). The "data-model" surface is therefore a single
paragraph (see [`./data-model.md`](./data-model.md)) and the
"contracts" surface is a single shared security contract (see
[`./contracts/security.yaml`](./contracts/security.yaml)). All
the interesting decisions are about **where each control lives**
and **how the React UI learns the CSRF token**.

---

## 1. Where each control is wired

**Decision**:

| Control | Wire-up location | Why |
|---|---|---|
| **CSP**, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` | `next.config.mjs` → `headers()` function | These are static per-response headers; they don't need to read the request. The framework-level `headers()` function is the canonical Next.js place for this, runs on every response (including the static pages), and is centrally reviewed in one file. |
| **CORS** (preflight + allow-list check) | `middleware.ts` at the repo root + the helper `lib/security/cors.ts` | CORS needs to read the request's `Origin` header and respond to the preflight `OPTIONS` request before the route handler runs. Next.js `middleware.ts` runs on every matching request before the route handler — this is exactly the layer CORS belongs to. The route handler is not involved. |
| **CSRF** (token mint/verify, exempt-list bypass) | `middleware.ts` + the helper `lib/security/csrf.ts` | CSRF needs to read the request's cookies (`csrfToken`) and headers (`X-CSRF-Token`), compare them, and reject before the route handler runs. Same layering as CORS. The auth middleware (004's `withAuth`) runs INSIDE the route handler after CSRF passes — the auth middleware is the inner layer; CSRF is the outer layer. |
| **CSRF token client-side acquisition** | `lib/security/csrf-client.ts` (React-side helper) | The React UI must populate the `X-CSRF-Token` header from the non-`HttpOnly` `csrfToken` cookie. A single helper at `lib/security/csrf-client.ts` is the **only** call site that reads `document.cookie` for CSRF purposes (spec FR-019a). |
| **Structured security-event logging** | `lib/security/log.ts` (one emitter per event) | One function per `event` value (`cors_rejected`, `csrf_rejected`) — no logger package, no new dependency. The existing logger used by 004 (server-side stdout, JSON line per event) is reused unchanged. |
| **Configuration loading** | The existing `lib/config.ts` (inherited from Stage 1) + the new keys added in this feature | No new config loader. The 5 new `.env` keys (`CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_HEADERS`, `CSP_POLICY`, `CSP_REPORT_ONLY`, `HSTS_ENABLED`) are parsed once at module init and exported as plain `string | boolean` constants from `lib/config.ts`. |

**Rationale**: Next.js 15 has two distinct places to add
behavior that touches every request: `middleware.ts` (request
pre-processing) and `next.config.mjs → headers()` (static
response headers). Picking the right one for each control
keeps the wiring simple:

- **Static per-response headers** (CSP, XCTO, RP, HSTS) need
  no request context; they go in `next.config.mjs` because
  that's the single reviewed file for "what does every
  response look like".
- **Request-context behavior** (CORS, CSRF) needs to read the
  incoming request and short-circuit before the handler; they
  go in `middleware.ts` because that's where Next.js runs
  pre-handler code on a per-request basis.

The auth middleware (from 004) lives INSIDE the route handler
via `withAuth(handler)` — this is the third layer. The full
chain on a state-changing protected request is:

```
middleware.ts (CORS) → middleware.ts (CSRF) → withAuth (auth) → route handler
```

Each layer is the single source of truth for its concern; no
layer does another layer's job. The order is important: a
preflight from a non-allow-listed origin never reaches CSRF
(because CORS short-circuits with `403`); a state-changing
request without a session is rejected by the auth middleware
(because CSRF is configured to skip when no session is
present — the cookie is the binding key, and no session means
no CSRF cookie to compare against).

**Alternatives considered**:

- **Put CORS and CSRF inside `withAuth` (route-level)** —
  rejected. Per-route wrapping is what 004's auth middleware
  uses because the boundary is per-handler. CORS and CSRF
  must run for `/api/v1.0/*` regardless of which handler is
  invoked, including the preflight `OPTIONS` request that
  has no handler. `middleware.ts` is the right layer for
  cross-cutting pre-handler concerns.
- **Use the `cors` npm package** — rejected. A hand-rolled
  allow-list matcher is ~15 lines (split + trim + lowercase
  + `Set.has`), has no dependency, and is unit-testable in
  isolation. The `cors` package would add a dependency for
  zero functional gain.
- **Use the `csurf` npm package** — rejected. `csurf` is
  deprecated upstream (its maintainers recommend custom
  implementations or third-party rewrites), and the
  double-submit-cookie pattern is simple enough that a
  hand-rolled verifier (`constantTimeEqual(cookie, header)`)
  is shorter than the `csurf` API surface.
- **Use a Next.js plugin (`next-secure`, `next-security`)** —
  rejected. These plugins bundle headers + CORS + CSRF +
  HSTS in one config but they don't expose the constant-time
  CSRF compare or the structured-log emitter we need, and
  they would couple the security posture to a third-party
  release schedule. A hand-rolled set of helpers in
  `lib/security/*` is the smallest surface that satisfies
  the spec exactly.

---

## 2. CORS allow-list matcher (resolves spec FR-001, FR-002)

**Decision**: pure-function `matchOrigin(origin, allowedList)`
in `lib/security/cors.ts`:

```ts
// Sketch — not the final implementation.
export function matchOrigin(
  origin: string | null,
  allowedCsv: string,
): boolean {
  if (origin === null) return false;     // reject Origin: null
  if (origin === '') return false;        // reject missing origin
  const normalized = origin.toLowerCase();
  const allowed = new Set(
    allowedCsv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  );
  return allowed.has(normalized);
}
```

Plus a `corsMiddleware(req, res, next)` factory that:

1. Reads `req.headers.origin`.
2. If `origin` is missing AND the request is not a
   preflight, lets the request through (a same-origin
   request from a non-browser client has no `Origin`
   header; that's fine).
3. If `origin` is missing AND the request IS a preflight,
   responds `403` (a preflight without an `Origin` is
   malformed).
4. If `origin` is NOT on the allow-list, responds `403`
   with no `Access-Control-Allow-Origin` echo (the
   disallowed origin MUST NOT be echoed per FR-002).
5. If `origin` IS on the allow-list:
   - For a preflight (`OPTIONS`): responds `204` with
     `Access-Control-Allow-Origin: <origin>`,
     `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD`,
     `Access-Control-Allow-Headers: <CORS_ALLOWED_HEADERS>`,
     `Access-Control-Allow-Credentials: true`,
     `Vary: Origin`.
   - For a non-preflight: sets
     `Access-Control-Allow-Origin: <origin>`,
     `Access-Control-Allow-Credentials: true`,
     `Vary: Origin` on the response, then `next()`.

**Rationale**:

- **Exact match, not prefix or wildcard** — FR-001 mandates
  an explicit allow-list. A wildcard (`*`) is forbidden with
  credentials (FR-002); a suffix match (e.g., `*.example.com`)
  is a known foot-gun because an attacker who registers
  `evilexample.com` bypasses the check.
- **Lowercase comparison** — origins are case-insensitive
  per RFC 6454 §4. The `.env` file is a deployment artifact
  and may have inconsistent casing; normalizing at match
  time is the safe direction.
- **Whitespace trim** — the `CORS_ALLOWED_ORIGINS` value is
  comma-separated; operators sometimes accidentally add a
  trailing space. Trimming at parse time keeps the loader
  forgiving.
- **`Vary: Origin` on every response** — required for HTTP
  caches to key correctly on the `Origin` header. Without
  `Vary: Origin`, a CDN cache could serve one origin's CORS
  headers to a different origin's request.
- **`Set` for membership check** — O(1) lookup; the allow-list
  is typically a single-digit number of entries so the
  constant factor is irrelevant, but `Set` reads more clearly
  than `.includes()`.

**Alternatives considered**:

- **Use the WHATWG URL parser** (`new URL(origin).origin`)
  to canonicalize — rejected. The check is on the literal
  `Origin` header value the browser sent; parsing
  introduces a normalization layer that could mask real
  differences (e.g., `http://Example.com:80/` vs
  `http://example.com/`). The exact-match-on-lowercased
  form is what the CORS spec (Fetch §3.2.2) effectively
  does.
- **Suffix match (e.g., `https://*.example.com`)** —
  rejected. Same foot-gun as the wildcard.
- **Glob match (`minimatch`)** — rejected. Adds a
  dependency for a feature we don't need; exact match
  suffices.

---

## 3. CSRF token crypto source and storage (resolves spec FR-007, FR-019a)

**Decision**:

- **Token source**: `crypto.randomBytes(32).toString('base64url')`
  — same source as the session token in 004 (research §3 of
  [`../004-user-auth/research.md`](../004-user-auth/research.md#3-session-token-generation-resolves-spec-fr-016)).
  256 bits of CSPRNG entropy, URL-safe base64 without
  padding (43 characters).
- **Storage location**: the session record in Redis. The
  CSRF token is added to the existing `SessionRecord` type
  from 004 as a new `csrfToken: string` field. The Redis
  key shape becomes `session:<sessionId>` →
  `{ userId, ulid, createdAt, csrfToken }`. The TTL is
  unchanged (hard 30 minutes).
- **Cookie**: non-`HttpOnly` cookie named `csrfToken`, set
  by the login handler (004) when the session is created.
  Cookie attributes:

  | Attribute | Value |
  |---|---|
  | `Name` | `csrfToken` |
  | `Value` | the 43-char `base64url` token |
  | `Path` | `/` |
  | `Domain` | not set (host-only) |
  | `Max-Age` | `1800` (matches `SESSION_TTL_SECONDS`) |
  | `HttpOnly` | `false` (so the React UI can read it) |
  | `Secure` | env-driven (same env var as the session cookie: `SESSION_COOKIE_SECURE`, default `NODE_ENV === 'production'`) |
  | `SameSite` | `Strict` (defense-in-depth; the double-submit cookie is the primary defence, but SameSite=Strict is the spec's documented posture for both cookies) |
- **Rotation**: the CSRF token is rotated whenever the
  session is rotated (i.e., on every successful login). The
  pre-seeded CSRF token, if any, is invalidated alongside
  the session it was bound to — defense against session
  fixation extends naturally (per spec FR-007 + Edge Cases).

**Rationale**:

- **Same crypto source as the session token** — the
  CSRF token doesn't need to be unguessable on its own
  (the security of the double-submit pattern comes from
  the attacker not being able to read the cookie), but
  using the same source keeps the codebase uniform and
  the security property the same as the session token's.
- **Stored in the session record, not a separate key** —
  the CSRF token has no meaning outside the session it
  binds to. Putting it in the same Redis record means the
  session TTL cleans up the CSRF token automatically — no
  separate GC, no risk of orphaned CSRF tokens.
- **Cleared on logout** — the `POST /api/v1.0/logout`
  handler (owned by 004) is amended to set
  `Set-Cookie: csrfToken=; Max-Age=0; Path=/; ...` in
  addition to clearing the session cookie. This is the
  "deferred to plan" item from the clarify session's
  Coverage Summary.

**Alternatives considered**:

- **Separate Redis key namespace for CSRF tokens** (e.g.,
  `csrf:<sessionId>`) — rejected. Adds a second lookup
  per request (CSRF middleware does
  `GET session:<sid>` AND `GET csrf:<sid>`) for no
  functional gain. The CSRF token lives where it
  semantically belongs.
- **HMAC the token with a server secret** — rejected.
  The token doesn't carry information; the cookie /
  header comparison is the security property. HMAC would
  add a dependency on a secret key + a `crypto.createHmac`
  call per request.
- **Sync CSRF token with the session ID** — rejected.
  Using the session ID as the CSRF token would mean an
  attacker who somehow learns the session ID (e.g.,
  through a logging leak) could forge the CSRF header.
  Independent tokens mean a session-ID compromise does
  not automatically compromise CSRF.

---

## 4. CSRF middleware (resolves spec FR-006, FR-008)

**Decision**: a `csrfMiddleware(req, res, next)` factory in
`lib/security/csrf.ts`:

1. **Method gate** — if the request method is `GET`,
   `HEAD`, or `OPTIONS`, skip the check and `next()`
   (safe methods are exempt per FR-006).
2. **Route gate (exempt list)** — if the request path
   matches the exempt list, skip the check and `next()`:
   - `POST /api/v1.0/login`
   - `POST /api/v1.0/logout`
   - `GET /api/v1.0/me` (a GET, but listed explicitly for
     defensive clarity)
3. **Cookie + header read** — read `csrfToken` from
   `req.cookies`; read `X-CSRF-Token` from `req.headers`.
   If either is missing, respond `403` with
   `{ "error": "csrf" }` and emit a `csrf_rejected` log
   line.
4. **Constant-time compare** — use
   `crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header))`
   to compare. If lengths differ, fall back to a
   deliberately-slow comparison that always returns `false`
   (so the time variance doesn't leak length information).
5. **Accept or reject** — on match, `next()`; on mismatch,
   respond `403` with `{ "error": "csrf" }` and emit a
   `csrf_rejected` log line.

**Rationale**:

- **Constant-time compare** — defensive against timing
  side-channels (the same defence 004 applies to the
  session token). The CSRF token is high-entropy so timing
  attacks are unlikely in practice, but constant-time
  compare is the established pattern and is two lines
  long.
- **Exempt list, not config** — FR-008 names the three
  routes explicitly; making it config-driven would invite
  the foot-gun of "I disabled CSRF on my route". The
  hard-coded list is the documented contract.
- **`error: "csrf"` discriminator** — matches the
  cross-cutting `{ "error": "..." }` envelope from 003.
  Reuses the same status-code-table handling as 004.

**Alternatives considered**:

- **Synchronizer Token Pattern** (server stores the token,
  the form includes it as a hidden input) — rejected. The
  React SPA doesn't have an HTML form to put the hidden
  input in; the cookie-based double-submit is the
  natural fit for an SPA. The spec calls out double-submit
  explicitly.
- **Custom request header (no token, just presence)** —
  rejected. A header that's always present (e.g.,
  `X-Requested-By: react`) doesn't actually verify
  anything; an attacker can set any header. The token
  value is the security property.

---

## 5. CSRF client-side helper (resolves spec FR-019a)

**Decision**: `lib/security/csrf-client.ts` exports one
function:

```ts
// Sketch — not the final implementation.
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null; // SSR safety
  const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Used in exactly one place: the `fetch` wrapper that issues
state-changing requests (per spec FR-019 + FR-019a). The
wrapper reads the token and sets
`X-CSRF-Token: <token>` on the request. The helper is
unit-tested in isolation (per spec SC-013).

**Rationale**:

- **One helper, one place to read `document.cookie`** —
  if the cookie name ever rotates (e.g., to
  `__Host-csrfToken`), only the helper changes. Per
  spec FR-019a, the helper is the **only** call site that
  reads `document.cookie` for CSRF purposes.
- **SSR-safe (`typeof document === 'undefined'`)** —
  React Server Components (the default for any code path
  that runs on the server) don't have a `document`. The
  helper returns `null` on the server; the request is
  only issued from the client (state-changing fetch
  wrappers are client components).
- **Single regex match** — simpler than splitting on
  `;` and iterating; the regex is anchored to the start
  of the cookie string or after `; `, which matches the
  shape `document.cookie` produces.

**Alternatives considered**:

- **Pass the CSRF token via React Context** — rejected.
  The cookie is already there; reading it from
  `document.cookie` is one line. Adding a Context means
  the login response has to write the token into
  context, the layout has to read it, every fetch
  wrapper has to read it again — three sources of truth
  (cookie, context, header). One source of truth is
  simpler.
- **`js-cookie` npm package** — rejected. Adds a
  dependency for a 5-line regex.

---

## 6. CSP and companion headers (resolves spec FR-003, FR-004, FR-005)

**Decision**:

- The static per-response headers (CSP,
  `X-Content-Type-Options`, `Referrer-Policy`,
  `Strict-Transport-Security`) are emitted by
  `next.config.mjs` → `headers()`. The CSP value is
  computed by `buildCspHeader(policy, reportOnly)` in
  `lib/security/headers.ts` so it can be unit-tested.
- The shipped CSP policy is the value from FR-003:
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  ```
- `CSP_REPORT_ONLY=true` switches the header name from
  `Content-Security-Policy` to
  `Content-Security-Policy-Report-Only`. The policy value
  is unchanged.
- `HSTS_ENABLED` defaults to `true` when
  `NODE_ENV === 'production'`, `false` otherwise
  (per spec FR-005 / FR-014). The header is suppressed
  entirely in dev.
- No `report-uri` / `report-to` directive is ever
  emitted (per Clarifications Q6 — see spec Edge Cases
  and FR-003).

**Rationale**:

- **`next.config.mjs` is the single place where the
  security posture is centralised** (per the constitution
  Technical Stack Constraints). Reviewing one diff in
  one file confirms the security posture.
- **Helper functions in `lib/security/headers.ts`** —
  the CSP string and the HSTS conditional are pure
  functions that take the config and return the header
  value. They are unit-testable (per spec FR-015 /
  SC-007) without booting a Next.js server.

**Alternatives considered**:

- **Dynamic CSP per route** — rejected. Stage 2 has no
  per-route CSP needs; the same policy applies to every
  response. A future feature can split if needed.
- **Nonce-based inline scripts** — explicitly out of
  Stage 2 scope per the constitution Principle IX §2. The
  policy ships without `'unsafe-inline'` in `script-src`
  (the only relaxation is in `style-src`, documented in
  the constitution as the Ant Design / Tailwind JIT
  exception).

---

## 7. Structured security-event logging (resolves spec FR-021)

**Decision**:

- `lib/security/log.ts` exports one function per event
  type:
  - `logCorsRejection(req, reason)`
  - `logCsrfRejection(req, reason)`
- Each function emits **exactly one** structured JSON line
  to stdout (using the same logger pattern 004 uses for
  login / logout events). The line shape is:

  ```json
  {"event":"csrf_rejected","method":"POST","path":"/api/v1.0/teachers","reason":"missing_csrf_header","timestamp":"2026-06-21T..."}
  ```

- **Mandatory fields**: `event`, `method`, `path`,
  `reason`, `timestamp`.
- **Optional fields**: `origin` (for CORS / CSRF — the
  value of the `Origin` header, if present).
- **Never included**: the session cookie value, the
  CSRF token value, the request body, the response
  body, the `Authorization` header, any password / hash
  / salt.

**Rationale**:

- **One function per event type** — the call site reads
  as `logCsrfRejection(req, 'missing_csrf_header')`,
  which is self-documenting; the function itself is the
  single place where the JSON shape is defined.
- **No new logger dependency** — 004 already uses a
  trivial `console.log(JSON.stringify(...))` pattern
  (or a thin wrapper around `pino` if 004 added it).
  The same pattern is reused.
- **No new persistence** — stdout only. Per spec
  FR-021, there is no `security_events` table and no
  new file destination.

**Alternatives considered**:

- **`pino` or `winston`** — rejected. 004 doesn't use
  them; introducing a logger dependency for two event
  types is overkill.
- **Per-event file destination (e.g.,
  `logs/security.log`)** — rejected. The spec pins
  stdout (FR-021); a file destination is a deployment
  concern outside the spec.

---

## 8. Helpers inventory and unit-test map

Per spec FR-015 and SC-007, every helper below has at
least one unit test covering the happy path and one
covering each rejection path.

| Helper | File | Pure function? | Tests in |
|---|---|---|---|
| `matchOrigin(origin, allowedCsv)` | `lib/security/cors.ts` | yes | `tests/unit/security/cors.spec.ts` |
| `buildCorsHeaders(origin, allowedHeaders, req)` | `lib/security/cors.ts` | yes | `tests/unit/security/cors.spec.ts` |
| `mintCsrfToken()` | `lib/security/csrf.ts` | yes (uses `crypto.randomBytes`) | `tests/unit/security/csrf.spec.ts` |
| `compareCsrfTokens(cookie, header)` | `lib/security/csrf.ts` | yes | `tests/unit/security/csrf.spec.ts` |
| `buildCspHeader(policy, reportOnly)` | `lib/security/headers.ts` | yes | `tests/unit/security/headers.spec.ts` |
| `buildCompanionHeaders(nodeEnv, hstsEnabled)` | `lib/security/headers.ts` | yes | `tests/unit/security/headers.spec.ts` |
| `logCorsRejection(req, reason)` | `lib/security/log.ts` | side-effecting (stdout) — tested via stdout spy | `tests/unit/security/log.spec.ts` |
| `logCsrfRejection(req, reason)` | `lib/security/log.ts` | side-effecting — tested via stdout spy | `tests/unit/security/log.spec.ts` |
| `getCsrfToken()` | `lib/security/csrf-client.ts` | depends on `document` — tested via JSDOM stub | `tests/unit/security/csrf-client.spec.ts` |

---

## 9. Backwards-compatibility surface for 001 / 002 / 004

This feature consumes 004's `SessionRecord` type (adds
`csrfToken`) and 004's login / logout handlers (login
mints the CSRF token, logout clears both cookies). The
amendment to 004 is **additive**:

| 004 file | Amendment |
|---|---|
| `lib/auth/session.ts` | Add `csrfToken: string` to the `SessionRecord` interface. Update the Redis `set` call to include it. |
| `lib/auth/cookie.ts` | Add a `setCsrfCookie(res, token, options)` helper and a `clearCsrfCookie(res, options)` helper. The session cookie logic is unchanged. |
| `app/api/v1.0/login/route.ts` | After the successful argon2id verify, mint a CSRF token and call `setCsrfCookie`. Update `setSessionCookie` to share the same `Secure`-driven options. |
| `app/api/v1.0/logout/route.ts` | Add `clearCsrfCookie(res, options)` alongside the existing `clearSessionCookie`. |
| `lib/auth/route-guard.tsx` | No change (the route guard checks `GET /api/v1.0/me` for `200`; it does not need the CSRF token). |

The amendment to 001 / 002 (the consumer features) is
**purely on the React side**: the `fetch` wrapper for
state-changing calls must be updated to send
`X-CSRF-Token`. The server-side route handlers do not
change. The list of files to edit is enumerated in
[`./plan.md`](./plan.md) §"Cross-feature updates".

---

## 10. Configuration loading

The 5 new `.env` keys are parsed by the existing
`lib/config.ts` (inherited from Stage 1). The values
are exposed as exported constants:

```ts
// lib/config.ts (additions — sketch)
export const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ?? '';
export const CORS_ALLOWED_HEADERS = process.env.CORS_ALLOWED_HEADERS ?? 'Content-Type, X-CSRF-Token';
export const CSP_POLICY = process.env.CSP_POLICY ?? '<the shipped restrictive policy>';
export const CSP_REPORT_ONLY = (process.env.CSP_REPORT_ONLY ?? 'false').toLowerCase() === 'true';
export const HSTS_ENABLED = process.env.HSTS_ENABLED !== undefined
  ? process.env.HSTS_ENABLED.toLowerCase() === 'true'
  : process.env.NODE_ENV === 'production';
```

`.env.example` is updated to add the five keys with their
defaults and a one-line description each (per spec FR-020).
The runtime fails closed on missing required keys
(`CORS_ALLOWED_ORIGINS` empty means the CORS middleware
rejects every cross-origin request per spec FR-013).

**Rationale**: no new config loader, no new validation
library, no new schema. The existing pattern (parse
`.env` once at module init, export as constants) is the
smallest viable surface.

---

## 11. Things explicitly NOT in this feature (out of scope guards)

Per the constitution Stage Scope → Stage 2 Out of Scope
block and spec FR-016 + FR-017:

- **No new MySQL tables** (the CSRF token lives in Redis
  alongside the session, per FR-016 + research §3).
- **No new endpoints** (no `report-uri` collector, no
  CSP report endpoint, per FR-017 + Clarifications Q6).
- **No new npm dependencies** (`cors`, `csurf`,
  `js-cookie` were all rejected in favour of
  hand-rolled helpers; see §1, §4, §5).
- **No MFA, OAuth, password reset, self-registration,
  account lockout, rate limiting beyond Joi** (Stage 2
  out of scope per constitution).
- **No COOP / CORP / COEP** (Stage 2 out of scope; the
  Constitution Sync Impact Report's
  `TODO(CRP_INTERPRETATION)` flags this as a future
  amendment).
- **No DOMPurify / sanitisation library** (no rich-text
  fields in Stage 2; the input-validation +
  output-encoding + CSP triple is sufficient per
  constitution Principle IX §4).

---

## 12. References

- Spec: [`./spec.md`](./spec.md) — FR-001..FR-022, SC-001..SC-013, Clarifications Session 2026-06-21 Q1..Q6.
- Constitution: [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — Principles II (TypeScript), III (Unit tests), IV (auth boundary), VII (Joi), IX (Security & Hardening).
- Stage 1 contracts: [`../003-backend-api-db/contracts/common.yaml`](../003-backend-api-db/contracts/common.yaml) — the error envelope `{ "error": "..." }` and the status-code table.
- Stage 2 auth: [`../004-user-auth/research.md`](../004-user-auth/research.md) — the `SessionRecord` shape and the session-token crypto source (reused for CSRF token per research §3).
