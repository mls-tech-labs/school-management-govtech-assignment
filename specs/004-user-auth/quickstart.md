# Quickstart: User Authentication (004-user-auth)

**Date**: 2026-06-21
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Data Model**: [./data-model.md](./data-model.md)
**Research**: [./research.md](./research.md)
**Contracts**: [./contracts/auth.yaml](./contracts/auth.yaml)

This is the **runnable validation guide** for the auth feature. It
walks through the end-to-end happy path (boot the app, seed an
admin, log in, hit `/api/v1.0/me`, log out, hit a protected
endpoint without a session) and the negative-path scenarios that
pin down the security properties (wrong password, expired
session, session-fixation pre-seed, etc.).

Each step maps to a **Success Criterion** in the spec
(`SC-001`..`SC-013`) so a reviewer can confirm that the feature
meets its measurable outcomes by running the listed commands and
observing the listed outcomes.

---

## 0. Prerequisites

| Prerequisite | Why | How |
|---|---|---|
| Node.js LTS | The application runtime (per constitution → Technical Stack Constraints) | `node --version` should print `v20.x` or later |
| Docker + Docker Compose | Runs the MySQL container (Stage 1 prerequisite) and the Redis container (this feature) | `docker --version` and `docker compose version` |
| `mysql` CLI client | Pipe the `seed:admin` output to MySQL (per FR-026 + research §8) | `mysql --version` |
| `redis-cli` | Verify session TTL + session-fixation pre-seed cleanup (research §3.3 + §3.5) | `redis-cli --version` |
| `curl` | Issue raw HTTP requests for the contract-level validation (steps 5–9) | `curl --version` |
| A browser (Chrome / Firefox / Safari) | Verify the React route guard's `redirectTo` flow end-to-end (steps 10–13) | any modern browser |

The MySQL and Redis containers are expected to be running on the
documented local-dev ports (MySQL on `3306`, Redis on `6379`).
The application's `.env.local` must include both:

```bash
# .env.local (gitignored) — minimal-but-necessary keys
MYSQL_URL=mysql://root:root@127.0.0.1:3306/pvt_edu
REDIS_URL=redis://127.0.0.1:6379
SESSION_COOKIE_SECURE=false   # local dev only; production MUST set true
NODE_ENV=development
```

`SESSION_COOKIE_SECURE=false` is required for the cookie to
survive the local HTTP round-trip (research §5). The production
deployment sets `SESSION_COOKIE_SECURE=true` (or simply lets
`NODE_ENV=production` drive the default).

---

## 1. Boot the application stack

```bash
# 1. Start MySQL (Stage 1 prerequisite — already running from the Stage 1 quickstart).
docker compose -f docker/docker-compose.yml up -d mysql

# 2. Start Redis (new — added by this feature's plan, see plan.md §Project Structure).
docker compose -f docker/docker-compose.yml up -d redis

# 3. Install the new runtime deps (argon2 + ioredis).
npm install

# 4. Build the schema and seed the reference-list tables (subjects, levels)
#    — same user-prepared SQL from Stage 1, no change.
mysql -h 127.0.0.1 -P 3306 -u root -p < docker/mysql/init/01-schema-and-seed.sql

# 5. Run the dev server.
npm run dev
# → ready on http://localhost:3000
```

**Expected outcome**: the server prints `Ready on http://localhost:3000`,
no startup error about `REDIS_URL` (which would mean the
fail-fast config check failed — per the fail-closed `.env`
discipline), and the MySQL container is reachable on `3306` and
the Redis container on `6379`.

---

## 2. Seed an admin (FR-026 + SC-011)

```bash
npm run seed:admin -- --confirm \
    --username=admin --password='correct horse battery staple'
```

The command prints one `INSERT INTO users (...) VALUES (...);`
statement to stdout and exits `0`. The printed SQL is the
**single source of truth** for the seed format (research §8 +
spec FR-026).

**Expected outcome** (stdout):

```sql
INSERT INTO users
  (id, ulid, username, password, salt, active,
   created_at, created_by, modified_at, modified_by, version)
VALUES
  (NULL,
   '01HZX8K9V4Q7P3WJRN6B5M2YDC',
   'admin',
   '$argon2id$v=19$m=65536,t=3,p=4$<salt-b64>$<hash-b64>',
   '<salt-b64>',
   1,
   '2026-06-21 10:23:45.123456',
   'admin',
   '2026-06-21 10:23:45.123456',
   'admin',
   1);
```

Pipe the output into MySQL:

```bash
npm run seed:admin -- --confirm \
    --username=admin --password='correct horse battery staple' \
  | mysql -h 127.0.0.1 -P 3306 -u root -p pvt_edu
```

Verify:

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p pvt_edu \
  -e "SELECT username, active, ulid, created_by FROM users;"
