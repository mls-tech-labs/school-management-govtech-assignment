# Quickstart: Teachers (001-teachers)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)
**Data model**: [./data-model.md](./data-model.md)
**Contracts**: [./contracts/teachers.yaml](./contracts/teachers.yaml), [./contracts/subjects.yaml](./contracts/subjects.yaml)

This is a runnable validation guide. It walks through the end-to-end happy
path of the Teachers feature, then the error paths that pin down the
contract. Every step is a real command and a real check.

---

## Prerequisites

- Docker Desktop (Docker Engine 24+ and Compose v2).
- Node.js LTS (≥ 20) and npm for local unit / contract / integration test
  runs.
- A free port `3000` (Next.js dev server) and `3306` (MySQL).
- No environment variables are required to start; the `.env` file in the
  repo root (JSON, model config only) plus the dotenv `.env` from
  `docker/.env.docker` (created on first run) cover all settings.
- The `.requirements/Full Stack Assignment.md` file is **not** required for
  this feature (see [research.md §1.6](./research.md#16-missing-requirements-asset)).

---

## Setup

```bash
# 1. Clone the repo and enter it
git clone <repo-url> pvt-edu-admin-project
cd pvt-edu-admin-project

# 2. Install dependencies (uses package.json with caret ranges, locked via package-lock.json)
npm install

# 3. Bring up MySQL separately and prepare the schema (per FR-016, Session 2026-06-21)
#    The user prepares the MySQL container with the Stage 1 schema:
#    `subjects` (9 rows), `teachers` tables; the audit columns, `ulid CHAR(26) UNIQUE`
#    column (per FR-021), FK constraints, and UNIQUE indexes.
#    The application does NOT run migrations on boot.
docker compose -f docker/docker-compose.yml up -d mysql
# (then run your prepared SQL against the MySQL container)

# 4. Bring up the app container (connects to the user-prepared MySQL; no migration step)
docker compose -f docker/docker-compose.yml up -d --build app
docker compose -f docker/docker-compose.yml logs -f app
#   Look for: "Listening on http://localhost:3000" (no migration log lines)
```

After step 4, the app is on `http://localhost:3000`, MySQL is on
`localhost:3306` (inside the docker network), the `subjects` and
`teachers` tables exist, and the `subjects` table is populated with the
Stage 1 seed list — all prepared by the user.

---

## Scenario 1 — Add a teacher (UI happy path)

**Goal**: verify `FR-001`, `FR-002`, `FR-006`, and `SC-001`.

1. Open `http://localhost:3000/teachers/add` in a browser.
2. The Add Teacher form is rendered with four controls in this order:
   **Name** (text), **Subject** (dropdown), **Email** (text), **Contact
   Number** (text). The Subject dropdown is populated with the seed list
   (English, Mathematics, …).
3. Fill in:
   - Name: `Alice Tan`
   - Subject: `Mathematics`
   - Email: `alice@example.com`
   - Contact Number: `91234567`
4. Click **Save**.
5. The page navigates to `/teachers` and the new entry is visible in the
   list with the four values, in a readable filled state (`FR-008`, `FR-009`).
6. The whole flow finishes in well under 30 s (`SC-001`).

**Acceptance check**: a row matching `Alice Tan / Mathematics /
alice@example.com / 91234567` is on the Teachers list.

---

## Scenario 2 — Add a teacher (API happy path)

**Goal**: verify `FR-006`, `FR-007`, and the `201` / `200` status codes.
The `ulid` field is the cross-cutting frontend-stable row handle (per
FR-021, owned by `003-backend-api-db`).

```bash
# 2.1. Create a teacher
curl -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bobby Lim",
    "subject": "Science",
    "email": "bobby@example.com",
    "contactNumber": "98765432"
  }'
# Expect: HTTP/1.1 201 Created
# Body:   {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7U","name":"Bobby Lim","subject":"Science","email":"bobby@example.com","contactNumber":"98765432"}

# 2.2. List teachers (should include Alice + Bobby)
curl -i http://localhost:3000/api/v1.0/teachers
# Expect: HTTP/1.1 200 OK
# Body:   {"data":[
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7T","name":"Alice Tan","subject":"Mathematics","email":"alice@example.com","contactNumber":"91234567"},
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7U","name":"Bobby Lim","subject":"Science","email":"bobby@example.com","contactNumber":"98765432"}
#         ]}
```

**Acceptance check**: 201 on POST, 200 on GET, the returned `data` array
contains both teachers. Each entry carries a `ulid` field with a
26-character Crockford Base32 string.

---

## Scenario 3 — Empty state

**Goal**: verify `FR-009` and Story 2 scenario 2.

```bash
# 3.1. Wipe the data via the API (no DELETE endpoint — drop the table in MySQL)
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "TRUNCATE TABLE teachers;"

# 3.2. Reload the Teachers list page
#   Open http://localhost:3000/teachers
# Expect: an empty-state view is shown — "No teachers yet" + a button/link
#   to "Add a teacher".

# 3.3. API check
curl -i http://localhost:3000/api/v1.0/teachers
# Expect: HTTP/1.1 200 OK
# Body:   {"data":[]}
```

**Acceptance check**: the UI shows the empty state, the API returns
`{ "data": [] }`.

---

## Scenario 4 — Validation: invalid email

**Goal**: verify `FR-003` and `FR-010` (`400` + error envelope).

```bash
curl -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Charlie",
    "subject": "English",
    "email": "not-an-email",
    "contactNumber": "91234567"
  }'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"email must be a valid email"}
```

**Acceptance check**: status `400`, body matches `{ "error": "..." }`.

---

## Scenario 5 — Validation: invalid contact number

**Goal**: verify `FR-004` and the regex `/^\d{8}$/` (per
Session 2026-06-21 — exactly 8 digits, digits-only, no
leading-digit restriction).

```bash
# 5.1. Too short
curl -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"D","subject":"English","email":"d@example.com","contactNumber":"9123"}'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"contactNumber must match pattern \"^\\d{8}$\""}

# 5.2. Non-numeric
curl -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"E","subject":"English","email":"e@example.com","contactNumber":"9123456a"}'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"contactNumber must match pattern \"^\\d{8}$\""}

# 5.3. Valid length, any leading digit is now accepted (per FR-004, Session 2026-06-21)
curl -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"F","subject":"English","email":"f@example.com","contactNumber":"51234567"}'
# Expect: HTTP/1.1 201 Created (the contact number is accepted — any digit is a valid leading digit)
```

**Acceptance check**: too-short and non-numeric contact numbers return
`400` with the pattern error; any 8-digit numeric contact number is
accepted, regardless of the leading digit.

---

## Scenario 6 — Validation: unknown subject

**Goal**: verify `FR-005a` and the FK enforcement.

```bash
curl -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "G",
    "subject": "Underwater Basket Weaving",
    "email": "g@example.com",
    "contactNumber": "91234567"
  }'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"subject must be one of [English, Mathematics, Science, ...]"}
```

**Acceptance check**: the Joi schema rejects the unknown subject with
`400`. The DB FK would also have caught it (the `teachers.subject` →
`subjects.name` FK), but the route handler never lets the bad payload
reach the DB.

---

## Scenario 7 — Duplicate email → 409

**Goal**: verify `FR-005` and the race-safe `UNIQUE` constraint.

```bash
# 7.1. First submission
curl -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"H","subject":"English","email":"h@example.com","contactNumber":"91234567"}'
# Expect: 201 Created

# 7.2. Second submission with the same email
curl -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"H2","subject":"English","email":"h@example.com","contactNumber":"98765432"}'
# Expect: HTTP/1.1 409 Conflict
# Body:   {"error":"Email already in use"}
```

**Acceptance check**: the second submission is rejected with `409` and the
exact error message `"Email already in use"`.

---

## Scenario 8 — Non-JSON content type → 415

**Goal**: verify `FR-010` (`415` in the cross-cutting status code table).

```bash
curl -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: text/plain" \
  -d 'name=I&subject=English&email=i@example.com&contactNumber=91234567'
# Expect: HTTP/1.1 415 Unsupported Media Type
# Body:   {"error":"Content-Type must be application/json"}
```

**Acceptance check**: the API rejects `text/plain` with `415` and the
envelope message.

---

## Scenario 9 — Subjects list

**Goal**: verify `GET /api/v1.0/subjects` returns the seeded list, including
the `ulid` row handle (per FR-021).

```bash
curl -i http://localhost:3000/api/v1.0/subjects
# Expect: HTTP/1.1 200 OK
# Body:   {"data":[
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P70","name":"English","active":true},
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P71","name":"Mathematics","active":true},
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P72","name":"Science","active":true},
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P73","name":"Chinese","active":true},
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P74","name":"Malay","active":true},
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P75","name":"Tamil","active":true},
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P76","name":"Art","active":true},
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P77","name":"Music","active":true},
#           {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P78","name":"Physical Education","active":true}
#         ]}
```

**Acceptance check**: 9 entries, all `active: true`, no duplicate
names, every `ulid` is exactly 26 characters of Crockford Base32.

---

## Scenario 10 — Persistence across server restart

**Goal**: verify `FR-012` and `SC-001` (data survives restart).

```bash
# 10.1. Create a teacher
curl -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"J","subject":"English","email":"j@example.com","contactNumber":"91234567"}'
# Expect: 201 Created

# 10.2. Restart the app container
docker compose -f docker/docker-compose.yml restart app

# 10.3. List teachers
curl http://localhost:3000/api/v1.0/teachers
# Expect: "J" is still in the data array.
```

**Acceptance check**: the teacher created before the restart is present
after the restart.

---

## Scenario 11 — Unit tests (no network, no live DB)

```bash
npm run test:unit
# Expect: all *.spec.ts in tests/unit/ pass.
#   - teacher.validation.spec.ts: happy path + each rejection path
#   - teacher.repository.spec.ts: insert / find by email / list / uniqueness
#   - subject.repository.spec.ts: insert / find active
```

---

## Scenario 12 — Integration tests (full DB)

```bash
# Bring up the test-only MySQL
docker compose -f docker/docker-compose.test.yml up -d

# Run the integration suite
npm run test:integration
# Expect: all *.spec.ts in tests/integration/ pass.
#   - teachers.api.spec.ts: POST + GET via the Next.js server, against the test DB

docker compose -f docker/docker-compose.test.yml down
```

---

## What to check on failure

- **`docker compose -f docker/docker-compose.yml logs app`** — application
  logs. Look for typeORM connection errors, unhandled rejections, or 500
  responses. **There is no migration log line in Stage 1** — if you see
  `Migrations run: ...`, the boot sequence is running migrations and
  the user-prepared-MySQL contract (FR-016) is being violated.
- **`docker compose -f docker/docker-compose.yml logs mysql`** — DB logs.
  Look for connection errors or constraint violation traces.
- **`docker compose -f docker/docker-compose.yml exec mysql mysql -uroot
  -p"$MYSQL_ROOT_PASSWORD" admin -e "SHOW TABLES; SELECT * FROM subjects;"`**
  — manual inspection of the schema and seed data.

If a quickstart scenario fails, the most common causes are:
1. The MySQL container was not prepared by the user before the app
   container started — bring MySQL up first, run the user's SQL, then
   bring the app up.
2. The `subjects` table is empty (the user did not insert the seed
   data) — run the user's SQL against the MySQL container.
3. The `.env` for the app is missing the `DB_HOST=mysql` entry — re-create
   it from `.env.example`.
4. The port `3000` is already in use — stop the conflicting process or
   remap the port in `docker/docker-compose.yml`.
5. The endpoint is being hit without the `/api/v1.0/` version prefix
   (per FR-022) — the request will route to Next.js as a non-existent
   path. Add the `/api/v1.0/` prefix.
