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

# 3. Bring up the app + MySQL in Docker
docker compose -f docker/docker-compose.yml up -d --build

# 4. Wait for the app container to finish running the migrations on first boot
docker compose -f docker/docker-compose.yml logs -f app
#   Look for: "Migrations run: 2" + "Listening on http://localhost:3000"
```

After step 4, the app is on `http://localhost:3000`, MySQL is on
`localhost:3306` (inside the docker network), the `subjects` and
`teachers` tables exist, and the `subjects` table is populated with the
Stage 1 seed list.

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

```bash
# 2.1. Create a teacher
curl -i -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bobby Lim",
    "subject": "Science",
    "email": "bobby@example.com",
    "contactNumber": "98765432"
  }'
# Expect: HTTP/1.1 201 Created
# Body:   {"name":"Bobby Lim","subject":"Science","email":"bobby@example.com","contactNumber":"98765432"}

# 2.2. List teachers (should include Alice + Bobby)
curl -i http://localhost:3000/api/teachers
# Expect: HTTP/1.1 200 OK
# Body:   {"data":[
#           {"name":"Alice Tan","subject":"Mathematics","email":"alice@example.com","contactNumber":"91234567"},
#           {"name":"Bobby Lim","subject":"Science","email":"bobby@example.com","contactNumber":"98765432"}
#         ]}
```

**Acceptance check**: 201 on POST, 200 on GET, the returned `data` array
contains both teachers.

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
curl -i http://localhost:3000/api/teachers
# Expect: HTTP/1.1 200 OK
# Body:   {"data":[]}
```

**Acceptance check**: the UI shows the empty state, the API returns
`{ "data": [] }`.

---

## Scenario 4 — Validation: invalid email

**Goal**: verify `FR-003` and `FR-010` (`400` + error envelope).

```bash
curl -i -X POST http://localhost:3000/api/teachers \
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

**Goal**: verify `FR-004` and the regex `/^[89]\d{7}$/`.

```bash
# 5.1. Too short
curl -i -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"D","subject":"English","email":"d@example.com","contactNumber":"9123"}'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"contactNumber must match pattern \"^[89]\\d{7}$\""}

# 5.2. Non-numeric
curl -i -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"E","subject":"English","email":"e@example.com","contactNumber":"9123456a"}'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"contactNumber must match pattern \"^[89]\\d{7}$\""}

# 5.3. Valid length but leading digit not 8 or 9
curl -i -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"F","subject":"English","email":"f@example.com","contactNumber":"51234567"}'
# Expect: HTTP/1.1 400 Bad Request
```

**Acceptance check**: every non-conforming contact number returns `400` with
the pattern error.

---

## Scenario 6 — Validation: unknown subject

**Goal**: verify `FR-005a` and the FK enforcement.

```bash
curl -i -X POST http://localhost:3000/api/teachers \
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
curl -i -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"H","subject":"English","email":"h@example.com","contactNumber":"91234567"}'
# Expect: 201 Created

# 7.2. Second submission with the same email
curl -i -X POST http://localhost:3000/api/teachers \
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
curl -i -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: text/plain" \
  -d 'name=I&subject=English&email=i@example.com&contactNumber=91234567'
# Expect: HTTP/1.1 415 Unsupported Media Type
# Body:   {"error":"Content-Type must be application/json"}
```

**Acceptance check**: the API rejects `text/plain` with `415` and the
envelope message.

---

## Scenario 9 — Subjects list

**Goal**: verify `GET /api/subjects` returns the seeded list.

```bash
curl -i http://localhost:3000/api/subjects
# Expect: HTTP/1.1 200 OK
# Body:   {"data":[
#           {"name":"English","active":true},
#           {"name":"Mathematics","active":true},
#           {"name":"Science","active":true},
#           {"name":"Chinese","active":true},
#           {"name":"Malay","active":true},
#           {"name":"Tamil","active":true},
#           {"name":"Art","active":true},
#           {"name":"Music","active":true},
#           {"name":"Physical Education","active":true}
#         ]}
```

**Acceptance check**: 9 entries, all `active: true`, no duplicate names.

---

## Scenario 10 — Persistence across server restart

**Goal**: verify `FR-012` and `SC-001` (data survives restart).

```bash
# 10.1. Create a teacher
curl -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"J","subject":"English","email":"j@example.com","contactNumber":"91234567"}'
# Expect: 201 Created

# 10.2. Restart the app container
docker compose -f docker/docker-compose.yml restart app

# 10.3. List teachers
curl http://localhost:3000/api/teachers
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
  logs. Look for typeORM migration errors, unhandled rejections, or 500
  responses.
- **`docker compose -f docker/docker-compose.yml logs mysql`** — DB logs.
  Look for connection errors, constraint violation traces, or migration
  failures.
- **`docker compose -f docker/docker-compose.yml exec mysql mysql -uroot
  -p"$MYSQL_ROOT_PASSWORD" admin -e "SHOW TABLES; SELECT * FROM subjects;"`**
  — manual inspection of the schema and seed data.

If a quickstart scenario fails, the most common causes are:
1. The app container is still running the migration on first boot — wait
   5–10 s and retry.
2. The `subjects` table is empty (the seed migration did not run) — restart
   the app container.
3. The `.env` for the app is missing the `DB_HOST=mysql` entry — re-create
   it from `.env.example`.
4. The port `3000` is already in use — stop the conflicting process or
   remap the port in `docker/docker-compose.yml`.
