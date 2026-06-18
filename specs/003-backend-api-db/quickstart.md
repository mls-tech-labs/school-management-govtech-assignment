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
- the migration-set order and idempotency (`FR-016`, `FR-017`,
  `SC-006`),
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

# 3. Bring up the app + MySQL in Docker (runs all 4 migrations on first boot)
docker compose -f docker/docker-compose.yml up -d --build

# 4. Wait for the app container to finish running the migrations
docker compose -f docker/docker-compose.yml logs -f app
#   Look for: "Migrations run: 4" + "Listening on http://localhost:3000"
```

After step 4, the app is on `http://localhost:3000`, MySQL is on
`localhost:3306` (inside the docker network), and the schema has 4
tables (`subjects`, `teachers` from `001`; `levels`, `classes` from
`002`) — both reference lists are seeded. Verify with:

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

# 1.1 POST /api/teachers (missing name)
curl -s -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{"subject":"Mathematics","email":"x@x.com","contactNumber":"91234567"}' \
  | jq .

# 1.2 POST /api/classes (missing teacherEmail)
curl -s -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{"level":"Primary 1","name":"Class Z"}' \
  | jq .

# 1.3 GET /api/subjects (no body — should still 200; sanity check)
curl -s http://localhost:3000/api/subjects | jq .

# 1.4 GET /api/levels (no body — should still 200; sanity check)
curl -s http://localhost:3000/api/levels | jq .
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
# 2.1 POST /api/teachers with text/plain
curl -s -i -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: text/plain" \
  -d 'name=Mary&subject=Mathematics&email=teachermary@gmail.com&contactNumber=68129414'

# 2.2 POST /api/classes with form-urlencoded
curl -s -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'level=Primary+1&name=Class+1A&teacherEmail=alice@example.com'

# 2.3 POST /api/teachers with no Content-Type header at all
curl -s -i -X POST http://localhost:3000/api/teachers \
  -d '{"name":"NoHeader","subject":"Mathematics","email":"noh@example.com","contactNumber":"91234567"}'

# 2.4 POST /api/teachers with charset suffix "application/json; charset=utf-8"
curl -s -i -X POST http://localhost:3000/api/teachers \
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
# 3.1 POST /api/teachers with an unknown subject
curl -s -i -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","subject":"Underwater Basket Weaving","email":"bob@example.com","contactNumber":"91234567"}'

# 3.2 POST /api/classes with an unknown level
curl -s -i -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{"level":"Kindergarten 1","name":"Class K1","teacherEmail":"alice@example.com"}'

# 3.3 POST /api/teachers with a subject that exists but is inactive (deactivate it first)
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "UPDATE subjects SET active = false WHERE name = 'Music';"

curl -s -i -X POST http://localhost:3000/api/teachers \
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
  -e "INSERT INTO teachers (name, subject, email, contact_number) VALUES ('Dup', 'Mathematics', 'mary@example.com', '91234567');"
# Expect: ERROR 1062 (23000): Duplicate entry 'mary@example.com' for key 'teachers.uq_teachers_email'

# 4.2 Duplicate class name (FR-009) — bypass the API, write directly
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "INSERT INTO classes (level, name, form_teacher_email) VALUES ('Primary 1', 'Class 1A', 'bob@example.com');"
# Expect: ERROR 1062 (23000): Duplicate entry 'Class 1A' for key 'classes.uq_classes_name'

# 4.3 Duplicate form teacher (FR-008) — bypass the API, write directly
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "INSERT INTO classes (level, name, form_teacher_email) VALUES ('Primary 2', 'Class 2Dup', 'mary@example.com');"
# Expect: ERROR 1062 (23000): Duplicate entry 'mary@example.com' for key 'classes.uq_classes_form_teacher'