```

**Expected outcome**: one row, `username=admin`, `active=1`,
`ulid=<26-char>`, `created_by=admin`. (SC-011 partially —
the unit-test fixture covers the full chain end-to-end.)

The script also refuses to run without `--confirm`:

```bash
$ npm run seed:admin -- --username=admin --password='correct horse battery staple'
Refusing to print seed SQL without --confirm. Re-run with --confirm.
```

---

## 3. Reach the login page (SC-001 partial — page-load leg)

Open `http://localhost:3000/` in a browser.

**Expected outcome**: the browser is on `http://localhost:3000/login`
(redirected by the React route guard via the `/api/v1.0/me` →
`401` → `redirectTo=/` → `/login?redirectTo=%2F` flow), and the
page shows exactly **three** elements:

1. A `username` text input.
2. A `password` text input (type `password`).
3. A `Log in` submit button.

No "Sign up", "Register", "Forgot password", or "Remember me"
control is rendered (per spec FR-002 + Acceptance Scenarios of
User Story 1).

**Browser devtools check**: the rendered HTML MUST NOT contain
`rememberMe`, `forgot`, `sign-up`, `register`, or any other auth
control keyword (per spec User Story 1 acceptance scenario 3).

---

## 4. Log in with valid credentials (SC-001 + SC-003 + SC-013 partial)

In the login form, enter `admin` / `correct horse battery staple`
and click `Log in`.

**Expected outcome**:

- The browser is no longer on `/login`; it has navigated to `/`
  (the `LOGIN_REDIRECT_DEFAULT`).
- The browser devtools "Application" panel shows a cookie named
  `pvt_edu_session` with:
  - `HttpOnly` ✅
  - `Secure` ❌ in dev (the `SESSION_COOKIE_SECURE=false` setting
    per research §5) — in production this MUST be ✅
  - `SameSite=Strict` ✅
  - `Path=/` ✅
  - `Max-Age=1800` (= `SESSION_TTL_SECONDS`, default 30 min).
- The cookie value is a 43-character `base64url` string (256 bits
  of entropy per research §3). It is opaque — no user
  information is encoded in it.

**Verify with `redis-cli`**:

```bash
redis-cli -h 127.0.0.1 -p 6379 KEYS 'session:*'
# → 1) "session:<token>"
redis-cli -h 127.0.0.1 -p 6379 TTL 'session:<token>'
# → integer ~1799 (the 30-minute TTL, decremented by 1s since creation)
redis-cli -h 127.0.0.1 -p 6379 GET 'session:<token>'
# → {"userId":"1","ulid":"01HZX8K9V4Q7P3WJRN6B5M2YDC","createdAt":"2026-06-21T10:23:45.123Z"}
```

**Verify with the structured log** (per spec FR-027):

```bash
# Look at the dev server stdout / log file for one entry matching:
# {"event":"auth.login","outcome":"success","username":"admin","ip":"...","timestamp":"..."}
```

The log entry MUST NOT contain the password, the hash, the salt,
or the full session cookie value (SC-012).

---

## 5. Inspect the current session (SC-007)

While the session cookie is set, run:

```bash
curl -s -i \
  -H "Cookie: pvt_edu_session=<token from devtools>" \
  http://localhost:3000/api/v1.0/me
```

**Expected outcome** (HTTP `200 OK`):

```json
{
  "username": "admin",
  "active": true,
  "ulid": "01HZX8K9V4Q7P3WJRN6B5M2YDC",
  "createdAt": "2026-06-21T10:23:45.123456Z"
}
```

The response body MUST contain **exactly** those four
top-level fields (per spec FR-009 + SC-007). No `id`, no
`created_by`, no `modified_*`, no `version` — per cross-cutting
FR-020 (audit columns hidden).

---

## 6. Reject invalid credentials (SC-004)

Open a fresh incognito window (no cookie). Try each of the three
negative cases:

```bash
# Case A — unknown username
curl -s -i -X POST http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -d '{"username":"nobody","password":"any-non-empty-value"}'

# Case B — wrong password for a known username
curl -s -i -X POST http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"WRONG"}'

# Case C — inactive user (seed a second row, then mark active=false)
#   mysql -h 127.0.0.1 -P 3306 -u root -p pvt_edu \
#     -e "UPDATE users SET active = 0 WHERE username = 'admin';"
curl -s -i -X POST http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"correct horse battery staple"}'
```

**Expected outcome for all three**: HTTP `401 Unauthorized` with
**identical** body:

```json
{ "error": "Invalid username or password" }
```

No `Set-Cookie` header. The browser's cookie jar is unchanged.

**Verify in the server log** (per spec FR-027):

