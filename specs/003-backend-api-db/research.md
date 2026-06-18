# Research: Backend APIs and DB Schema (003-backend-api-db)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)

This document captures the cross-cutting Technical Context decisions for
`003-backend-api-db`. The stack is inherited from
[`001-teachers`](../001-teachers/research.md) and
[`002-classes`](../002-classes/research.md); this research focuses on what
the 003 feature specifically owns:

- the cross-cutting HTTP contract (status codes, error envelope, content-type
  gate, retry semantics for 503),
- the cross-cutting data-integrity contract (FKs, unique indexes, race-safety),
- the migration-order discipline that ties 001 and 002 into one coherent set,
- and the seed-list pattern that `subjects` and `levels` share.

---

## 3.1. Scope boundary — what 003 owns vs inherits

**Decision**: 003 is a **cross-cutting feature** that owns the *contract*
and the *data-layer guarantees* shared by 001 and 002. It introduces **no
new tables** (those live with 001/002), **no new endpoints** (those live
with 001/002), and **no new UI**. Its deliverables are:

1. The `lib/api/` cross-cutting helpers used by every route handler
   (`errorEnvelope`, `jsonError`, `jsonCreated`, `requireJson`).
2. The migration set ordering and the second-migration seed-list pattern
   (per FR-017).
3. The cross-feature `FOREIGN KEY` discipline (per FR-007, FR-009a,
   FR-009b).
4. The single source of truth for the status-code table (per FR-013).

**Rationale**:
- The spec's User Story 1 ("Persist Teachers and Classes Reliably"), User
  Story 2 ("Enforce Data Integrity Rules at the Data Layer"), and User
  Story 3 ("Expose a Consistent API Contract") are all explicitly
  *cross-cutting*. They are not deliverable as a per-entity plan; they
  must be owned by a single feature that all other features depend on.
- The `001-teachers` and `002-classes` plans both end with "this plan
  inherits the contract from 003"; making 003 the contract owner matches
  that declaration and removes the duplicated source-of-truth risk.
- The Constitution's Stage Scope already locks in 003 as the data-model
  owner: "the MySQL tables backing Teachers and Classes, as defined in
  `specs/003-backend-api-db/spec.md` and locked into typeORM entities
  with matching Joi schemas." The 003 plan is the place where the
  cross-table FKs and the migration set are pinned.

**Alternatives considered**:
- **Own the contract from inside 001 and 002 separately**: rejected —
  the spec demands *one* status-code table, *one* envelope shape, *one*
  migration order, and *one* FK discipline. Two contracts would
  inevitably drift.
- **Make 003 a thin README / no-code feature**: rejected — the spec
  requires explicit `data-model.md` deliverables, unit tests, and
  migration code (FR-016, FR-017, SC-006). The feature is small but it
  is *not* empty.

---

## 3.2. Cross-cutting status code table (FR-013) — single source of truth

**Decision**: The status code table in this plan is the *only* definition
in the repo. The 001 and 002 plans and contracts reference it; no other
file may add or override entries.

| Condition | Status | Body envelope | Notes |
|---|---|---|---|
| `POST` body validates, row inserted | `201 Created` | `{ ...entity }` | The `201` body is the entity, per `POST /api/teachers` and `POST /api/classes` examples in the assignment |
| `GET` list returns (any number, including 0) | `200 OK` | `{ "data": [...] }` | Empty array is `200`, not `204` |
| Body missing / malformed / fails Joi / fails extra-field policy | `400 Bad Request` | `{ "error": "..." }` | All `400`s share the envelope |
| `POST /api/classes` with unknown `teacherEmail` | `404 Not Found` | `{ "error": "Teacher not found" }` | Teachers-only — see below |
| Duplicate email / duplicate class name / duplicate form teacher / unknown subject / unknown level | `409 Conflict` | `{ "error": "..." }` | All integrity violations share the envelope |
| `Content-Type` is not `application/json` on a body-carrying request | `415 Unsupported Media Type` | `{ "error": "Content-Type must be application/json" }` | Enforced by `requireJson()` at the top of every body-carrying route handler |
| Unhandled server failure | `500 Internal Server Error` | `{ "error": "Internal server error" }` | Stack traces NEVER leak; logger records them |
| Data store briefly unreachable | `503 Service Unavailable` | `{ "error": "Service temporarily unavailable, please retry" }` | Surface a retry hint; the write MUST be atomic (no partial writes) |

