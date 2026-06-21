# Quickstart: Security Hardening (005-security-hardening)

**Date**: 2026-06-21
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)
**Data model**: [./data-model.md](./data-model.md)
**Contracts**: [./contracts/security.yaml](./contracts/security.yaml)

This document is the **runnable validation guide** for the
security hardening feature. It walks through every
measurable outcome in `spec.md` (SC-001..SC-013) and
provides the exact commands, the expected outputs, and the
failure-mode checks. The unit, contract, and integration
test suites cover the same surface programmatically; this
guide is the **manual / human-runnable companion** for
each scenario.

The feature requires the same prerequisites as Stage 1
and Stage 2 auth: a user-prepared MySQL container, a
user-managed (or `docker-compose`-managed) Redis
container, and the seeded `users` row from 004's
`npm run seed:admin` helper. See
[`../004-user-auth/quickstart.md`](../004-user-auth/quickstart.md)
for the auth prerequisite walkthrough.

---

## 0. Prerequisites

```bash
# 1. MySQL container running (user-prepared; per spec FR-016)
docker ps --filter "name=mysql" --format "{{.Names}}: {{.Status}}"

# 2. Redis container running (added by 004)
docker ps --filter "name=redis" --format "{{.Names}}: {{.Status}}"

# 3. Seeded admin user (from 004's seed helper)
npm run seed:admin -- --username admin --password 'ChangeMe!Now2026' --confirm

# 4. The application starts cleanly with the new hardening env keys
cp .env.example .env.local        # if not already done
# Edit .env.local — see §1 below for the minimal dev config.
npm run dev
```

The application MUST start without errors. The startup
check logs a warning if `CORS_ALLOWED_ORIGINS` is empty
(per spec FR-013 fail-closed posture; expected in dev).

---

## 1. The five `.env` keys (per spec FR-022)

Add the following to `.env.local`. Defaults are the
shipped safe defaults; for dev-on-localhost you typically
populate `CORS_ALLOWED_ORIGINS` so the React UI can call
the API.

```bash
# Leave empty for same-origin dev; populate with comma-separated
# origins for cross-origin (per spec FR-013 fail-closed posture).
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Comma-separated list of request header names the preflight's
# Access-Control-Allow-Headers enumerates (per spec FR-001a).
# Default: Content-Type, X-CSRF-Token.
CORS_ALLOWED_HEADERS=Content-Type, X-CSRF-Token

# Full Content-Security-Policy header value (per spec FR-003).
# Default: the shipped restrictive policy.
# CSP_POLICY=default-src 'self'; script-src 'self'; ...

# Switch the CSP header to Content-Security-Policy-Report-Only
# for audit rollouts (per spec FR-004). Default false.
CSP_REPORT_ONLY=false

# When false, the Strict-Transport-Security header is suppressed
# (per spec FR-005). Default true in NODE_ENV=production,
# default false in NODE_ENV=development.
HSTS_ENABLED=true
```

Restart the application after any change. There is no
hot-reload for `.env.local`.

---

## 2. Validation scenarios — SC-001 through SC-013

Each scenario is independent; you can run them in any
order. The labels in `(parentheses)` reference the spec
success criteria.

### SC-001 — `.env`-driven configuration (operator workflow)

Edit `.env.local`, change `CORS_ALLOWED_ORIGINS` from
`http://localhost:3000` to `http://localhost:4000`,
restart the app, and verify:

```bash
curl -i -X OPTIONS http://localhost:3000/api/v1.0/teachers \
  -H "Origin: http://localhost:4000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type, x-csrf-token"
```

Expected: `204 No Content` with
`Access-Control-Allow-Origin: http://localhost:4000` in
the response. Repeat with `Origin: http://localhost:5000`
— expected: `403 Forbidden` (the new origin is not on
the allow-list). Repeat with the old origin
`http://localhost:3000` — expected: `403 Forbidden`
(we changed the list, the old origin is gone). Change
back to `http://localhost:3000`, restart, confirm the
old behaviour returns.

