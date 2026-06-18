# Quickstart: Classes (002-classes)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)
**Data model**: [./data-model.md](./data-model.md)
**Contracts**: [./contracts/classes.yaml](./contracts/classes.yaml), [./contracts/levels.yaml](./contracts/levels.yaml)

This is a runnable validation guide. It walks through the end-to-end happy
path of the Classes feature, then the error paths that pin down the
contract. Every step is a real command and a real check.

The Classes feature assumes the Teachers feature is already in place —
the Add Class form's Form Teacher dropdown is populated from
`GET /api/teachers`, and the cross-feature `FOREIGN KEY` from
`classes.form_teacher_email` → `teachers.email` requires the `teachers`
table to exist. If you're validating the Classes feature in isolation,
follow the [001-teachers quickstart](../001-teachers/quickstart.md) up to
its end before proceeding.

---

## Prerequisites

- Docker Desktop (Docker Engine 24+ and Compose v2).
- Node.js LTS (≥ 20) and npm for local unit / contract / integration
  test runs.
- A free port `3000` (Next.js dev server) and `3306` (MySQL).
- The Teachers feature already built and seeded with at least two
  teachers (the Add Class flow needs the Form Teacher dropdown to have
  entries). Run the [001-teachers quickstart](../001-teachers/quickstart.md)
  Scenarios 1 + 2 once if the environment is fresh.

---

## Setup

```bash
# 1. Clone the repo and enter it (if not already done)
git clone <repo-url> pvt-edu-admin-project
cd pvt-edu-admin-project

# 2. Install dependencies (uses package.json with caret ranges, locked via package-lock.json)
npm install

# 3. Bring up the app + MySQL in Docker (runs all 4 migrations on first boot)
docker compose -f docker/docker-compose.yml up -d --build

# 4. Wait for the app container to finish running the migrations
docker compose -f docker/docker-compose.yml logs -f app
#   Look for: "Migrations run: 4" + "Listening on http://localhost:3000"
```

After step 4, the app is on `http://localhost:3000`, MySQL is on
`localhost:3306` (inside the docker network), and the schema has 4
tables: `subjects`, `teachers` (from `001-teachers`), `levels`, and
`classes` (from `002-classes`). Both reference lists are seeded.

---

## Scenario 1 — Add a class (UI happy path)

**Goal**: verify `FR-001`, `FR-002`, `FR-006`, and `SC-001`.