- Case A: `{"event":"auth.login","outcome":"failure","reason":"unknown_user","username":"nobody",...}`
- Case B: `{"event":"auth.login","outcome":"failure","reason":"wrong_password","username":"admin",...}`
- Case C: `{"event":"auth.login","outcome":"failure","reason":"inactive_user","username":"admin",...}`

The server-side log distinguishes the three reasons; the client
sees the same generic envelope.

Restore the user for the remaining steps:

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p pvt_edu \
  -e "UPDATE users SET active = 1 WHERE username = 'admin';"
```

---

## 7. Reject validation errors (SC-004 + FR-006 validation path)

```bash
# Missing username
curl -s -i -X POST http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -d '{"password":"x"}'
# → 400 with error: '"username" is required'

# Missing password
curl -s -i -X POST http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin"}'
# → 400 with error: '"password" is required'

# Unknown field (defense against a future rememberMe, per spec Edge Cases)
curl -s -i -X POST http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"x","rememberMe":true}'
# → 400 with error: '"rememberMe" is not allowed'

# Wrong content type
curl -s -i -X POST http://localhost:3000/api/v1.0/login \
  -H "Content-Type: text/plain" \
  -d 'username=admin&password=x'
# → 415 with error: 'Content-Type must be application/json'
```

**Expected outcome**: each command returns the listed status
code and error message. No session cookie is set in any case.

---

## 8. Hit a protected endpoint without a session (SC-002 + SC-008)

Open an incognito window (no cookie). Run:

```bash
curl -s -i http://localhost:3000/api/v1.0/teachers
# → 401 Unauthorized
# → body: {"error":"Unauthorized"}

curl -s -i http://localhost:3000/api/v1.0/subjects
# → 401 Unauthorized
```

Then in the browser, navigate directly to `http://localhost:3000/teachers`.

**Expected outcome**:

- The page does NOT render the teachers list.
- The browser ends up on `http://localhost:3000/login?redirectTo=%2Fteachers`
  (the React route guard's `GET /api/v1.0/me` returned `401`,
  the guard pushed the redirect with the encoded current URL —
  per research §6).
- The URL bar shows `/login?redirectTo=%2Fteachers` (i.e.,
  the encoded original URL is preserved across the redirect).

---

## 9. Verify session-fixation defence (SC-013)

This is the single most important security property of the
feature. It requires a manual step that cannot be done from the
browser UI alone.

```bash
# Step A — manually inject a known sessionId into the browser
# (simulating an attacker who pre-seeded a cookie on the victim's
# browser before the victim logged in).

KNOWN_SESSION_ID="attacker-known-token-1234567890abcdef"

# Step A.1 — set the known value in the browser's cookie jar.
#   In a real attack this would be done via an XSS payload or a
#   network-position attack. For the quickstart, we use
#   `curl --cookie` to simulate the victim's browser.
curl -s -i -X POST http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -H "Cookie: pvt_edu_session=$KNOWN_SESSION_ID" \
  -d '{"username":"admin","password":"correct horse battery staple"}'

# Expected: 200 OK, Set-Cookie with a DIFFERENT token than $KNOWN_SESSION_ID
# (the server minted a fresh opaque sessionId per FR-006 + research §3.5).
```

**Verify the defence**:

```bash
# Step B — the pre-seeded sessionId MUST be removed from Redis.
redis-cli -h 127.0.0.1 -p 6379 KEYS "session:$KNOWN_SESSION_ID"
# → (empty list — the key is gone)

# Step C — a request bearing the pre-seeded cookie MUST be rejected.
curl -s -i http://localhost:3000/api/v1.0/me \
  -H "Cookie: pvt_edu_session=$KNOWN_SESSION_ID"
# → 401 Unauthorized
```

**Expected outcome**: the attacker's known sessionId is no
longer valid after the victim logs in. The victim holds a
fresh, server-minted sessionId that the attacker did not know.

---

## 10. Log out (SC-005 + spec User Story 5)

While the session cookie is set, log out from the UI:

```bash
curl -s -i -X POST http://localhost:3000/api/v1.0/logout \
  -H "Cookie: pvt_edu_session=<current token>"
```

**Expected outcome**:

- HTTP `200 OK`.
- `Set-Cookie: pvt_edu_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`
  (the logout cookie per spec FR-018 + research §4 logout
  sub-section).
- Empty body.

**Verify**:

```bash
# The Redis key is gone.
redis-cli -h 127.0.0.1 -p 6379 KEYS "session:*"
# → (empty list)

# A protected request bearing the now-cleared cookie returns 401.
curl -s -i http://localhost:3000/api/v1.0/teachers \
  -H "Cookie: pvt_edu_session=<old token>"
# → 401 Unauthorized
```

**Idempotency check** (spec FR-007):

```bash
# Logout again, without any cookie present.
curl -s -i -X POST http://localhost:3000/api/v1.0/logout
# → 200 OK (no error — idempotent)
```

