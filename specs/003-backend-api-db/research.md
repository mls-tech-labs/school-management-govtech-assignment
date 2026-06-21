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
- the user-prepared MySQL contract that ties 001 and 002 together (per
  FR-016, Session 2026-06-21),
- and the seed-list pattern that `subjects` and `levels` share.

---

## 3.1. Scope boundary — what 003 owns vs inherits

**Decision**: 003 is a **cross-cutting feature** that owns the *contract*
and the *data-layer guarantees* shared by 001 and 002. It introduces **no
new tables** (those live with 001/002), **no new endpoints** (those live
with 001/002), and **no new UI**. Its deliverables are:

1. The `lib/api/` cross-cutting helpers used by every route handler
   (`errorEnvelope`, `jsonError`, `jsonCreated`, `requireJson`, and
   the `withApiContract` wrapper that enforces the `/api/v1.0/`
   version prefix per FR-022).
2. The user-prepared MySQL contract — the cross-cutting schema,
   audit columns, ULID column, FK constraints, UNIQUE indexes, and
   reference-list seed data are created by the user (per FR-016,
   Session 2026-06-21). There is no typeORM migration runner in
   Stage 1.
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
  requires explicit `data-model.md` deliverables and unit tests. The
  feature is small but it is *not* empty. (FR-016 and FR-017 are no
  longer the source of migration code in Stage 1 — they are
  superseded by the user-prepared MySQL contract — but the
  `data-model.md` deliverable is still required.)

---

## 3.2. Cross-cutting status code table (FR-013) — single source of truth

**Decision**: The status code table in this plan is the *only* definition
in the repo. The 001 and 002 plans and contracts reference it; no other
file may add or override entries.

| Condition | Status | Body envelope | Notes |
|---|---|---|---|
| `POST` body validates, row inserted | `201 Created` | `{ ...entity }` | The `201` body is the entity, per `POST /api/v1.0/teachers` and `POST /api/v1.0/classes` examples in the assignment |
| `GET` list returns (any number, including 0) | `200 OK` | `{ "data": [...] }` | Empty array is `200`, not `204` |
| Body missing / malformed / fails Joi / fails extra-field policy | `400 Bad Request` | `{ "error": "..." }` | All `400`s share the envelope |
| `POST /api/v1.0/classes` with unknown `formTeacher.ulid` | `404 Not Found` | `{ "error": "Teacher not found" }` | Teachers-only — see below; the wire format is a nested `{ ulid, name }` object per Clarifications, Session 2026-06-20 (POST/GET reference object shape) |
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
  "GET /api/v1.0/teachers/:id" or "GET /api/v1.0/classes/:id", so a
  `404` is only meaningful as "the form teacher referenced by the
  new class does not exist". The table makes this explicit; a future
  `GET /api/v1.0/teachers/:id` would extend the table in a follow-up
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

## 3.4. Reference-list seed pattern (FR-016, Session 2026-06-21) — user-prepared MySQL, no boot-time seeder

**Decision**: The `subjects` and `levels` reference tables are
populated by **the user** against the **user-prepared MySQL
container** (per FR-016, Session 2026-06-21 operational-rules
clarification). There is no typeORM migration runner, no `lib/db/
migrations/` directory, no `npm run seed` step, no boot-time seeder,
and no manual SQL file run by the application in Stage 1. The
application is read/write at runtime only — it does not bootstrap
or seed the database.