The four keys (`CORS_ALLOWED_ORIGINS`, `CSP_POLICY`,
`CSP_REPORT_ONLY`, `HSTS_ENABLED`) plus
`CORS_ALLOWED_HEADERS` (added by Clarifications Q4) are
the complete hardening `.env` surface (per FR-022). No
other hardening keys exist.

### SC-002 — CORS rejects disallowed origins (browser simulation)

With `CORS_ALLOWED_ORIGINS=http://localhost:3000` and
the app running, simulate a browser request from a
disallowed origin:

```bash
curl -i http://localhost:3000/api/v1.0/subjects \
  -H "Origin: http://evil.example.com"
```

Expected: `HTTP/1.1 403 Forbidden` with **no**
`Access-Control-Allow-Origin` header echoing the
disallowed origin. The browser would block the response
at the CORS layer.

### SC-003 — CORS preflight from an allowed origin

```bash
curl -i -X OPTIONS http://localhost:3000/api/v1.0/teachers \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type, x-csrf-token"
```

Expected: `204 No Content` with:

- `Access-Control-Allow-Origin: http://localhost:3000`
- `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD`
- `Access-Control-Allow-Headers: Content-Type, X-CSRF-Token` (per FR-001a)
- `Access-Control-Allow-Credentials: true`
- `Vary: Origin`

### SC-004 — CSRF double-submit on state-changing requests