---

## 11. Verify the route guard's redirect-to flow

This step requires the browser.

1. Log out (or open an incognito window with no cookie).
2. Navigate to `http://localhost:3000/teachers`.

**Expected outcome**: the URL bar ends up at
`http://localhost:3000/login?redirectTo=%2Fteachers`. The login
page is rendered with the three-element form.

3. Enter valid credentials and click `Log in`.

**Expected outcome**: the browser navigates to
`http://localhost:3000/teachers` (the `redirectTo` query is
honoured). The teachers page renders normally.

**Negative check — open-redirect defence** (research §6):

1. Manually visit `http://localhost:3000/login?redirectTo=//evil.example.com/`.
2. Log in.

**Expected outcome**: the browser navigates to `/` (the
`LOGIN_REDIRECT_DEFAULT`), **NOT** to `evil.example.com`. The
single-slash-prefix validation rejects the `//evil.example.com`
value as a same-origin redirect target.

---

## 12. Verify the 30-minute TTL boundary (SC-006)

The TTL is hard to wait out manually, so the integration test
suite covers it (`tests/integration/auth.spec.ts`). For manual
verification:

```bash
# Inspect the TTL on the current session.
redis-cli -h 127.0.0.1 -p 6379 TTL "session:<token>"
# → integer in [0, 1800]

# To shorten the wait, set SESSION_TTL_SECONDS=60 in .env.local and re-login.
# After 60s of inactivity:
redis-cli -h 127.0.0.1 -p 6379 KEYS "session:*"
# → (empty list — the key has expired)
```

After expiry, the protected endpoint returns `401`:

```bash
curl -s -i http://localhost:3000/api/v1.0/me \
  -H "Cookie: pvt_edu_session=<expired token>"
# → 401 Unauthorized
```

The TTL is **not extended** on every request — the
`session:<token>` key was created with `EX 60` (or `EX 1800` in
the default case), and that is the lifetime. Per spec FR-015
+ Edge Cases, there is no sliding extension.

---

## 13. Verify Redis-down → 503 (spec Edge Cases)

Stop the Redis container:

```bash
docker compose -f docker/docker-compose.yml stop redis
```

Wait for the application's Redis client to fail its next
operation, then:

```bash
# A protected endpoint with a valid-looking cookie.
curl -s -i http://localhost:3000/api/v1.0/me \
  -H "Cookie: pvt_edu_session=anything"
# → 503 Service Unavailable
# → body: {"error":"Service temporarily unavailable, please retry"}

# The login endpoint itself returns 503 because it cannot write a session.
curl -s -i -X POST http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"correct horse battery staple"}'
# → 503 Service Unavailable
```

Restart Redis:

```bash
docker compose -f docker/docker-compose.yml start redis
```

After the restart, the next login attempt succeeds — the
session store is back online.

---

## 14. Run the test suites (SC-001..SC-013 full coverage)

```bash
# Unit tier — pure functions, no DB, no network.
npm run test:unit

# Contract tier — the Next.js server with ioredis-mock + an in-memory MySQL stub.
npm run test:contract

# Integration tier — real MySQL + real Redis containers.
npm run test:integration
```

**Expected outcome**: all three tiers pass; the integration
suite covers SC-001 through SC-013 (including the
session-fixation pre-seed test, the 30-minute TTL boundary
test, the idempotent-logout test, the log-scrub
never-leak-secrets test, and the unknown-user / wrong-password /
inactive-user indistinguishability test).

---

## Mapping: step → Success Criterion

| Step | SC covered |
|---|---|
| 1. Boot | (prerequisite) |
| 2. Seed admin | SC-011 (printed SQL inserts a row that the app can log in with) |
| 3. Login page | SC-001 (page-load leg — visitor reaches the form in < 10 s) |
| 4. Log in valid | SC-001 + SC-003 + SC-013 (no pre-seed — fresh session is created) |
| 5. Inspect session | SC-007 (response body has exactly the four fields) |
| 6. Reject invalid | SC-004 (401 + generic message for all three failure modes) |
| 7. Validation errors | SC-004 (validation path) + 415 cross-cutting |
| 8. Hit protected without session | SC-002 + SC-008 |
| 9. Session-fixation defence | SC-013 (full pre-seed → login → 401 chain) |
| 10. Log out | SC-005 (idempotent + Redis key removed + cookie cleared) |
| 11. Route-guard redirect | SC-008 + SC-009 (the redirect-to flow + open-redirect defence) |
| 12. TTL boundary | SC-006 (hard 30-minute expiry, no sliding extension) |
| 13. Redis-down → 503 | SC-010 (failure mode documented) |
| 14. Test suites | Full coverage of SC-001..SC-013 |