1. Ensure at least one teacher exists (`GET /api/teachers` returns a
   non-empty list). If not, follow
   [001-teachers quickstart Scenario 2](../001-teachers/quickstart.md#scenario-2--add-a-teacher-api-happy-path)
   to seed one.
2. Open `http://localhost:3000/classes/add` in a browser.
3. The Add Class form is rendered with three controls in this order:
   **Level** (dropdown), **Name** (text), **Form Teacher** (searchable
   dropdown of registered teachers).
4. Fill in:
   - Level: `Primary 1`
   - Name: `Class 1A`
   - Form Teacher: `Alice Tan` (or whatever existing teacher you have)
5. Click **Save**.
6. The page navigates to `/classes` and the new entry is visible in the
   list with `level`, `name`, and `formTeacher.name`, in a readable
   filled state (`FR-008`, `FR-009`).
7. The whole flow finishes in well under 30 s (`SC-001`).

**Acceptance check**: a row matching `Primary 1 / Class 1A / Alice Tan`
is on the Classes list.

---

## Scenario 2 — Add a class (API happy path)

**Goal**: verify `FR-006`, `FR-007`, and the `201` / `200` status codes.

```bash
# 2.1. Create a class
curl -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{
    "level": "Primary 1",
    "name": "Class 1B",
    "teacherEmail": "bobby@example.com"
  }'
# Expect: HTTP/1.1 201 Created
# Body:   {"level":"Primary 1","name":"Class 1B","formTeacher":{"name":"Bobby Lim"}}

# 2.2. List classes (should include Class 1A from Scenario 1 + Class 1B)
curl -i http://localhost:3000/api/classes
# Expect: HTTP/1.1 200 OK
# Body:   {"data":[
#           {"level":"Primary 1","name":"Class 1A","formTeacher":{"name":"Alice Tan"}},
#           {"level":"Primary 1","name":"Class 1B","formTeacher":{"name":"Bobby Lim"}}
#         ]}
```

**Acceptance check**: 201 on POST, 200 on GET, the returned `data` array
contains both classes with the resolved form-teacher names, and no
`id` field is present in any entry.

---

## Scenario 3 — Empty state

**Goal**: verify `FR-009` and Story 2 scenario 2.

```bash
# 3.1. Wipe the data via the API (no DELETE endpoint — drop the table in MySQL)
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "TRUNCATE TABLE classes;"

# 3.2. Reload the Classes list page
#   Open http://localhost:3000/classes
# Expect: an empty-state view is shown — "No classes yet" + a button/link
#   to "Add a class".

# 3.3. API check
curl -i http://localhost:3000/api/classes
# Expect: HTTP/1.1 200 OK
# Body:   {"data":[]}
```

**Acceptance check**: the UI shows the empty state, the API returns
`{ "data": [] }`.

---

## Scenario 4 — Validation: unknown teacher (`404`)

**Goal**: verify `FR-004`, `FR-005b`, and the `404` path. This is the
"race" case where the dropdown had a teacher at page-load time but the
teacher was deleted before the form was submitted.

```bash
curl -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{
    "level": "Primary 1",
    "name": "Class 1C",
    "teacherEmail": "ghost@example.com"
  }'
# Expect: HTTP/1.1 404 Not Found
# Body:   {"error":"Teacher not found"}
```

**Acceptance check**: status `404`, body matches `{ "error": "..." }`.

---

## Scenario 5 — Validation: unknown level (`400`)

**Goal**: verify `FR-005a` and the closed-set Joi validation against the
active levels.

```bash
curl -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{
    "level": "Kindergarten 1",
    "name": "Class K1",
    "teacherEmail": "alice@example.com"
  }'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"level must be one of [Primary 1, Primary 2, ...]"}
```

**Acceptance check**: status `400`, the level name is rejected.

---

## Scenario 6 — Validation: invalid email format (`400`)

**Goal**: verify `FR-003` and the `400` + error envelope.

```bash
curl -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{
    "level": "Primary 1",
    "name": "Class 1D",
    "teacherEmail": "not-an-email"
  }'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"teacherEmail must be a valid email"}
```

**Acceptance check**: status `400`, body matches `{ "error": "..." }`.

---

## Scenario 7 — Duplicate class name → `409`

**Goal**: verify `FR-005c` and the race-safe `UNIQUE(classes.name)`
constraint.

```bash
# 7.1. First submission (use a teacher that is NOT yet a form teacher)
curl -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{
    "level": "Primary 2",
    "name": "Class 2A",
    "teacherEmail": "alice@example.com"
  }'
# Expect: 201 Created

# 7.2. Second submission with the same name (use a different teacher)
curl -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{
    "level": "Primary 2",
    "name": "Class 2A",
    "teacherEmail": "bobby@example.com"
  }'
# Expect: HTTP/1.1 409 Conflict
# Body:   {"error":"Class name already in use"}
```

**Acceptance check**: the second submission is rejected with `409` and
the exact error message `"Class name already in use"`.

---

## Scenario 8 — Teacher already assigned → `409`

**Goal**: verify `FR-005` and the race-safe `UNIQUE(classes.form_teacher_email)`
constraint. This is the "two simultaneous submissions with the same
form teacher" case (a manual approximation; see Scenario 12 for the
automated race test).

```bash
# 8.1. Alice is already a form teacher of Class 1A (from Scenario 1).
#      Submit another class with Alice as the form teacher.
curl -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{
    "level": "Primary 2",
    "name": "Class 2B",
    "teacherEmail": "alice@example.com"
  }'
# Expect: HTTP/1.1 409 Conflict
# Body:   {"error":"Teacher already assigned"}
```

**Acceptance check**: the second submission is rejected with `409` and
the exact error message `"Teacher already assigned"`.

---

## Scenario 9 — Non-JSON content type → `415`

**Goal**: verify the `415` entry in the cross-cutting status code table
([`003-backend-api-db/spec.md`](../003-backend-api-db/spec.md) and the
`002-classes/spec.md` Clarifications, Session 2026-06-18, Q4).

```bash
curl -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: text/plain" \
  -d 'level=Primary+1&name=Class+1E&teacherEmail=alice@example.com'
# Expect: HTTP/1.1 415 Unsupported Media Type
# Body:   {"error":"Content-Type must be application/json"}
```

**Acceptance check**: the API rejects `text/plain` with `415` and the
envelope message.

---

## Scenario 10 — Levels list

**Goal**: verify `GET /api/levels` returns the seeded list.

```bash
curl -i http://localhost:3000/api/levels
# Expect: HTTP/1.1 200 OK
# Body:   {"data":[
#           {"name":"Primary 1","active":true},
#           {"name":"Primary 2","active":true},
#           ...
#           {"name":"Secondary 4","active":true}
#         ]}
```

**Acceptance check**: 10 entries, all `active: true`, no duplicate
names.

---

## Scenario 11 — Persistence across server restart

**Goal**: verify `FR-012` (data survives restart) and the cross-feature
FK (the class survives a restart that boots against a clean container
without re-running anything beyond the migrations).