> **Legacy note**: The earlier Stage 1 plan split the seed step into
> separate typeORM migrations (`SeedSubjects`, `SeedLevels`) named
> with distinct timestamps and run alongside the schema migrations
> on `docker compose up`. That design is **removed from Stage 1**
> per FR-016 and the Session 2026-06-21 clarification. The legacy
> four-migration set is documented in
> [data-model.md §4](./data-model.md#4-migration-history-legacy--superseded-by-fr-016-session-2026-06-21)
> and
> [data-model.md §8](./data-model.md#8-migration-inventory-legacy--superseded-by-fr-016-session-2026-06-21)
> for the migration history only.

**Rationale**:
- The 003 spec Clarifications, Session 2026-06-21 (Q2) collapsed
  this rule into a single operational constraint: the user prepares
  the MySQL container with the full Stage 1 schema (`subjects` with
  the 9 seed rows, `teachers`, `levels` with the 10 seed rows,
  `classes`), audit columns, ULID column, FK constraints, and
  UNIQUE indexes. The application is read/write at runtime only;
  `docker compose up` MUST NOT run a migration step.
- The earlier Session 2026-06-18 Q1/Q4 wording — "second migration
  that idempotently inserts the seed list, runs alongside the
  schema migration on `docker compose up`, idempotent on subsequent
  boots, no separate `npm run seed` step" — is preserved as a
  historical artefact of the migration-based design but no longer
  applies in Stage 1.
- The single-command `docker compose up` experience is preserved
  even without the migration set: the user prepares MySQL once,
  then `docker compose up` brings up only the app container. The
  app container connects to the existing MySQL and serves traffic.
- Constitution Principle V (Simplicity) is satisfied: no separate
  `npm run seed`, no boot-time seeder, no manual SQL file run by
  the app.

**Alternatives considered**:
- **Boot-time seeder in the app code** (`if (!subjects.length)
  seed()`): rejected — adds an app-code path that can race with a
  concurrent `GET /api/v1.0/subjects`, and the seeder would have to
  handle re-deploys that wipe the seed list out of band.
- **Separate `npm run seed` step**: rejected — the user has to know
  to run it; it is easy to forget; it produces an empty DB on
  fresh-checkout without warning.
- **Manual SQL file checked into `docker/mysql/init/` and run by
  MySQL on container start**: rejected — the user prepares MySQL
  manually in Stage 1; the application does not own the boot-time
  SQL.
- **Keep the typeORM migration set as the source of truth**: rejected
  — superseded by FR-016. The schema and seed data are under user
  control, not under application control.

---

## 3.5. Cross-feature referential integrity (FR-007, FR-009a, FR-009b)

**Decision**: Every cross-table invariant is enforced by a DB-level
constraint. Application code defends the same invariant *before* the
write so it can return a clean status code, but the DB constraint is
the last word (so direct writes that bypass the API are still rejected).

| Invariant | DB-level mechanism | Application-level defence | Code path |
|---|---|---|---|
| Teacher email unique | `UNIQUE(teachers.email)` | none — the typeORM `ER_DUP_ENTRY` is enough to render `409 "Email already in use"` | `001-teachers` |
| Class name globally unique | `UNIQUE(classes.name)` | None (the 409 message is sufficient) | `002-classes` |
| Form teacher unique (one form teacher per teacher) | `UNIQUE(classes.form_teacher_id)` | `findTeacherByUlid` pre-INSERT check resolves `formTeacher.ulid` → `form_teacher_id` via `uq_teachers_ulid` (for 404 vs 409 distinction) | `002-classes` |
| Form teacher refers to existing teacher | `FK(classes.form_teacher_id → teachers.id)` | `findTeacherByUlid` pre-INSERT check (returns the `teachers.id` used as the FK value) | `002-classes` |
| Teacher subject refers to active subject | `FK(teachers.subject_id → subjects.id)` | `buildCreateTeacherSchema()` Joi `valid(...activeSubjectUlids)` resolves `subject.ulid` → `subject_id` via `findSubjectByUlid` (against `uq_subjects_ulid`); the nested `subject.name` is a display hint and is ignored server-side (per Clarifications, Session 2026-06-20 (POST/GET reference object shape)) | `001-teachers` |
| Class level refers to active level | `FK(classes.level_id → levels.id)` | `buildCreateClassSchema()` Joi `valid(...activeLevelUlids)` resolves `level.ulid` → `level_id` via `findLevelByUlid` (against `uq_levels_ulid`); the nested `level.name` is a display hint and is ignored server-side (per Clarifications, Session 2026-06-20 (POST/GET reference object shape)) | `002-classes` |
| Subject / level referenced by live data cannot be removed or deactivated | Implicit in FK + `ON DELETE RESTRICT`; `active = true` is enforced by the application's "always read `WHERE active = true`" rule (deactivation is out of Stage 1 scope per FR-009b) | n/a | 003 |

**Rationale**:
- The 003 spec FR-006, FR-007, FR-008, FR-009, FR-009a, FR-009b are
  explicit about "the data layer MUST enforce". Constitution Principle V
  (Simplicity) says the simplest defence that works is the right one —
  for relational data, that is the DB constraint.
- The 2026-06-20 (POST/GET reference object shape) clarification
  shifted the application-level lookup key from `name` / `email` to
  `ulid` (per FR-021). The pre-INSERT checks for `subject`, `level`,
  and `formTeacher` therefore resolve the nested `*.ulid` field via
  the per-table `uq_*_ulid` UNIQUE index, not the natural-key column.
  The natural-key resolution path (e.g. `findTeacherByEmail`) is
  retired for Stage 1: every reference lookup is `ulid`-keyed, the
  nested `*.name` field is treated as a client-supplied display hint
  and ignored server-side, and the response echoes the authoritative
  `name` from the referenced row.
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
| Two concurrent `POST /api/v1.0/teachers` with the same email | `UNIQUE(teachers.email)` → `QueryFailedError` code `ER_DUP_ENTRY` (1062) on the second `INSERT` | none — the route handler maps the typeORM error to `409 "Email already in use"` |
| Two concurrent `POST /api/v1.0/classes` with the same `name` | `UNIQUE(classes.name)` → `ER_DUP_ENTRY` on the second `INSERT` | none |
| 10 concurrent `POST /api/v1.0/classes` with the same `formTeacher.ulid` (SC-007) | `UNIQUE(classes.form_teacher_id)` → 9 of 10 fail with `ER_DUP_ENTRY` (the route handler resolves `formTeacher.ulid` → `form_teacher_id` via `uq_teachers_ulid` so all 10 race past the pre-INSERT check and hit the DB constraint) | the pre-INSERT `findTeacherByUlid` only catches the existence-vs-duplicate distinction for the *first* request; the other 9 race past it and hit the DB constraint |
| Two concurrent `POST /api/v1.0/classes` where the first deletes the referenced teacher before the second runs | `FK(classes.form_teacher_id → teachers.id)` → `QueryFailedError` code `ER_NO_REFERENCED_ROW_2` (1452) on the second `INSERT` | the pre-INSERT `findTeacherByUlid` catches the common case; the FK catches the race window |

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
     /api/v1.0/teachers`, all four status codes.
   - `tests/contract/classes.api.spec.ts` — `POST` + `GET
     /api/v1.0/classes`, including the 404 (teacher-not-found) and
     409 (teacher-already-assigned, duplicate-name) paths.
   - `tests/contract/subjects.api.spec.ts` — `GET /api/v1.0/subjects`.
   - `tests/contract/levels.api.spec.ts` — `GET /api/v1.0/levels`.
   - `tests/contract/cross-cutting.api.spec.ts` — probes every status
     code in the cross-cutting table across all four endpoints
     under the `/api/v1.0/` prefix.

3. **Integration (`tests/integration/`)** — real MySQL container,
   end-to-end. Runs the SC-007 race test (10 concurrent POSTs with
   the same form teacher) against the user-prepared schema.
   - `tests/integration/cross-cutting.spec.ts` — restart the app
     container mid-test, verify SC-001 (data survives restart); run
     the 10-concurrent-POST race, verify SC-007; assert every
     response body carries `ulid` (per FR-021); assert every
     endpoint lives under `/api/v1.0/` (per FR-022).
   - (No `migration.spec.ts` — Stage 1 has no migration set; the
     schema is user-prepared per FR-016, Session 2026-06-21.)

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

**Decision**: The 003 feature has **one new runtime dependency** added
by the 2026-06-20 ULID clarification: the
[`ulid`](https://www.npmjs.com/package/ulid) npm package (see
§3.11). Otherwise, 003 consumes the same `next`, `typeorm`, `mysql2`,
`joi`, `vitest`, and `dotenv` versions that 001 already pinned.

**Rationale**:
- The 003 deliverables are pure-function helpers (`lib/api/*.ts`)
  and tests. None of those introduce a new third-party library
  *except* the `ulid` package added by the 2026-06-20 clarification
  (see §3.11) — every other cross-cutting helper is satisfied by
  the already-installed stack. The legacy `lib/db/migrations/`
  directory is removed from Stage 1 (per FR-016,
  Session 2026-06-21); 003 no longer ships migration code.
- Constitution Principle V (Simplicity): "no dependencies added
  because we might need it". The `ulid` package is the single
  exception: it is required by FR-021 to generate the per-row
  frontend-stable handle that the cross-cutting contract exposes.

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
  the existing Next.js app container; the tests run inside the
  existing `docker-compose.test.yml` setup.
- The `docker compose up` flow runs only the app container in Stage
  1; there is no migration step on the boot sequence (per FR-016,
  Session 2026-06-21). The user-prepared MySQL container is the
  schema source of truth.

**Alternatives considered**: none — there is no design choice to
make here. 003 is a logic-layer change, not an infrastructure change.

---

## 3.10. Configuration — same `.env`, same `lib/config.ts`

**Decision**: The runtime configuration loader (`lib/config.ts`,
inherited from `001-teachers`) is unchanged. The `DB_HOST=mysql` (the
docker-network alias for the MySQL service) is the only configuration
the new cross-cutting helpers touch. The legacy migration runner
configuration (the `migrations` block on the typeORM `DataSource`)
is removed in Stage 1 (per FR-016, Session 2026-06-21).

**Rationale**:
- The 003 feature does not introduce new env vars, new secrets, or
  new feature flags.
- Per the Constitution → Configuration section, runtime config goes
  via `.env` (dotenv); secrets go via `.env.local` (gitignored). The
  repo-level `.env` (JSON, model config only) is unrelated.

**Alternatives considered**: none.

---

## 3.11. ULID column (FR-021) — cross-cutting row handle

**Decision**: Every table (`subjects`, `teachers`, `levels`, `classes`)
carries a `ulid CHAR(26) NOT NULL UNIQUE` column generated server-side
by the [`ulid`](https://www.npmjs.com/package/ulid) npm package
(`monotonicFactory()` is **not** required for Stage 1 — see below).
The column is **exposed** in every Stage 1 GET and POST response
(`POST /api/v1.0/teachers`, `GET /api/v1.0/teachers`,
`POST /api/v1.0/classes`, `GET /api/v1.0/classes`,
`GET /api/v1.0/subjects`, `GET /api/v1.0/levels`) but is
**not** a foreign-key target — every FK continues to reference the
surrogate `id` (per FR-019). The `ulid` column carries a `UNIQUE`
index per table (`uq_teachers_ulid`, `uq_subjects_ulid`,
`uq_classes_ulid`, `uq_levels_ulid`). A thin `lib/ulid.ts` wrapper
exports `generateUlid()` that returns the result of `ulid()`; the
001 and 002 entities call it once on insert. The 003 feature owns
the wrapper; the 001 and 002 entities own the column declaration on
their respective tables.

**Rationale**:
- The 2026-06-20 clarification (Spec Session 2026-06-20 (ULID
  column), FR-021) introduced the column as a **frontend-stable row
  handle**. The Stage 1 POST/GET responses carry natural-key fields
  (`email`, `name`) which are editable; the `ulid` is a stable opaque
  handle the frontend can cache against the row, so a future
  edit/update endpoint can route by `ulid` without a schema migration
  and without leaking the surrogate `id`.
- The `ulid` package is the canonical implementation: 128-bit
  randomness, 26-character Crockford Base32 encoding, time-ordered
  lexicographically, 80 bits of entropy (collision probability
  ~10⁻¹⁵ at the Stage 1 upper bound of ≤ 500 rows per table).
  It is dependency-free, ~1 kB minified, and has TypeScript types
  shipped in-box (`@types/ulid` is not required).
- `ulid()` (not `monotonicFactory()`) is sufficient for Stage 1: the
  insertion rate is human-driven (the administrator clicks "Save"
  on the form), so the same-millisecond collision case the
  monotonic variant defends against is not a real risk at ≤ 500 rows.
  The wrapper exposes `generateUlid({ monotonic: true })` for a
  future stage that ingests bulk imports — the swap is one line.
- The `UNIQUE` index per table (one of `uq_*_ulid`) is added at the
  same time as the column (in the same migration that creates the
  table); a duplicate `ulid` collides the way a duplicate `email`
  does, and the route handler maps the `ER_DUP_ENTRY` to `409`.
- `ulid` is **not** a foreign-key target. FKs continue to reference
  the surrogate `id` (per FR-019). This keeps the FK machinery
  (BIGINT, fast joins, typeORM `@ManyToOne`) untouched and avoids the
  TypeORM-CHAR-FK pitfalls some adapters have.

**Wrapper sketch** (final code lives in `lib/ulid.ts`):

```ts
// lib/ulid.ts
import { ulid as ulidImpl } from "ulid";

export function generateUlid(opts?: { monotonic?: boolean }): string {
  // Stage 1: plain ulid() is enough. The monotonic flag is reserved
  // for a future bulk-import stage that may insert many rows in the
  // same millisecond.
  return ulidImpl();
}
```

**Entity annotation sketch** (the final code lives in each
`lib/db/entities/*.ts`):

```ts
// on Teacher, Subject, Class, Level
@Column({ type: "char", length: 26, unique: true })
ulid!: string;
```

The route handler populates `entity.ulid = generateUlid()` immediately
before `repository.save(entity)`. The `toJSON()` mapping includes
`ulid` so it lands in every response shape (POST 201 body, GET 200
list entries).

**Alternatives considered**:
- **UUID v4** (the `uuid` npm package): rejected — UUIDs are 36
  characters (including 4 hyphens) and are not lexicographically
  time-ordered; the frontend cannot sort by creation time without
  decoding. ULID is 26 chars, time-ordered, and the same length as
  a UUID without the hyphens.
- **`monotonicFactory()` everywhere**: rejected for Stage 1 — adds
  shared state to the `lib/ulid.ts` wrapper (the factory is a
  closure over an internal counter) for a benefit that only
  matters at insertion rates much higher than the spec contemplates.
  Reserved behind an explicit `monotonic: true` opt-in.
- **Application-side ULID generation in the route handler rather
  than the entity `@BeforeInsert()` hook**: rejected — the entity
  hook is closer to the persistence boundary and keeps the
  cross-cutting concern out of the route handlers, matching the
  audit-columns pattern (`@CreateDateColumn`,
  `@UpdateDateColumn`) already in use.
- **Store `ulid` as `BINARY(16)` to save 10 bytes per row**: rejected
  — the column is exposed in API responses (FR-021), so the wire
  format has to be the 26-character string. Storing as binary and
  converting on read adds complexity for ~10 bytes/row; not worth it.
- **Use the surrogate `id` as the frontend-stable handle instead of
  adding `ulid`**: rejected — `id` is a BIGINT that may be reused
  across environments (no global uniqueness guarantee), and exposing
  it ties the frontend to the DB implementation. ULID is portable,
  opaque, and globally unique.

**`ulid` UNIQUE index names**:

| Table | Index name |
|---|---|
| `teachers` | `uq_teachers_ulid` |
| `subjects` | `uq_subjects_ulid` |
| `classes` | `uq_classes_ulid` |
| `levels` | `uq_levels_ulid` |

Added in the same migration that creates each table (per FR-021;
cross-cutting column rule).