**Rationale**:
- The 003 spec Clarifications, Session 2026-06-18 (Q3) explicitly unify
  this table across `001`, `002`, and `003`. Two code paths to the same
  status code (`415` from the API helper vs. `415` from a Joi
  `unknown(true)` rule, for instance) would diverge. One helper, one
  rule.
- The assignment file's "Important!" section explicitly demands strict
  adherence to the given specs because "Your API may be subjected to
  automated test tools". Splitting the table across plans makes that
  adherence harder to audit. 003 owns it.
- `404 Not Found` is **teachers-only** — the assignment exposes no
  "GET /api/teachers/:id" or "GET /api/classes/:id", so a `404` is
  only meaningful as "the form teacher referenced by the new class
  does not exist". The table makes this explicit; a future
  `GET /api/teachers/:id` would extend the table in a follow-up
  amendment.

**Alternatives considered**:
- **Per-plan status code tables**: rejected — the 003 spec already
  resolved this by propagating `415` and `503` upward.
- **RFC-7807 Problem Details (`application/problem+json`) instead of the
  `{ "error": "..." }` envelope**: rejected — the assignment file
  prescribes the envelope shape verbatim, and FR-012 hard-codes it.

---

## 3.3. Cross-cutting route-handler pipeline (415, error envelope)

**Decision**: A single `withApiContract(handler)` wrapper applies the
cross-cutting rules in this order, before the handler body runs:

1. **Content-type gate (415)** — if the request carries a body and the
   `Content-Type` is not `application/json`, short-circuit with
   `{ "error": "Content-Type must be application/json" }` and `415`.
2. **Handler runs** — the handler does Joi validation (→ 400), DB call
   (→ 409 / 404 / 503), etc.
3. **Unhandled-rejection guard (500)** — any throw that escapes the
   handler is caught, logged with its stack trace, and rendered as
   `{ "error": "Internal server error" }` with status `500`.

**Rationale**:
- The "Important!" section of the assignment says automated test tools
  will probe the API. The fastest way to make every probe pass is to
  centralise the rules in one wrapper and let the per-endpoint
  handlers focus on business logic.
- Joi's default behaviour throws a `ValidationError` whose
  `.message` is already a human-readable string. The wrapper maps it
  to `400` without leaking the stack. Joi's `error.details` are
  available to handlers that want a structured `details` field, but
  the Stage 1 envelope is just `{ "error": "..." }` per FR-012.
- `415` enforcement has to happen *before* the body is read and
  parsed — otherwise a `text/plain` body would be parsed as a string
  and then rejected by Joi with a confusing "must be of type object"
  message.

**Route-handler sketch** (final code lives in `lib/api/route.ts`):

```ts
// lib/api/route.ts (sketch, not the final code)
export function withApiContract<T>(
  handler: (req: NextRequest) => Promise<Response>,
): (req: NextRequest) => Promise<Response> {
  return async (req) => {
    try {
      if (hasBody(req) && req.headers.get("content-type") !== "application/json") {
        return jsonError(415, "Content-Type must be application/json");
      }
      return await handler(req);
    } catch (e) {
      log.error("Unhandled error in route handler", e);
      return jsonError(500, "Internal server error");
    }
  };
}
```

**Alternatives considered**:
- **Express-style middleware chain inside Next.js Route Handlers**:
  rejected — Next.js 15 App Router does not have a middleware
  composition story for Route Handlers (middleware only runs at the
  Edge, before the route handler). A small in-handler wrapper is the
  idiomatic fit.
- **Per-handler manual `if` checks**: rejected — duplicated boilerplate
  in every handler is exactly the drift surface the 003 plan exists
  to eliminate.

---

## 3.4. Reference-list seed pattern (FR-017) — second-migration idempotent insert

**Decision**: The `subjects` and `levels` reference tables are populated
by **separate migrations from the schema migrations**, named with a
distinct timestamp suffix (`-SeedSubjects`, `-SeedLevels`). Each
seed migration uses `INSERT IGNORE` so re-running it on a populated
database is a no-op. There is **no** boot-time seeder, no separate
`npm run seed` step, no manual SQL file, no `db:seed` script.

**Final migration set (after all three plans run)**:

| Timestamp | File | Owner | Purpose |
|---|---|---|---|
| 1700000000000 | `InitSchema.ts` | 001-teachers | `subjects`, `teachers`; `UNIQUE(teachers.email)`; `FK(teachers.subject → subjects.name)` |
| 1700000000001 | `SeedSubjects.ts` | 001-teachers | `INSERT IGNORE` the Stage 1 subjects seed |
| 1700000000002 | `InitClasses.ts` | 002-classes | `levels`, `classes`; `UNIQUE(classes.name)`; `UNIQUE(classes.form_teacher_email)`; `FK(classes.level → levels.name)`; `FK(classes.form_teacher_email → teachers.email)` |
| 1700000000003 | `SeedLevels.ts` | 002-classes | `INSERT IGNORE` the Stage 1 levels seed |