# 4.4 Missing form teacher (FR-007) — bypass the API, write directly
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "INSERT INTO classes (level, name, form_teacher_email) VALUES ('Primary 2', 'Class Ghost', 'ghost@example.com');"
# Expect: ERROR 1452 (23000): Cannot add or update a child row: a foreign key constraint fails
```

**Acceptance check**: every direct `INSERT` is rejected with a MySQL
error code (`1062` for unique, `1452` for FK). The DB layer is the
last word; the API is a convenience on top.

---

## Scenario 5 — Schema is rebuilt from migrations alone (FR-016, SC-006)

**Goal**: verify the schema can be recreated from scratch by running
the migrations, with no manual SQL.

```bash
# 5.1 Tear down the containers AND the volume (so MySQL data is wiped)
docker compose -f docker/docker-compose.yml down -v

# 5.2 Bring the stack back up; migrations run on first boot
docker compose -f docker/docker-compose.yml up -d --build

# 5.3 Wait for migrations to finish
docker compose -f docker/docker-compose.yml logs -f app
#   Look for: "Migrations run: 4"

# 5.4 Verify the schema and seed data are present
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SHOW TABLES; SELECT COUNT(*) AS n_subjects FROM subjects; SELECT COUNT(*) AS n_levels FROM levels;"
# Expect: 4 tables; 9 subjects; 10 levels
```

**Acceptance check**: after `down -v` + `up -d --build`, the schema
is identical to what it was before — 4 tables, both reference lists
populated by their seed migrations, no manual SQL was needed.

---

## Scenario 6 — Migrations are idempotent (FR-017, SC-006)

**Goal**: verify the second-migration seed pattern is re-runnable
without duplicating rows.

```bash
# 6.1 Manually re-run the schema and seed migrations (typeorm-ts-node-commonjs migration:run is idempotent)
docker compose -f docker/docker-compose.yml exec app \
  npx typeorm-ts-node-commonjs migration:run -d lib/db/data-source.ts

# 6.2 Re-check the seed row counts (must be unchanged)
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SELECT COUNT(*) AS n_subjects FROM subjects; SELECT COUNT(*) AS n_levels FROM levels;"
# Expect: 9 / 10 (unchanged from before)
```

**Acceptance check**: re-running the migration set on a populated DB
is a no-op. `INSERT IGNORE` skips the rows that violate the PK; the
schema migrations use `CREATE TABLE IF NOT EXISTS`. The test is the
single line "9 subjects, 10 levels" — if those numbers are still 9
and 10, idempotency holds.

---

## Scenario 7 — Persistence across server restart (SC-001, FR-012)

**Goal**: verify data survives a server restart with all attributes
intact.

```bash
# 7.1 Create a teacher and a class
curl -s -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -d '{"name":"Restart Teacher","subject":"Mathematics","email":"restart@example.com","contactNumber":"91234567"}'

curl -s -X POST http://localhost:3000/api/classes \
  -H "Content-Type: application/json" \
  -d '{"level":"Primary 1","name":"Class Restart","teacherEmail":"restart@example.com"}'

# 7.2 Restart the app container (NOT the MySQL container — the data must persist)
docker compose -f docker/docker-compose.yml restart app

# 7.3 List teachers and classes
curl -s http://localhost:3000/api/teachers | jq '.data[] | select(.email == "restart@example.com")'
curl -s http://localhost:3000/api/classes | jq '.data[] | select(.name == "Class Restart")'

# Expect (teacher): {"name":"Restart Teacher","subject":"Mathematics","email":"restart@example.com","contactNumber":"91234567"}
# Expect (class):   {"level":"Primary 1","name":"Class Restart","formTeacher":{"name":"Restart Teacher"}}
```

**Acceptance check**: both records are still present, with all
attributes intact. The cross-feature FK is still intact (the class
still resolves the form teacher by name).

---

## Scenario 8 — Race-safe form-teacher uniqueness (SC-007, FR-008)

**Goal**: verify that 10 concurrent `POST /api/classes` with the
same `teacherEmail` produce exactly one success and nine `409`s.

```bash
# 8.1 Make sure the test teacher is NOT yet a form teacher (clean slate)
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "DELETE FROM classes WHERE form_teacher_email='restart@example.com';"

