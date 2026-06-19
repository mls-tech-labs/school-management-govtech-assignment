# Quickstart: Backend APIs and DB Schema (003-backend-api-db)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)
**Data model**: [./data-model.md](./data-model.md)
**Contracts**: [./contracts/](./contracts/) (`common.yaml`,
`teachers.yaml`, `classes.yaml`, `subjects.yaml`, `levels.yaml`)

This is a **cross-cutting** quickstart. The 003 feature owns the
shared API contract and the data-layer guarantees that
[`001-teachers`](../001-teachers/quickstart.md) and
[`002-classes`](../002-classes/quickstart.md) consume. The per-endpoint
UI / happy-path scenarios live in those per-feature quickstarts. The
scenarios here pin down the cross-cutting contract:

- the `{ "error": "..." }` envelope on every error,
- the `400 / 404 / 409 / 415 / 500 / 503` status-code table,
- the `Content-Type: application/json` gate (`415`),
- the user-prepared MySQL contract (`FR-016`, Session 2026-06-21) —
  the schema is created by the user; `docker compose up` does NOT
  run migrations,
- the version prefix `/api/v1.0/` on every endpoint (`FR-022`,
  Session 2026-06-21),
- the data-integrity rules at the DB layer (`FR-006..FR-009b`),
- the race-safety of the unique indexes (`SC-007`),
- and the persistence-across-restart property (`SC-001`).