**Rationale**:
- The 003 spec Clarifications, Session 2026-06-18 (Q1, Q4) pin this
  exactly: "Second migration (separate from the schema migration)
  that idempotently inserts the seed list. The seed list is inside
  the version-controlled migration set, runs alongside the schema
  migration on `docker compose up`, and is idempotent on subsequent
  boots. No separate `npm run seed` step, no boot-time seeder, no
  manual SQL file."
- `INSERT IGNORE` is the right tool: it skips rows that violate the
  primary-key `UNIQUE` constraint but applies the rest. This makes
  the migration safe to re-run on a populated DB.
- typeORM migrations are ordered by the timestamp prefix in the file
  name. Putting `-SeedSubjects` and `-SeedLevels` *after* the schema
  migration that creates the table is mechanical; there is no
  application code to coordinate.
- Avoiding a separate `npm run seed` keeps the
  `docker compose up` experience to a single command (per the
  Constitution's "one process" rule and the assignment's "Clear
  instructions to run a working local instance" requirement in the
  `README.md` contract).

**Alternatives considered**:
- **Boot-time seeder in the app code** (`if (!subjects.length) seed()`):
  rejected — adds an app-code path that can race with a concurrent
  `GET /api/subjects`, and the seeder would have to handle
  re-deploys that wipe the seed list out of band. A migration is
  the right place for "the data this app version needs to run".
- **Separate `npm run seed` step**: rejected — the user has to know
  to run it; it is easy to forget; it produces an empty DB on
  fresh-checkout without warning.
- **Manual SQL file checked into `docker/mysql/init/`**: rejected —
  the assignment says "Repeatable" / "single command" / `docker
  compose up` should bring the schema up. A manual file outside the
  typeORM migration set would drift from the entity definitions.

---

## 3.5. Cross-feature referential integrity (FR-007, FR-009a, FR-009b)

**Decision**: Every cross-table invariant is enforced by a DB-level
constraint. Application code defends the same invariant *before* the
write so it can return a clean status code, but the DB constraint is
the last word (so direct writes that bypass the API are still rejected).

| Invariant | DB-level mechanism | Application-level defence | Code path |
|---|---|---|---|
| Teacher email unique | `UNIQUE(teachers.email)` | `findTeacherByEmail` pre-INSERT check (for 404 vs 409 distinction) | `001-teachers` |
| Class name globally unique | `UNIQUE(classes.name)` | None (the 409 message is sufficient) | `002-classes` |
| Form teacher email unique | `UNIQUE(classes.form_teacher_email)` | `findClassByFormTeacherEmail` pre-INSERT check | `002-classes` |
| Form teacher email refers to existing teacher | `FK(classes.form_teacher_email → teachers.email)` | `findTeacherByEmail` pre-INSERT check | `002-classes` |
| Teacher subject refers to active subject | `FK(teachers.subject → subjects.name)` | `buildCreateTeacherSchema()` Joi `valid(...activeSubjectNames)` | `001-teachers` |
| Class level refers to active level | `FK(classes.level → levels.name)` | `buildCreateClassSchema()` Joi `valid(...activeLevelNames)` | `002-classes` |
| Subject / level referenced by live data cannot be removed or deactivated | Implicit in FK + `ON DELETE RESTRICT`; `active = true` is enforced by the application's "always read `WHERE active = true`" rule (deactivation is out of Stage 1 scope per FR-009b) | n/a | 003 |

**Rationale**:
- The 003 spec FR-006, FR-007, FR-008, FR-009, FR-009a, FR-009b are
  explicit about "the data layer MUST enforce". Constitution Principle V
  (Simplicity) says the simplest defence that works is the right one —
  for relational data, that is the DB constraint.
- `ON DELETE RESTRICT` is the default in MySQL. We do not commit to
  `CASCADE` or `SET NULL` because Stage 1 has no DELETE on teachers
  (per the Stage Scope). Future-stage DELETE on teachers would have to
  amend this decision explicitly.