# 8.2 Fire 10 parallel POSTs with the same teacherEmail
for i in $(seq 1 10); do
  curl -s -o /tmp/r$i.json -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/classes \
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
race is serialised by `UNIQUE(classes.form_teacher_email)`; the
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
curl -s -i -X POST http://localhost:3000/api/classes \
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
# 10.1 Every teacher's `subject` resolves to an entry in `subjects.name`
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SELECT t.name AS teacher, t.subject FROM teachers t LEFT JOIN subjects s ON s.name = t.subject WHERE s.name IS NULL;"
# Expect: empty result set

# 10.2 Every class's `level` resolves to an entry in `levels.name`
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SELECT c.name AS class, c.level FROM classes c LEFT JOIN levels l ON l.name = c.level WHERE l.name IS NULL;"
# Expect: empty result set

# 10.3 Every class's `form_teacher_email` resolves to an entry in `teachers.email`
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" admin \
  -e "SELECT c.name AS class, c.form_teacher_email FROM classes c LEFT JOIN teachers t ON t.email = c.form_teacher_email WHERE t.email IS NULL;"
# Expect: empty result set
```

**Acceptance check**: all three left-join queries return empty
result sets. Every cross-feature FK is satisfied; the data layer is
internally consistent.

---

## Scenario 11 — Reference-list response shape (FR-009c)

**Goal**: verify `GET /api/subjects` and `GET /api/levels` return the
seeded list, filtered to `active = true`, in the agreed envelope.

```bash
# 11.1 GET /api/subjects
curl -s http://localhost:3000/api/subjects | jq '.data | length'
# Expect: 9

curl -s http://localhost:3000/api/subjects | jq '[.data[] | .name]'
# Expect: ["English", "Mathematics", "Science", "Chinese", "Malay", "Tamil", "Art", "Music", "Physical Education"]

# 11.2 GET /api/levels
curl -s http://localhost:3000/api/levels | jq '.data | length'
# Expect: 10

curl -s http://localhost:3000/api/levels | jq '[.data[] | .name]'
# Expect: ["Primary 1", "Primary 2", ..., "Secondary 4"]
```

**Acceptance check**: 9 subjects, 10 levels, all `active: true`, no
duplicates. The response shape matches `Subject` / `Level` in
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
#   - cross-cutting.spec.ts    — runs the SC-007 race test (10 concurrent POSTs); asserts exactly one 201 + nine 409s
#   - migration.spec.ts        — tears down the MySQL volume, rebuilds from migrations alone (SC-006)
#   (plus the 001-teachers and 002-classes integration suites)

docker compose -f docker/docker-compose.test.yml down
```

---

## What to check on failure

- **`docker compose -f docker/docker-compose.yml logs app`** —
  application logs. Look for typeORM migration errors, unhandled
  rejections, or 500 responses. The unhandled-rejection path
  *should* log the stack trace at `error` level and render
  `{ "error": "Internal server error" }` to the client.
- **`docker compose -f docker/docker-compose.yml logs mysql`** — DB
  logs. Look for connection errors, constraint violation traces, or
  migration failures.
- **`docker compose -f docker/docker-compose.yml exec mysql mysql
  -uroot -p"$MYSQL_ROOT_PASSWORD" admin -e "SHOW TABLES; SELECT *
  FROM subjects; SELECT * FROM levels;"`** — manual inspection of
  the schema and seed data.
- **For 415 / 503 / 500 issues**: check the `withApiContract`
  wrapper in `lib/api/route.ts` — that is the single source of truth
  for the cross-cutting rules. Any handler that does *not* go
  through `withApiContract` will skip the rules.
- **For cross-feature FK issues**: verify the migrations ran in the
  expected order. The app log should show
  `[InitSchema, SeedSubjects, InitClasses, SeedLevels]`. If
  `InitClasses` ran before `InitSchema`, the
  `fk_classes_form_teacher → teachers.email` FK creation will fail.

If a cross-cutting scenario fails, the most common causes are:

1. The app container is still running the migrations on first boot
   — wait 5–10 s and retry.
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