This scenario assumes you have a valid session (login
first — see 004's quickstart §2 for the login flow).

```bash
# 1. Login (CSRF-exempt per FR-008)
COOKIE_JAR=$(mktemp)
LOGIN_RESPONSE=$(curl -s -c "$COOKIE_JAR" -X POST \
  http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ChangeMe!Now2026"}')

# 2. POST WITHOUT X-CSRF-Token → expect 403 + {"error":"csrf"}
curl -i -b "$COOKIE_JAR" -X POST \
  http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"firstName":"A","lastName":"B","email":"a@b.c","contactNumber":"12345678","subjectId":"<ulid>","levelId":"<ulid>"}'
# Expected: HTTP/1.1 403 Forbidden
#           {"error":"csrf"}

# 3. POST WITH X-CSRF-Token (from the csrfToken cookie) → expect 201
CSRF=$(grep csrfToken "$COOKIE_JAR" | awk '{print $7}')
curl -i -b "$COOKIE_JAR" -X POST \
  http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"firstName":"A","lastName":"B","email":"a@b.c","contactNumber":"12345678","subjectId":"<ulid>","levelId":"<ulid>"}'
# Expected: HTTP/1.1 201 Created
#           {"ulid":"<26-char-ulid>","firstName":"A",...}

# 4. POST WITH mismatched X-CSRF-Token → expect 403 + {"error":"csrf"}
curl -i -b "$COOKIE_JAR" -X POST \
  http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: deliberately-wrong-token" \
  -d '{"firstName":"A","lastName":"B","email":"a@b.c","contactNumber":"12345678","subjectId":"<ulid>","levelId":"<ulid>"}'
# Expected: HTTP/1.1 403 Forbidden
#           {"error":"csrf"}
```

### SC-005 — Per-response security headers

```bash
curl -i http://localhost:3000/api/v1.0/subjects -H "Origin: http://localhost:3000"
```

Expected response headers (in addition to the CORS
headers from SC-003):

- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ...`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- (in `NODE_ENV=production`) `Strict-Transport-Security: max-age=63072000; includeSubDomains`

In `NODE_ENV=development`, the HSTS header is absent
(per FR-014).

### SC-006 — Stored XSS rendered as inert text

```bash
# 1. Create a teacher whose first name is a <script> payload
PAYLOAD='<script>alert(1)</script>'
ENCODED=$(node -e "console.log(encodeURIComponent('$PAYLOAD'))")
curl -b "$COOKIE_JAR" -X POST \
  http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"firstName\":\"$ENCODED\",\"lastName\":\"X\",\"email\":\"x@y.z\",\"contactNumber\":\"12345678\",\"subjectId\":\"<ulid>\",\"levelId\":\"<ulid>\"}"
# Expected: 201 Created — payload persisted as raw text (per FR-009)

# 2. Open the teacher list page in a browser
# Expected: the page renders the literal text
#           <script>alert(1)</script>
#           (NOT a script execution; no alert popup)
# The browser dev-tools console may report the CSP violation
# as a defense-in-depth backstop (CSP_REPORT_ONLY is not
# required for this — the inline <script> is blocked by
# script-src 'self' regardless).
```

### SC-007 — Unit tests for every hardening helper

```bash
npm run test:unit -- tests/unit/security/
```

Expected: every `tests/unit/security/*.spec.ts` file
passes with 100% line coverage of the corresponding
helper in `lib/security/`. The full inventory is in
[`./research.md` §8](./research.md#8-helpers-inventory-and-unit-test-map).

### SC-008 — `.env.example` documents every hardening key

```bash
grep -E '^CORS_ALLOWED_ORIGINS=|^CORS_ALLOWED_HEADERS=|^CSP_POLICY=|^CSP_REPORT_ONLY=|^HSTS_ENABLED=' .env.example
```

Expected: all five keys are present in `.env.example`,
each with a default value and a one-line comment
explaining the safe default, the expected format, and
any non-obvious constraint (per FR-020).

### SC-009 — Fail-closed on missing required configuration

```bash
# 1. Set CORS_ALLOWED_ORIGINS to an explicitly invalid value
sed -i 's/^CORS_ALLOWED_ORIGINS=.*/CORS_ALLOWED_ORIGINS=/' .env.local
# 2. Restart the app
npm run dev
# 3. Issue a cross-origin request
curl -i http://localhost:3000/api/v1.0/subjects -H "Origin: http://allowed.example.com"
# Expected: 403 Forbidden (the allow-list is empty, so the
# origin is rejected; the startup log shows a clear warning
# that CORS_ALLOWED_ORIGINS is empty).
```

A missing or empty `CORS_ALLOWED_ORIGINS` does NOT cause
a permissive fall-through (no wildcard). The application
serves but rejects every cross-origin request (per
FR-013). Same-origin requests (no `Origin` header) are
unaffected.

### SC-010 — Each control is independently testable

The four controls can be disabled / verified in isolation:

| Control | How to disable / verify in isolation |
|---|---|
| **CORS** | Set `CORS_ALLOWED_ORIGINS=` (empty) — every cross-origin request is rejected. Or populate `CORS_ALLOWED_ORIGINS=http://localhost:3000` to allow it. |
| **CSP** | Set `CSP_POLICY=` (empty) — the `Content-Security-Policy` header is omitted. Or `CSP_REPORT_ONLY=true` to switch to observe-only mode. |
| **CSRF** | Send a state-changing request with a wrong `X-CSRF-Token` — observe `403`. Or send without the header — observe `403`. The `GET /api/v1.0/subjects` endpoint does not require the header. |
| **XSS** | Submit a teacher with `<script>alert(1)</script>` in a name field — observe it persists as raw text and renders as inert text in the browser. |

Removing one control does NOT silently disable the
others.

### SC-011 — Structured security-event logging on stdout

Trigger a CSRF rejection:

```bash
curl -b "$COOKIE_JAR" -X POST \
  http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"firstName":"X","lastName":"Y","email":"x@y.z","contactNumber":"12345678","subjectId":"<ulid>","levelId":"<ulid>"}'
```

Expected stdout log line (visible in `docker compose logs`
or the equivalent stdout capture):

```json
{"event":"csrf_rejected","method":"POST","path":"/api/v1.0/teachers","reason":"missing_csrf_header","timestamp":"2026-06-21T..."}
```

Trigger a CORS rejection:

```bash
curl -i http://localhost:3000/api/v1.0/subjects -H "Origin: http://evil.example.com"
```

Expected stdout log line:

```json
{"event":"cors_rejected","method":"GET","path":"/api/v1.0/subjects","origin":"http://evil.example.com","reason":"origin_not_allowed","timestamp":"2026-06-21T..."}
```

Neither log line contains the session cookie value, the
CSRF token value, or the request body. CSP report-only
violations are observed in the browser dev-tools
console; no server-side log line is produced for them
(per Clarifications Q6).

### SC-012 — Preflight allowed-headers enumeration

```bash
curl -i -X OPTIONS http://localhost:3000/api/v1.0/teachers \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type, x-csrf-token"
```

Expected: the response includes
`Access-Control-Allow-Headers: Content-Type, X-CSRF-Token`
verbatim. A subsequent cross-origin request that includes
the `X-CSRF-Token` request header from the browser is
NOT silently stripped (verified end-to-end via the
browser dev-tools "Network" tab: the request as sent by
the browser contains the header).

### SC-013 — CSRF client-side helper testable in isolation

```bash
npm run test:unit -- tests/unit/security/csrf-client.spec.ts
```

Expected: the unit test asserts that `getCsrfToken()`
returns the value of the `csrfToken` cookie when one is
present, returns `null` when none is present, and is the
**only** call site in the codebase that reads
`document.cookie` for CSRF purposes:

```bash
grep -rn "document.cookie" app/ lib/ | grep -v csrf-client.ts
# Expected: no output (the helper is the only reader)
```

---

## 3. Cross-feature verification (per FR-019)

The React UI in `001-teachers` and `002-classes` MUST
send the `X-CSRF-Token` header on every state-changing
call. To verify:

1. Log in to the app.
2. Open the browser dev-tools "Network" tab.
3. Submit the create-teacher form.
4. Observe the request headers — `X-CSRF-Token` is
   present.
5. Submit the create-class form.
6. Observe `X-CSRF-Token` is present.

If `X-CSRF-Token` is absent on either form, the API
returns `403` + `{"error":"csrf"}`. The fix is to import
`getCsrfToken` from `lib/security/csrf-client` and add
`X-CSRF-Token: getCsrfToken() ?? ''` to the fetch
options.

---

## 4. Running the test suites

The three Vitest tiers map to the three depths of
verification:

| Tier | Command | Scope |
|---|---|---|
| **Unit** | `npm run test:unit` | Every helper in `lib/security/*` — no Next.js server, no MySQL, no Redis. |
| **Contract** | `npm run test:contract` | Full request lifecycle against a test Next.js server. |
| **Integration** | `npm run test:integration` | Real Next.js + real Redis containers. SC-001..SC-013 end-to-end. |

The contract and integration tiers require the MySQL
and Redis containers to be running (per §0).

---

## 5. Out of scope (do not validate here)

The following are explicitly out of Stage 2 scope per
the constitution Stage Scope → Stage 2 Out of Scope block
and [research §11](./research.md#11-things-explicitly-not-in-this-feature-out-of-scope-guards).
Their absence is the spec, not a gap:

- MFA / 2FA
- OAuth / OIDC / SSO
- Password reset / forgot-password
- Self-registration / sign-up
- Admin authoring of `users` rows (the SQL-seeded
  administrator(s) are the only user-creation path)
- Account lockout / brute-force throttling / captcha
- Rate limiting beyond what Joi provides
- Audit logging beyond the existing audit columns
- FK migration of `created_by` / `modified_by` to
  `users.id`
- COOP / CORP / COEP
- DOMPurify / sanitisation library (no rich-text
  fields in Stage 2)
- `/api/v1.0/csp-report` endpoint (no server-side CSP
  collector; per Clarifications Q6)

---

## 6. References

- Spec: [./spec.md](./spec.md) — SC-001..SC-013, FR-001..FR-022, Clarifications Q1..Q6.
- Plan: [./plan.md](./plan.md) — Project Structure, Constitution Check.
- Research: [./research.md](./research.md) — every implementation-level decision.
- Data model: [./data-model.md](./data-model.md) — the `csrfToken` field on the `SessionRecord`.
- Contract: [./contracts/security.yaml](./contracts/security.yaml) — the shared security envelope.
- Stage 2 auth: [../004-user-auth/quickstart.md](../004-user-auth/quickstart.md) — the login prerequisite flow.
- Constitution: [../../.specify/memory/constitution.md](../../.specify/memory/constitution.md) — Principles II, III, IV, VII, IX.