- FR-009b ("a subject or level referenced by an existing teacher or
  class cannot be removed or marked inactive") is automatically
  satisfied by the existing FK + the application's
  "always-read-active" rule. The DB itself doesn't enforce `active`
  (it's a column on the reference table, not a constraint between
  tables), but the application never reads inactive rows, so a
  deactivated row has no effect. A future-stage admin endpoint that
  can deactivate a reference list row would have to either (a) check
  no live rows reference it, or (b) leave deactivation as a
  documentation-only operation. Either way, this is Stage 2 work and
  is out of Stage 1 scope (per the spec's Assumptions).

**Alternatives considered**:
- **Application-level only (no DB constraints)**: rejected — fails the
  "even direct writes that bypass the API" requirement (FR-006, FR-008,
  FR-009) and the race-safety property (two concurrent `INSERT`s
  with the same email would both pass an application-level check).
- **`ON DELETE CASCADE`**: rejected — Stage 1 has no DELETE; the
  future-stage decision belongs to that plan. `RESTRICT` is the safe
  default.
- **Triggers for active-row protection**: rejected — MySQL triggers
  add operational complexity and are easy to bypass with
  `DEFINER = CURRENT_USER` settings. The application-level
  "always-read-active" rule is sufficient for Stage 1 and is
  trivially testable.

---

## 3.6. Race-safety of the four constraints (SC-002, SC-007)

**Decision**: Every uniqueness / referential constraint is enforced by a
DB-level mechanism that serialises concurrent writes. The
application's pre-INSERT check exists only to translate the failure
into a clean status code; it is **not** the primary defence.

| Race | DB-level defence | Application-level secondary defence |
|---|---|---|
| Two concurrent `POST /api/teachers` with the same email | `UNIQUE(teachers.email)` → `QueryFailedError` code `ER_DUP_ENTRY` (1062) on the second `INSERT` | none — the route handler maps the typeORM error to `409 "Email already in use"` |
| Two concurrent `POST /api/classes` with the same `name` | `UNIQUE(classes.name)` → `ER_DUP_ENTRY` on the second `INSERT` | none |
| 10 concurrent `POST /api/classes` with the same `teacherEmail` (SC-007) | `UNIQUE(classes.form_teacher_email)` → 9 of 10 fail with `ER_DUP_ENTRY` | the pre-INSERT `findTeacherByEmail` only catches the existence-vs-duplicate distinction for the *first* request; the other 9 race past it and hit the DB constraint |
| Two concurrent `POST /api/classes` where the first deletes the referenced teacher before the second runs | `FK(classes.form_teacher_email → teachers.email)` → `QueryFailedError` code `ER_NO_REFERENCED_ROW_2` (1452) on the second `INSERT` | the pre-INSERT `findTeacherByEmail` catches the common case; the FK catches the race window |

**Rationale**:
- The 003 spec SC-007 is explicit: "Under a load of 10 concurrent
  attempts to create a class with the same form teacher, at most one
  attempt succeeds and the other nine are rejected with the agreed
  integrity-error status code". Only a `UNIQUE` index (or `PRIMARY
  KEY`) can guarantee that — application-level locks (`SELECT ...
  FOR UPDATE`) are heavier and offer no extra safety.
- The route handler's error-mapping logic lives in
  `lib/api/db-error.ts` (a small pure-function module, not a class).
  It inspects the `QueryFailedError.code` and the constraint name to
  decide which `409` message to return. Adding a new unique
  constraint only requires adding a new branch to that switch.

**Alternatives considered**:
- **Optimistic locking with a `version` column**: rejected — Stage 1 is
  Create + Read only; there is no update path to race on.
- **Pessimistic locking (`SELECT ... FOR UPDATE`)**: rejected —
  unnecessary complexity for Stage 1's scale (≤ 500 teachers, ≤ 500
  classes) and serialises writes the DB already serialises via the
  unique index.
- **`SERIALIZABLE` transaction isolation**: rejected — MySQL would
  re-run the transaction on every write and would surface a `1213`
  deadlock error that has nothing to do with the user's intent. The
  `UNIQUE` index is the right tool.

---

## 3.7. Test strategy — three tiers

**Decision**: The test runner is **Vitest** (inherited from
`001-teachers`). Three test tiers cover the 003 cross-cutting contract:

1. **Unit (`tests/unit/`)** — pure-function helpers. No DB, no network.
   - `tests/unit/api-error.spec.ts` — every status code in the table is
     produced by the matching helper with the correct body shape.
   - `tests/unit/route-wrapper.spec.ts` — `withApiContract` returns
     `415` for non-JSON content types, `500` for thrown errors, and
     the inner handler's response otherwise.
   - `tests/unit/db-error.spec.ts` — every typeORM
     `QueryFailedError` code in the mapping is translated to the
     correct status and message.

2. **Contract (`tests/contract/`)** — exercise the Next.js server in
   isolation (no real DB; uses the test `DataSource` against a
   per-process SQLite or in-memory MySQL fixture).
   - `tests/contract/teachers.api.spec.ts` — `POST` + `GET
     /api/teachers`, all four status codes.
   - `tests/contract/classes.api.spec.ts` — `POST` + `GET /api/classes`,
     including the 404 (teacher-not-found) and 409 (teacher-already-
     assigned, duplicate-name) paths.
   - `tests/contract/subjects.api.spec.ts` — `GET /api/subjects`.
   - `tests/contract/levels.api.spec.ts` — `GET /api/levels`.

3. **Integration (`tests/integration/`)** — real MySQL container, real
   typeORM migrations, end-to-end. Runs the SC-007 race test (10
   concurrent POSTs with the same form teacher).
   - `tests/integration/cross-cutting.spec.ts` — restart the app
     container mid-test, verify SC-001 (data survives restart); run
     the 10-concurrent-POST race, verify SC-007.
   - `tests/integration/migration.spec.ts` — `docker compose down -v`
     → `up` → schema is rebuilt from the migrations alone, no
     manual SQL (verifies FR-016, SC-006).

**Rationale**:
- The Constitution's Principle III (Unit Tests Required) says every
  domain rule must be covered by a unit test at the moment the feature
  is marked done. The 003 cross-cutting rules are the *most* domain-
  centric in the project (they pin the contract that the automated
  tests in the assignment will probe); the test pyramid above puts
  the highest-value assertions in the cheapest tier.
- `db-error.spec.ts` is the unit-tier mirror of the integration
  race test: the unit test maps codes to messages without the DB; the
  integration test proves the codes appear under load. Together they
  pin both halves of the contract.

**Alternatives considered**:
- **Only integration tests**: rejected — slow, fragile, hard to
  diagnose. The unit-tier mapping table is small and pure; testing it
  in isolation is a 30-second test.
- **Supertest with a mocked DB**: rejected — `supertest` is for
  Express-style servers. Next.js Route Handlers are best exercised
  by importing the handler directly in Vitest and calling it with a
  `NextRequest` mock, which is what the contract tier uses.

---

## 3.8. Cross-cutting dependency on `001-teachers` and `002-classes`

**Decision**: The 003 feature has zero new dependencies; it consumes
the same `next`, `typeorm`, `mysql2`, `joi`, `vitest`, and `dotenv`
versions that 001 already pinned.

**Rationale**:
- The 003 deliverables are pure-function helpers (`lib/api/*.ts`),
  migration code (in `lib/db/migrations/`), and tests. None of those
  introduce a new third-party library.
- Constitution Principle V (Simplicity): "no dependencies added
  because we might need it". The 003 plan is satisfied by the
  already-installed stack.

**Alternatives considered**:
- **`zod` instead of `joi`**: rejected — the 001 plan pinned Joi and
  Principle VII says the Joi schema for each entity mirrors the
  typeORM columns field-for-field. Switching to Zod would force a
  rewrite of every existing entity schema.
- **A new HTTP framework (Fastify / Hono / tRPC)**: rejected — the
  Constitution says "Next.js Route Handlers" are the API surface.
  003 inherits that.

---

## 3.9. Container layout — inherited, no change

**Decision**: 003 inherits the `docker compose` layout with two
services (`app`, `mysql`) from `001-teachers` (see
[`001-teachers/research.md` §1.2](../001-teachers/research.md)). No
new container, no new volume, no new network.

**Rationale**:
- 003 adds zero new processes. The cross-cutting helpers run inside
  the existing Next.js app container; the migration set runs inside
  the existing MySQL container; the tests run inside the existing
  `docker-compose.test.yml` setup.
- The `docker compose up` flow already runs all migrations in
  timestamp order; adding the 002 migrations to the same flow is a
  no-op.

**Alternatives considered**: none — there is no design choice to
make here. 003 is a logic-layer change, not an infrastructure change.

---

## 3.10. Configuration — same `.env`, same `lib/config.ts`

**Decision**: The runtime configuration loader (`lib/config.ts`,
inherited from `001-teachers`) is unchanged. The `DB_HOST=mysql` (the
docker-network alias for the MySQL service) is the only configuration
the new migrations touch.

**Rationale**:
- The 003 feature does not introduce new env vars, new secrets, or
  new feature flags.
- Per the Constitution → Configuration section, runtime config goes
  via `.env` (dotenv); secrets go via `.env.local` (gitignored). The
  repo-level `.env` (JSON, model config only) is unrelated.

**Alternatives considered**: none.