```bash
# 11.1. Create a class
curl -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{"level":"Secondary 1","name":"Class Sec1A","teacherEmail":"alice@example.com"}'
# Expect: 201 Created

# 11.2. Restart the app container
docker compose -f docker/docker-compose.yml restart app

# 11.3. List classes
curl http://localhost:3000/api/classes
# Expect: "Class Sec1A" is still in the data array with form-teacher
#         name resolved.
```

**Acceptance check**: the class created before the restart is present
after the restart, and the form-teacher FK is still intact.

---

## Scenario 12 — Race-safe form-teacher uniqueness (`SC-004`)

**Goal**: verify `SC-004` ("at most one class per teacher holds under
concurrent submissions") end-to-end. This is a quick manual check; the
formal race is covered by the integration suite.

```bash
# 12.1. Make sure Alice is NOT yet a form teacher (clean slate)
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "DELETE FROM classes WHERE form_teacher_email='alice@example.com';"

# 12.2. Fire 10 parallel POSTs with the same teacherEmail
for i in $(seq 1 10); do
  curl -s -o /tmp/r$i.json -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/classes \
    -H "Content-Type: application/json" \
    -d "{\"level\":\"Primary 1\",\"name\":\"Class Race $i\",\"teacherEmail\":\"alice@example.com\"}" &
done
wait

# 12.3. Tally the responses
grep -l "Teacher already assigned" /tmp/r*.json | wc -l
# Expect: 9
grep -l "201" /tmp/r*.json  # Expect: 1 (or check via the actual status code)
```

**Acceptance check**: exactly one of the 10 submissions succeeds; the
other 9 return `409` with `"Teacher already assigned"`. The race is
serialised by the `UNIQUE(classes.form_teacher_email)` index.

---

## Scenario 13 — Unit tests (no network, no live DB)

```bash
npm run test:unit
# Expect: all *.spec.ts in tests/unit/ pass.
#   - class.validation.spec.ts: happy path + each rejection path
#   - class.repository.spec.ts: insert / find / uniqueness / FK behaviour
#   - level.repository.spec.ts: insert / find active
#   (plus the 001-teachers unit suite)
```

---

## Scenario 14 — Integration tests (full DB)

```bash
# Bring up the test-only MySQL
docker compose -f docker/docker-compose.test.yml up -d

# Run the integration suite
npm run test:integration
# Expect: all *.spec.ts in tests/integration/ pass.
#   - classes.api.spec.ts: POST + GET via the Next.js server, against the
#     test DB (covers 404 teacher-not-found, 409 duplicate-name,
#     409 teacher-already-assigned)
#   (plus the 001-teachers integration suite)

docker compose -f docker/docker-compose.test.yml down
```

---

## Scenario 15 — GET /api/classes JOIN performance (informal)

**Goal**: confirm the JOIN against `teachers` (see
[research.md §2.6](./research.md#26-get-apiclasses-join-strategy))
stays sub-second at the Stage 1 upper bound.

```bash
# 15.1. Seed up to 500 teachers + 500 classes (use a loop; not provided here)
#       or use the test fixture if available.

# 15.2. Time the GET
time curl -s http://localhost:3000/api/classes > /dev/null
# Expect: real < 0.2s on a dev laptop.
```

This is a `TODO(FEATURE_002)` item (per the `plan.md` Constitution
Check); it is informal and dev-only. The integration suite does not
gate on it.

---

## What to check on failure

- **`docker compose -f docker/docker-compose.yml logs app`** — application
  logs. Look for typeORM migration errors, unhandled rejections, or 500
  responses.
- **`docker compose -f docker/docker-compose.yml logs mysql`** — DB logs.
  Look for connection errors, constraint violation traces, or migration
  failures.
- **`docker compose -f docker/docker-compose.yml exec mysql mysql -uroot
  -p"$MYSQL_ROOT_PASSWORD" admin -e "SHOW TABLES; SELECT * FROM levels;"`**
  — manual inspection of the schema and seed data.
- **For cross-feature issues** (e.g., the form-teacher FK): check that
  the `001-teachers` migrations ran first. The migration log should show
  `Migrations run: 4` (not 2) after both plans are applied.

If a quickstart scenario fails, the most common causes are:
1. The app container is still running the migration on first boot — wait
   5–10 s and retry.
2. The `levels` or `subjects` table is empty (the seed migration did not
   run) — restart the app container.
3. The Teachers feature is not yet built — the form-teacher FK will
   fail with a `1452` (`Cannot add or update a child row: a foreign key
   constraint fails`) error. Run the `001-teachers` plan first.
4. The `.env` for the app is missing the `DB_HOST=mysql` entry —
   re-create it from `.env.example`.
5. The port `3000` is already in use — stop the conflicting process or
   remap the port in `docker/docker-compose.yml`.