If a per-endpoint happy path is needed (e.g., "add a teacher via the
form"), use the per-feature quickstarts. The scenarios here are the
ones that only make sense in the cross-cutting context.

---

## Prerequisites

- Docker Desktop (Docker Engine 24+ and Compose v2).
- Node.js LTS (≥ 20) and npm for local unit / contract / integration
  test runs.
- A free port `3000` (Next.js dev server) and `3306` (MySQL).
- The Teachers and Classes features already built and seeded with a
  few teachers + a few classes. Run the
  [`001-teachers quickstart`](../001-teachers/quickstart.md) and the
  [`002-classes quickstart`](../002-classes/quickstart.md) at least
  once if the environment is fresh — the cross-cutting scenarios
  assume the schema is up and at least one teacher + one class are
  present.

---

## Setup

```bash
# 1. Clone the repo and enter it (if not already done)
git clone <repo-url> pvt-edu-admin-project
cd pvt-edu-admin-project

# 2. Install dependencies (uses package.json with caret ranges, locked via package-lock.json)
npm install

# 3. Bring up MySQL separately and prepare the schema (per FR-016, Session 2026-06-21)
#    The user prepares the MySQL container with the full Stage 1 schema:
#    subjects (9 rows), teachers, levels (10 rows), classes;
#    audit columns, ulid CHAR(26) UNIQUE, FK constraints, UNIQUE indexes.
#    The application does NOT run migrations on boot.
docker compose -f docker/docker-compose.yml up -d mysql
# (then run your prepared SQL against the MySQL container, e.g. via
#  docker/mysql/init/01-schema-and-seed.sql or an equivalent manual script)

# 4. Bring up the app container (connects to the user-prepared MySQL; no migration step)
docker compose -f docker/docker-compose.yml up -d --build app
docker compose -f docker/docker-compose.yml logs -f app
#   Look for: "Listening on http://localhost:3000" (no migration log lines)
```

After step 4, the app is on `http://localhost:3000`, MySQL is on
`localhost:3306` (inside the docker network), and the schema has 4
tables (`subjects`, `teachers` from `001`; `levels`, `classes` from
`002`) — both reference lists are seeded by the user's SQL. Verify
with:

```bash
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SHOW TABLES; SELECT COUNT(*) AS n_subjects FROM subjects; SELECT COUNT(*) AS n_levels FROM levels;"
# Expect: 4 tables; 9 subjects; 10 levels
```

---

## Scenario 1 — The error envelope is the *only* error shape (FR-012, SC-004)

**Goal**: verify every error response across all four endpoints uses
`{ "error": "..." }`. This is the property the assignment file calls
out as "your API may be subjected to automated test tools".

```bash
# Trigger a 400 on each endpoint by sending a missing required field

# 1.1 POST /api/v1.0/teachers (missing name)
curl -s -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"subject":"Mathematics","email":"x@x.com","contactNumber":"91234567"}' \
  | jq .

# 1.2 POST /api/v1.0/classes (missing teacherEmail)
curl -s -X POST http://localhost:3000/api/v1.0/classes \
  -H "Content-Type: application/json" \
  -d '{"level":"Primary 1","name":"Class Z"}' \
  | jq .

# 1.3 GET /api/v1.0/subjects (no body — should still 200; sanity check)
curl -s http://localhost:3000/api/v1.0/subjects | jq .

# 1.4 GET /api/v1.0/levels (no body — should still 200; sanity check)
curl -s http://localhost:3000/api/v1.0/levels | jq .
```

**Acceptance check**: every error response has exactly one top-level
key, `error`, whose value is a non-empty string. There is no nested
`details` object, no `code` field, no `success: false` boolean. The
two `GET` calls return `{ "data": [...] }` (not the error envelope).

---

## Scenario 2 — The `415 Unsupported Media Type` gate is uniform (FR-010, FR-013)

**Goal**: verify every body-carrying endpoint rejects non-JSON
content types with `415` and the agreed error envelope.

```bash
# 2.1 POST /api/v1.0/teachers with text/plain
curl -s -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: text/plain" \
  -d 'name=Mary&subject=Mathematics&email=teachermary@gmail.com&contactNumber=68129414'

# 2.2 POST /api/v1.0/classes with form-urlencoded
curl -s -i -X POST http://localhost:3000/api/v1.0/classes \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'level=Primary+1&name=Class+1A&teacherEmail=alice@example.com'

# 2.3 POST /api/v1.0/teachers with no Content-Type header at all
curl -s -i -X POST http://localhost:3000/api/v1.0/teachers \
  -d '{"name":"NoHeader","subject":"Mathematics","email":"noh@example.com","contactNumber":"91234567"}'

# 2.4 POST /api/v1.0/teachers with charset suffix "application/json; charset=utf-8"
curl -s -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"name":"Mary","subject":"Mathematics","email":"mary@example.com","contactNumber":"91234567"}'
```

**Acceptance check**: requests 2.1, 2.2, 2.3 return `415` and a body
of `{ "error": "Content-Type must be application/json" }`. Request
2.4 returns `201` (or `409` if the email is already taken) — the
`charset=utf-8` suffix is accepted because the media-type *prefix* is
`application/json`.

---

## Scenario 3 — Unknown / inactive reference-list value is `400`, not `409` (FR-009a, FR-013)

**Goal**: verify that an unknown `subject` (for teachers) or `level`
(for classes) is rejected at validation time with `400 Invalid
subject` / `400 Invalid level`, not at the FK level with `409`.

```bash
# 3.1 POST /api/v1.0/teachers with an unknown subject
curl -s -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","subject":"Underwater Basket Weaving","email":"bob@example.com","contactNumber":"91234567"}'

# 3.2 POST /api/v1.0/classes with an unknown level
curl -s -i -X POST http://localhost:3000/api/v1.0/classes \
  -H "Content-Type: application/json" \
  -d '{"level":"Kindergarten 1","name":"Class K1","teacherEmail":"alice@example.com"}'

# 3.3 POST /api/v1.0/teachers with a subject that exists but is inactive (deactivate it first)
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "UPDATE subjects SET active = false WHERE name = 'Music';"

curl -s -i -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"Carl","subject":"Music","email":"carl@example.com","contactNumber":"91234567"}'

# Restore the active flag (or restart from scratch)
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "UPDATE subjects SET active = true WHERE name = 'Music';"
```

**Acceptance check**: all three return `400 Bad Request` and a body of
`{ "error": "Invalid subject" }` or `{ "error": "Invalid level" }` —
not `409 Conflict`. The Joi schema, generated at boot from the active
list, is the gate; the FK never has to fire for these cases.

---

## Scenario 4 — All four data-integrity rules are enforced at the DB layer (SC-002, FR-006..FR-009a)

**Goal**: verify the four uniqueness / referential constraints reject
direct writes that bypass the API.

```bash
# 4.1 Duplicate teacher email (FR-006) — bypass the API, write directly
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "INSERT INTO teachers (name, subject_id, email, contact_number) VALUES ('Dup', (SELECT id FROM subjects WHERE name='Mathematics'), 'mary@example.com', '91234567');"
# Expect: ERROR 1062 (23000): Duplicate entry 'mary@example.com' for key 'teachers.uq_teachers_email'

# 4.2 Duplicate class name (FR-009) — bypass the API, write directly
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "INSERT INTO classes (level_id, name, form_teacher_id) VALUES ((SELECT id FROM levels WHERE name='Primary 1'), 'Class 1A', (SELECT id FROM teachers WHERE email='bob@example.com'));"
# Expect: ERROR 1062 (23000): Duplicate entry 'Class 1A' for key 'classes.uq_classes_name'

# 4.3 Duplicate form teacher (FR-008) — bypass the API, write directly
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "INSERT INTO classes (level_id, name, form_teacher_id) VALUES ((SELECT id FROM levels WHERE name='Primary 2'), 'Class 2Dup', (SELECT id FROM teachers WHERE email='mary@example.com'));"
# Expect: ERROR 1062 (23000): Duplicate entry '<form_teacher_id>' for key 'classes.uq_classes_form_teacher'

# 4.4 Missing form teacher (FR-007) — bypass the API, write directly
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "INSERT INTO classes (level_id, name, form_teacher_id) VALUES ((SELECT id FROM levels WHERE name='Primary 2'), 'Class Ghost', 999999);"
# Expect: ERROR 1452 (23000): Cannot add or update a child row: a foreign key constraint fails
#   (FK `fk_classes_form_teacher` — `classes.form_teacher_id` → `teachers.id`)
```

**Acceptance check**: every direct `INSERT` is rejected with a MySQL
error code (`1062` for unique, `1452` for FK). The DB layer is the
last word; the API is a convenience on top.

---

## Scenario 5 — Schema is user-prepared (FR-016, Session 2026-06-21)

**Goal**: verify the schema is owned by the user, not by the app's
boot sequence. The `docker compose up` flow MUST NOT run a migration
step.

```bash
# 5.1 Tear down only the app container (MySQL is left running)
docker compose -f docker/docker-compose.yml stop app
docker compose -f docker/docker-compose.yml rm -f app

# 5.2 Verify the schema and seed data are still in MySQL
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SHOW TABLES; SELECT COUNT(*) AS n_subjects FROM subjects; SELECT COUNT(*) AS n_levels FROM levels;"
# Expect: 4 tables; 9 subjects; 10 levels

# 5.3 Re-bring up the app (no migration step; the schema is already there)
docker compose -f docker/docker-compose.yml up -d --build app
docker compose -f docker/docker-compose.yml logs -f app
#   Look for: "Listening on http://localhost:3000" (no migration log lines)
```

**Acceptance check**: after `stop app` + `rm -f app` + `up -d --build
app`, the schema is unchanged — 4 tables, both reference lists still
populated, no migration step ran. The application simply reconnects
to the existing MySQL container. This is the Stage 1
operational-rules contract.

---

## Scenario 6 — Removed (legacy migration idempotency check)

> **This scenario is removed in Stage 1** (per FR-016,
> Session 2026-06-21). The previous form of this scenario exercised
> `typeorm-ts-node-commonjs migration:run` against an already-seeded
> MySQL container and asserted that re-running the set was a no-op
> (`CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE`). The migration set
> (`InitSchema`, `SeedSubjects`, `InitClasses`, `SeedLevels`) is no
> longer part of the project source, so this verification is
> meaningless. The user-prepared MySQL is the schema source of
> truth; the app does not own the schema lifecycle in Stage 1.
> Preserved here as a numbered placeholder so the surrounding
> scenarios stay aligned with the spec's SC-006 numbering.

---

## Scenario 7 — Persistence across server restart (SC-001, FR-012)

**Goal**: verify data survives a server restart with all attributes
intact, including the `ulid` row handle (per FR-021).

```bash
# 7.1 Create a teacher and a class
curl -s -X POST http://localhost:3000/api/v1.0/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"Restart Teacher","subject":"Mathematics","email":"restart@example.com","contactNumber":"91234567"}'

curl -s -X POST http://localhost:3000/api/v1.0/classes \
  -H "Content-Type: application/json" \
  -d '{"level":"Primary 1","name":"Class Restart","teacherEmail":"restart@example.com"}'

# 7.2 Restart the app container (NOT the MySQL container — the data must persist)
docker compose -f docker/docker-compose.yml restart app

# 7.3 List teachers and classes
curl -s http://localhost:3000/api/v1.0/teachers | jq '.data[] | select(.email == "restart@example.com")'
curl -s http://localhost:3000/api/v1.0/classes | jq '.data[] | select(.name == "Class Restart")'

# Expect (teacher): {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7T","name":"Restart Teacher","subject":"Mathematics","email":"restart@example.com","contactNumber":"91234567"}
# Expect (class):   {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7U","level":"Primary 1","name":"Class Restart","formTeacher":{"name":"Restart Teacher"}}
```

**Acceptance check**: both records are still present, with all
attributes intact (including `ulid` — the 26-character Crockford
Base32 frontend-stable row handle). The cross-feature FK is still
intact (the class still resolves the form teacher by name). The
`ulid` returned on creation is the same `ulid` returned after
restart — it is persisted, not regenerated.

---

## Scenario 8 — Race-safe form-teacher uniqueness (SC-007, FR-008)

**Goal**: verify that 10 concurrent `POST /api/classes` with the
same `teacherEmail` produce exactly one success and nine `409`s.

```bash
# 8.1 Make sure the test teacher is NOT yet a form teacher (clean slate)
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "DELETE FROM classes WHERE form_teacher_id=(SELECT id FROM teachers WHERE email='restart@example.com');"

# 8.2 Fire 10 parallel POSTs with the same teacherEmail
for i in $(seq 1 10); do
  curl -s -o /tmp/r$i.json -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/v1.0/classes \
    -H "Content-Type: application/json" \
    -d "{\"level\":\"Primary 1\",\"name\":\"Class Race $i\",\"teacherEmail\":\"restart@example.com\"}" &
done
wait

# 8.3 Tally the responses
echo "=== 201 (success) ==="
grep -l '"name":"Class Race' /tmp/r*.json | wc -l   # Expect: 1
echo "=== 409 Teacher already assigned ==="
grep -l "Teacher already assigned" /tmp/r*.json | wc -l   # Expect: 9
echo "=== 500 (should be 0) ==="
grep -l "Internal server error" /tmp/r*.json | wc -l   # Expect: 0
```

**Acceptance check**: exactly one submission succeeds; the other
nine return `409` with `"Teacher already assigned"`. Zero `500`s. The
race is serialised by `UNIQUE(classes.form_teacher_id)`; the
pre-INSERT `findTeacherByEmail` is the *application-level* gate for
the `404 vs 409` distinction but the DB constraint is what makes the
race race-safe.

---

## Scenario 9 — Atomic write (FR-014)

**Goal**: verify a failed write does not leave partial data in the
store. We force the failure by violating the form-teacher
uniqueness after the pre-INSERT check has passed.

This scenario is best run as part of the integration test suite
(`tests/integration/atomic-write.spec.ts`). A manual version:

```bash
# 9.1 Insert a class with restart@example.com (from Scenario 8)
#     — already there as Class Restart.

# 9.2 Try to insert another class with restart@example.com
curl -s -i -X POST http://localhost:3000/api/v1.0/classes \
  -H "Content-Type: application/json" \
  -d '{"level":"Primary 2","name":"Class Partial","teacherEmail":"restart@example.com"}'
# Expect: HTTP/1.1 409 Conflict
# Body:   {"error":"Teacher already assigned"}

# 9.3 Verify NO new row was inserted
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SELECT COUNT(*) AS n FROM classes WHERE name = 'Class Partial';"
# Expect: 0
```

**Acceptance check**: the failed POST returns `409` and leaves the
table unchanged. The MySQL transaction is the unit of atomicity; the
typeORM `save()` is wrapped in a transaction by the repository
helper.

---

## Scenario 10 — Cross-feature consistency (the 003 spec owns this property)

**Goal**: verify the cross-feature relationships hold across both
features' data sets.

```bash
# 10.1 Every teacher's `subject_id` resolves to an entry in `subjects.id`
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SELECT t.name AS teacher, t.subject_id FROM teachers t LEFT JOIN subjects s ON s.id = t.subject_id WHERE s.id IS NULL;"
# Expect: empty result set

# 10.2 Every class's `level_id` resolves to an entry in `levels.id`
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SELECT c.name AS class, c.level_id FROM classes c LEFT JOIN levels l ON l.id = c.level_id WHERE l.id IS NULL;"
# Expect: empty result set

# 10.3 Every class's `form_teacher_id` resolves to an entry in `teachers.id`
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SELECT c.name AS class, c.form_teacher_id FROM classes c LEFT JOIN teachers t ON t.id = c.form_teacher_id WHERE t.id IS NULL;"
# Expect: empty result set
```

**Acceptance check**: all three left-join queries return empty
result sets. Every cross-feature FK is satisfied; the data layer is
internally consistent.

---

## Scenario 11 — Reference-list response shape (FR-009c, FR-021)

**Goal**: verify `GET /api/v1.0/subjects` and `GET /api/v1.0/levels`
return the seeded list, filtered to `active = true`, in the agreed
envelope — including the `ulid` row handle (per FR-021).

```bash
# 11.1 GET /api/v1.0/subjects
curl -s http://localhost:3000/api/v1.0/subjects | jq '.data | length'
# Expect: 9

curl -s http://localhost:3000/api/v1.0/subjects | jq '[.data[] | .name]'
# Expect: ["English", "Mathematics", "Science", "Chinese", "Malay", "Tamil", "Art", "Music", "Physical Education"]

curl -s http://localhost:3000/api/v1.0/subjects | jq '[.data[] | .ulid] | map(length) | unique'
# Expect: [26]   # every ulid is exactly 26 characters

# 11.2 GET /api/v1.0/levels
curl -s http://localhost:3000/api/v1.0/levels | jq '.data | length'
# Expect: 10

curl -s http://localhost:3000/api/v1.0/levels | jq '[.data[] | .name]'
# Expect: ["Primary 1", "Primary 2", ..., "Secondary 4"]

curl -s http://localhost:3000/api/v1.0/levels | jq '[.data[] | .ulid] | map(length) | unique'
# Expect: [26]
```

**Acceptance check**: 9 subjects, 10 levels, all `active: true`, no
duplicates, every `ulid` is exactly 26 characters of Crockford
Base32. The response shape matches `Subject` / `Level` in
`./contracts/subjects.yaml` and `./contracts/levels.yaml`.

---

## Scenario 12 — Unit tests (no network, no live DB)

```bash
npm run test:unit
# Expect: all *.spec.ts in tests/unit/ pass.
#   - api-error.spec.ts        — every status code in the cross-cutting table is produced by the matching helper
#   - route-wrapper.spec.ts    — withApiContract returns 415 for non-JSON content types, 500 for thrown errors
#   - db-error.spec.ts         — every typeORM QueryFailedError code is translated to the correct status
#   (plus the 001-teachers and 002-classes unit suites)
```

---

## Scenario 13 — Integration tests (full DB, including SC-007)

```bash
# Bring up the test-only MySQL
docker compose -f docker/docker-compose.test.yml up -d

# Run the integration suite
npm run test:integration
# Expect: all *.spec.ts in tests/integration/ pass.
#   - cross-cutting.spec.ts    — runs the SC-007 race test (10 concurrent POSTs); asserts exactly one 201 + nine 409s; asserts every response body carries `ulid`; asserts every endpoint lives under `/api/v1.0/`
#   (No `migration.spec.ts` in Stage 1 — the schema is user-prepared per FR-016, Session 2026-06-21.)
#   (plus the 001-teachers and 002-classes integration suites)

docker compose -f docker/docker-compose.test.yml down
```

---

## What to check on failure

- **`docker compose -f docker/docker-compose.yml logs app`** —
  application logs. Look for typeORM connection errors, unhandled
  rejections, or 500 responses. The unhandled-rejection path
  *should* log the stack trace at `error` level and render
  `{ "error": "Internal server error" }` to the client.
  **There is no migration log line in Stage 1** — if you see
  `Migrations run: ...`, the boot sequence is running migrations
  and the user-prepared-MySQL contract (FR-016) is being violated.
- **`docker compose -f docker/docker-compose.yml logs mysql`** — DB
  logs. Look for connection errors or constraint violation traces.
- **`docker compose -f docker/docker-compose.yml exec mysql mysql
  -uroot -p"$MYSQL_ROOT_PASSWORD" admin -e "SHOW TABLES; SELECT *
  FROM subjects; SELECT * FROM levels;"`** — manual inspection of
  the schema and seed data.
- **For 415 / 503 / 500 issues**: check the `withApiContract`
  wrapper in `lib/api/route.ts` — that is the single source of truth
  for the cross-cutting rules. Any handler that does *not* go
  through `withApiContract` will skip the rules.
- **For cross-feature FK issues**: verify the user-prepared MySQL
  container has the full Stage 1 schema: `subjects` with 9 rows,
  `teachers`, `levels` with 10 rows, `classes`, with the audit
  columns, `ulid CHAR(26) UNIQUE`, FK constraints
  (`fk_teachers_subject`, `fk_classes_level`,
  `fk_classes_form_teacher`), and `UNIQUE` indexes. Run
  `SHOW CREATE TABLE teachers;` etc. to confirm.

If a cross-cutting scenario fails, the most common causes are:

1. The MySQL container was not prepared by the user before the app
   container started — bring MySQL up first, run the user's SQL,
   then bring the app up.
2. A direct `INSERT` in a test violated a unique constraint but the
   test didn't expect the `1062` error code — fix the test, not the
   schema.
3. The `withApiContract` wrapper was not applied to a route handler
   — the handler returns Joi's raw error message instead of the
   `{ "error": "..." }` envelope. Apply the wrapper to every route
   handler in `app/api/**`.
4. A new unique constraint was added but `lib/api/db-error.ts` was
   not updated to map the new error code — the route handler falls
   through to the unhandled `throw e` → `500` path. Add the mapping.
5. The `.env` for the app is missing `DB_HOST=mysql` — re-create
   from `.env.example`.
6. The endpoint is being hit without the `/api/v1.0/` version prefix
   — the request will route to Next.js as a non-existent path and
   return a 404 from the framework, not from the cross-cutting
   contract. Add the `/api/v1.0/` prefix (per FR-022).
