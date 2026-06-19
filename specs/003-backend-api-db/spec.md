# Feature Specification: Backend APIs and DB Schema

**Feature Branch**: `003-backend-api-db`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "create the backend apis and db schema feature"

## Clarifications

### Session 2026-06-18

- Q: Reference tables and their GET endpoints? → A: Two reference tables (`subjects`, `levels`) + two new GET endpoints (`GET /api/subjects`, `GET /api/levels`). Both tables are seeded in Stage 1 and treated as read-only by the API (admin authoring is a future stage; see Assumptions). The Add Teacher and Add Class forms use these endpoints to populate their dropdowns. `teachers.subject` is a foreign key to `subjects.name`; `classes.level` is a foreign key to `levels.name`. A submission that references an unknown / inactive reference value is rejected with `400 Bad Request` and `{ "error": "Invalid subject" | "Invalid level" }`. The exact seed mechanism (migration vs. seed script vs. app-boot) is a separate decision — see Clarifications, Session 2026-06-18 (Q5).
- Q: Confirm 003's Class PK and class-name uniqueness rules match `002-classes`? → A: Confirmed. The 003 spec uses (a) a numeric, auto-generated surrogate `id` as the `classes` primary key (not exposed in the Stage 1 API response), and (b) **global** `name` uniqueness on `classes` (replacing the previous `(level, name)` composite rule). Both align with the per-feature spec.
- Q: Should `415 Unsupported Media Type` and `503 Service Unavailable` be in the cross-cutting API contract? → A: Yes — both stay in `003` and are **propagated to `001-teachers` and `002-classes`** so the three specs share a single status-code table. The full mapping is `400` (validation) / `404` (teacher not found, classes only) / `409` (uniqueness / referential integrity) / `415` (request `Content-Type` is not `application/json`) / `500` (unhandled server failure) / `503` (data store briefly unreachable). `001` and `002` are updated to match.
- Q: How is the seed data for `subjects` and `levels` populated? → A: **Superseded by Session 2026-06-21 (operational rules)**. The original answer (second migration) is no longer the rule; per FR-016 and the Session 2026-06-21 clarification, the seed data is delivered by the user's own SQL against the user-prepared MySQL container. This Q is retained for the audit trail.

### Session 2026-06-19

- Q: Constitution v2.2.0 → v2.3.0 amendment swaps SGDS v3 (`@govtechsg/sgds-react`) for **Ant Design (`antd`)** + **Tailwind CSS** — does this cross-cutting spec need any change? → A: This spec (003) owns the cross-cutting **API contract, error envelope, status-code table, migration-set ordering, and reference-list seed pattern** — it has no UI of its own. Therefore the amendment requires **no functional change** to this spec. The amendment is propagated by reference: the API responses 003 defines (`{ "data": [...] }` for lists, `{ "error": "..." }` for errors, status code table `400 / 404 / 409 / 415 / 500 / 503`) are consumed by the `001-teachers` and `002-classes` UI layers, which are now composed from `antd` primitives styled with Tailwind utility classes. Each per-feature spec records a matching `### Session 2026-06-19` clarification capturing the UI-side translation; this 003 spec records the cross-cutting note so the audit trail is complete in one place. The Assumptions section is updated to call out the constitution version that the consumers are expected to be conformant with.

### Session 2026-06-19 (audit columns)

- Q: PK migration strategy — what happens to the existing natural-key primary keys (`subjects.name`, `teachers.email`, `levels.name`) when a new `id` column is added to every table? → A: `id` becomes the new primary key on **every** table (the existing surrogate `id` on `classes` is renamed/redocumented as the canonical PK). The previous natural key is preserved as `UNIQUE NOT NULL` (e.g., `UNIQUE KEY uq_teachers_email (email)`). All foreign keys migrate from referencing natural keys to referencing `id`: `teachers.subject_id REFERENCES subjects(id)`, `classes.level_id REFERENCES levels(id)`, `classes.form_teacher_id REFERENCES teachers(id)`. The Stage 1 public API responses keep using the natural-key field names (`teachers.email`, `subjects.name`, `levels.name`, `classes.name`) so the consumer contract is unchanged; the migration is purely on the persistence side.
- Q: `created_by` / `modified_by` column semantics — given Principle IV (Single Role: Administrator) and no `users` table in Stage 1, what do these audit columns store? → A: `VARCHAR(64) NOT NULL DEFAULT 'system'`. The application code sets the column to the actor's identifier string on every write (Stage 1 values are `'admin'` for HTTP-driven writes and `'system'` for migrations / bootstrap inserts). The default `'system'` keeps the schema idempotent under migrations and seed inserts without requiring a runtime actor. The format is portable — when a `users` table enters scope in a future stage, these columns can be migrated to FKs without changing the application call sites.
- Q: `version` column behavior — is optimistic concurrency managed by the DB or by the application? → A: `INT NOT NULL DEFAULT 1`. Managed by the application via typeORM's `@VersionColumn` decorator, which increments the integer on every `repository.save()`. Concurrent updates with a stale `version` value surface as `OptimisticLockVersionMismatchError`, which the API layer maps to HTTP `409 Conflict` (consistent with the existing 409 envelope semantics for uniqueness and referential-integrity violations).
- Q: `created_at` / `modified_at` data type — `TIMESTAMP` (second precision, 2038-capped) or `DATETIME(6)` (microsecond precision, no 2038 limit)? → A: `DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` for `created_at`; `DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)` for `modified_at`. Microsecond precision matters for audit trails where two writes happen within the same second (back-to-back POSTs during integration tests); the absence of the 2038 ceiling future-proofs long-running deployments. Maps cleanly to typeORM's `@CreateDateColumn` and `@UpdateDateColumn` decorators.

### Session 2026-06-20 (ULID column)

- Q: ULID exposure in Stage 1 API responses — same posture as FR-020 (audit columns hidden) or the opposite (expose for frontend sync)? → A: **Expose** `ulid` in every Stage 1 GET response (per-record top-level field, alongside the natural-key fields) and in every POST 201 confirmation body. The frontend stores it now and reuses it for future update endpoints; hiding it (audit-column posture) would defeat the stated sync purpose — the frontend would have no way to capture the ULID until update endpoints land.
- Q: ULID column name and MySQL storage type? → A: `ulid CHAR(26) NOT NULL`. The 26-character Crockford Base32 encoding is the standard ULID spec; storing it as `CHAR(26)` keeps it readable in `SELECT` output, trivially copy-pasteable from logs and the `mysql` client, and lexicographically sortable. Pairs cleanly with the `ulid` npm package. `BINARY(16)` saves 10 bytes per row but hides the value from every human-facing surface and forces a conversion at the API boundary, which is friction the project does not need.
- Q: Where is the ULID generated? → A: Server-side, in the application layer (route handler or a typeORM `@BeforeInsert()` hook on the entity), generated by the `ulid` npm package and written as the literal column value. The migration defines the column with no `DEFAULT` — the application is the sole source of the value. This keeps the migration free of any DB-side UDF or expression, lets the application log the ULID alongside the row for sync debugging, and lets unit tests stub the generator to assert specific values.
- Q: Monotonic ULID (strictly sortable within a millisecond) vs plain random ULID? → A: Plain random ULID. Same-millisecond ordering is undefined; the trade-off is acceptable for Stage 1. A future-stage sync that requires deterministic same-ms merge ordering replaces this with `monotonicFactory()` from the same package (a single call-site change, no schema change).
- Q: Scope — do the read-only reference tables (`subjects`, `levels`) also get `ulid`? → A: Yes — all four tables (`teachers`, `subjects`, `classes`, `levels`) carry `ulid CHAR(26) NOT NULL UNIQUE`. Matches the FR-018 audit-column precedent and the request wording ("every table defined in 001-teachers and 002-classes specs"); the frontend gets a stable handle on every row it ever receives, including the seeded reference values that today can only be identified by their mutable `name`. Asymmetry the other direction (add ULID later to two tables) is harder to reason about.

### Session 2026-06-21 (operational rules)

- Q: Teacher `contactNumber` validation — keep the Singapore-mobile pattern (`^[89]\d{7}$`, exactly 8 digits, must start with `8` or `9`), relax it, or drop it entirely? → A: **Relax** the leading-digit rule. The teacher `contactNumber` MUST be exactly 8 digits, digits-only (`^\d{8}$`); no leading-digit restriction. The previous `^[89]\d{7}$` rule (Singapore-mobile assumption) is removed. This rule is owned by `001-teachers/spec.md` FR-004 and is mirrored here for completeness; both specs are updated.
- Q: Migrations in Stage 1 — keep the typeORM migration system (FR-016, FR-017, the `170000000000*-InitSchema.ts` / `SeedSubjects.ts` / `InitClasses.ts` / `SeedLevels.ts` files, the `migration:run` step in `docker-compose up`), or drop them in favour of user-managed MySQL? → A: **Drop the migration system**. The user prepares the MySQL container manually and creates the schema + seed data with their own SQL. The `docker compose up` boot sequence MUST NOT run any migration command. FR-016 and FR-017 are **deleted** from this spec. The migration inventory sections in `data-model.md` are removed. The `lib/db/migrations/` directory is removed from the project structure in `plan.md`. The `docker/docker-compose.yml` migration command is removed. The reference-list seed (subjects, levels) is delivered by user SQL, not by a typeORM migration. This rule is owned by this spec (003) and propagated by reference to `001-teachers/plan.md`, `001-teachers/data-model.md`, `002-classes/plan.md`, and `002-classes/data-model.md`.
- Q: API version prefix — what path prefix should Stage 1 endpoints use? → A: **`/api/v1.0/*`** is the literal Stage 1 prefix. The four Stage 1 endpoints are:
  - `POST /api/v1.0/teachers` and `GET /api/v1.0/teachers` (owned by `001-teachers`).
  - `GET /api/v1.0/subjects` (owned by `001-teachers`).
  - `POST /api/v1.0/classes` and `GET /api/v1.0/classes` (owned by `002-classes`).
  - `GET /api/v1.0/levels` (owned by `002-classes`).
  The version `v1.0` is literal (not a placeholder for "current major.minor"); future stages add `v1.1`, `v2.0`, etc. This rule is owned by this spec (003) and propagated by reference to all contracts in `001-teachers/contracts/` and `002-classes/contracts/`.

## User Scenarios & Testing *(mandatory)*

This feature is an internal, cross-cutting capability. The "user" is the rest of
the system — the frontend (the Teachers and Classes features) and any future
API consumer. The scenarios below describe the system-level guarantees that
the frontend relies on, the API contract the frontend consumes, and the data
model that backs both.

### User Story 1 - Persist Teachers and Classes Reliably (Priority: P1)

The system stores every teacher and class created via the API in persistent
storage, and returns the same data on every read until the data is changed.
A teacher or class created before a server restart is still present after the
restart, with all of its attributes intact.

**Why this priority**: Without persistence and a stable data model, none of
the business features (Teachers, Classes) can deliver value across sessions
or server restarts. This is the storage foundation of the application.

**Independent Test**: Can be fully tested by creating a teacher and a class
through their respective API endpoints, restarting the server, and verifying
that both records are still retrievable with all of their original attribute
values.

**Acceptance Scenarios**:

1. **Given** a teacher has been created via the API, **When** the teacher
   list endpoint is called, **Then** the teacher is returned with the
   exact `name`, `subject`, `email`, and `contactNumber` that were provided
   at creation time.
2. **Given** a class has been created via the API, **When** the class list
   endpoint is called, **Then** the class is returned with the exact
   `level`, `name`, and the form teacher's `name` resolved from the
   referenced teacher record.
3. **Given** teachers and classes have been created, **When** the server
   is restarted (or the data store is reconnected), **Then** the same
   teachers and classes are still retrievable through the API with no
   data loss.

---

### User Story 2 - Enforce Data Integrity Rules at the Data Layer (Priority: P1)

The system guarantees that the business invariants defined by the Teachers
and Classes features are always satisfied in stored data, even under
concurrent writes and even if the API is bypassed. Specifically:

- A teacher's `email` is unique across all teachers.
- A teacher can be the form teacher of **at most one** class.
- A class's `formTeacher` always refers to an existing teacher.
- A class is identified by the combination of its `level` and `name` and
  the system rejects any attempt to create a second class with the same
  `level` and `name` pair.

**Why this priority**: These invariants are central to the application's
purpose. The frontend should be able to trust the data store to enforce
them rather than guarding against inconsistent data. Enforcing them at the
data layer also defends against bugs, race conditions, and out-of-band
writes.

**Independent Test**: Can be fully tested by attempting to violate each
invariant directly against the data store (e.g., inserting a duplicate
teacher email, inserting a class that points to a non-existent teacher)
and verifying that the operation is rejected with an error.

**Acceptance Scenarios**:

1. **Given** a teacher with `email = "mary@example.com"` already exists,
   **When** the system is asked to create another teacher with the same
   email, **Then** the request is rejected with an integrity-error status
   code and a meaningful error message.
2. **Given** a teacher is the form teacher of class "Class 1A",
   **When** the system is asked to create a new class with the same
   teacher as its form teacher, **Then** the request is rejected with an
   integrity-error status code and a meaningful error message.
3. **Given** no teacher exists with `email = "nobody@example.com"`,
   **When** the system is asked to create a class with
   `teacherEmail = "nobody@example.com"`, **Then** the request is
   rejected with a not-found status code and a meaningful error message.
4. **Given** a class "Class 1A" already exists at level "Primary 1",
   **When** the system is asked to create another class with the same
   `level` and `name` pair, **Then** the request is rejected with an
   integrity-error status code and a meaningful error message.
5. **Given** two concurrent requests attempt to create a class with the
   same form teacher, **When** both are processed, **Then** at most one
   succeeds and the other is rejected with an integrity-error status
   code.

---

### User Story 3 - Expose a Consistent API Contract (Priority: P1)

Every API endpoint follows the same conventions for content type, success
response shape, error response shape, and HTTP status codes. The frontend
(and any API consumer) can use a single client-side error-handling path
and a single response-parsing path across all endpoints.

**Why this priority**: Consistency makes the API predictable, reduces
integration cost, and is explicitly required by the requirements file
("Your API may be subjected to automated test tools, so please adhere
closely to the given specs"). The system value is a stable contract
that can be consumed by automated tests and future features without
per-endpoint special cases.

**Independent Test**: Can be fully tested by issuing a representative
sample of requests across all four endpoints (POST/GET teachers,
POST/GET classes) under both success and error conditions and verifying
that every response uses the agreed envelope, content type, and status
code mapping.

**Acceptance Scenarios**:

1. **Given** any API endpoint accepts a JSON request body, **When** the
   request is sent, **Then** the endpoint requires a
   `Content-Type: application/json` header and rejects requests that
   use other content types with a `415 Unsupported Media Type` status
   code.
2. **Given** a list endpoint is called and at least one record exists,
   **When** the request is processed, **Then** the response is HTTP
   `200 OK` with a JSON body of the form `{ "data": [ ...records ] }`.
3. **Given** a list endpoint is called and no records exist,
   **When** the request is processed, **Then** the response is HTTP
   `200 OK` with a JSON body of the form `{ "data": [] }`.
4. **Given** a create endpoint is called with valid input,
   **When** the record is created, **Then** the response is HTTP
   `201 Created` and includes a JSON body confirming the record
   (the exact confirmation shape is decided in `plan.md`; the status
   code is the only hard contract here).
5. **Given** any endpoint is called and the request fails validation
   or violates a business rule, **When** the failure is detected,
   **Then** the response uses the agreed JSON error envelope
   `{ "error": "Some meaningful error message" }` and an appropriate
   HTTP status code (see the status code table below).
6. **Given** any endpoint is called and an unexpected server error
   occurs, **When** the failure is detected, **Then** the response is
   HTTP `500 Internal Server Error` with the agreed error envelope
   and a non-leaking message that does not expose internal details.

---

### Edge Cases

- What happens when a request body is missing required fields? — The
  endpoint MUST reject the request with `400 Bad Request` and a
  field-level error message in the error envelope.
- What happens when a request body is not valid JSON? — The endpoint
  MUST reject the request with `400 Bad Request` and a meaningful
  error message.
- What happens when a request body contains extra unknown fields? — The
  endpoint MUST either ignore the unknown fields or reject the request
  with `400 Bad Request`; the chosen behavior is decided in `plan.md`
  and documented in the API contract.
- What happens when an integrity violation is detected (duplicate
  email, duplicate form teacher, missing teacher, duplicate class
  `name`, unknown subject, unknown level)? — The endpoint MUST map
  the violation to the agreed status code (see FR-009, FR-009a) and a
  meaningful error message.
- What happens when a list endpoint is called while the data store is
  briefly unavailable? — The endpoint MUST respond with `503 Service
  Unavailable` and the agreed error envelope, and the frontend MUST
  surface a retry-friendly error to the administrator.
- What happens when a write endpoint is called while the data store is
  briefly unavailable? — The endpoint MUST respond with `503 Service
  Unavailable`; the write MUST NOT be partially applied (the operation
  is atomic).
- What happens when two requests race to create the same teacher or
  class? — The data layer's uniqueness constraints MUST ensure that at
  most one request succeeds; the other is rejected with the agreed
  status code for the violated constraint.
- What happens when the application's ULID generator produces a
  duplicate `ulid` for two rows in the same millisecond (a
  theoretical collision, vanishingly rare for plain random ULIDs —
  ~ 1 in 2^80 per same-ms pair)? — The MySQL `UNIQUE` index on
  `ulid` (per FR-021) rejects the second insert with `ER_DUP_ENTRY`,
  which the route handler maps to HTTP `409 Conflict` (per FR-013).
  The application re-mints the ULID on the failed-insert path; this
  is the same defense-in-depth shape as the existing `email` and
  `name` uniqueness rules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist teachers and classes in a relational
  data store that survives process restarts and supports the integrity
  rules in FR-006..FR-009.
- **FR-002**: The system MUST expose a public API surface for the
  Teachers feature with at least the following endpoints, each of which
  conforms to the cross-cutting contract in FR-010..FR-015, and each
  of which uses the Stage 1 version prefix `/api/v1.0/` (per FR-022):
  - `POST /api/v1.0/teachers` — create a teacher; success returns HTTP
    `201 Created` with a body containing the newly-created teacher's
    `ulid` (per FR-021) and natural-key fields.
  - `GET /api/v1.0/teachers` — list all teachers; success returns HTTP
    `200 OK` with `{ "data": [ ...teachers ] }`, each entry carrying
    `name`, `subject`, `email`, `contactNumber`, and `ulid` (per
    FR-021).
  - `GET /api/v1.0/subjects` — list all active subjects; success
    returns HTTP `200 OK` with `{ "data": [ { "name", "active",
    "ulid" } ] }`, filtered to entries where `active = true`. (See
    Clarifications, Session 2026-06-18 — supports the Add Teacher
    dropdown; `ulid` is the frontend-stable sync handle per FR-021.)
- **FR-003**: The system MUST expose a public API surface for the
  Classes feature with at least the following endpoints, each of which
  conforms to the cross-cutting contract in FR-010..FR-015, and each
  of which uses the Stage 1 version prefix `/api/v1.0/` (per FR-022):
  - `POST /api/v1.0/classes` — create a class; success returns HTTP
    `201 Created` with a body containing the newly-created class's
    `ulid` (per FR-021) and natural-key fields.
  - `GET /api/v1.0/classes` — list all classes; success returns HTTP
    `200 OK` with `{ "data": [ ...classes ] }`. Each entry includes
    `level`, `name`, `formTeacher.name`, and `ulid` (per FR-021).
  - `GET /api/v1.0/levels` — list all active levels; success returns
    HTTP `200 OK` with `{ "data": [ { "name", "active", "ulid" } ] }`,
    filtered to entries where `active = true`. (See Clarifications,
    Session 2026-06-18 — supports the Add Class dropdown; `ulid`
    is the frontend-stable sync handle per FR-021.)
- **FR-004**: The system MUST store the following attributes for each
  **teacher** record, with the constraints listed:
  - `name` (string, required, non-empty).
  - `subject` (string on the public API surface, required, non-empty;
    persisted as `teachers.subject_id` — a foreign key → `subjects.id`
    referencing an active entry in the `subjects` reference list; see
    Clarifications, Session 2026-06-18 and FR-019). The Joi schema
    validates the natural-key value submitted on the wire; the route
    handler resolves it to the referenced `subjects.id` before insert.
  - `email` (string, required, must be a syntactically valid email
    address, **unique across all teacher records**).
  - `contactNumber` (string, required, exactly 8 digits, digits-only;
    no leading-digit restriction — see
    `001-teachers/spec.md` Clarifications, Session 2026-06-21).
- **FR-005**: The system MUST store the following attributes for each
  **class** record, with the constraints listed:
  - `level` (string on the public API surface, required, non-empty;
    persisted as `classes.level_id` — a foreign key → `levels.id`
    referencing an active entry in the `levels` reference list; see
    Clarifications, Session 2026-06-18 and FR-019).
  - `name` (string, required, non-empty, **unique across all class
    records** — class names are globally unique; see
    `002-classes/spec.md` Clarifications, Session 2026-06-18).
  - `formTeacherEmail` (string on the public API surface, required,
    must be a syntactically valid email address; persisted as
    `classes.form_teacher_id` — a foreign key → `teachers.id`
    resolving to the referenced teacher row, see FR-019). The
    `form_teacher_id` column carries a `UNIQUE` constraint so a
    teacher can be the form teacher of at most one class.
- **FR-018**: Every table in the data store (`subjects`, `teachers`,
  `levels`, `classes`) MUST carry the following six audit columns in
  addition to its domain columns (see Clarifications,
  Session 2026-06-19 — audit columns):
  - `id` (`BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`, primary key) —
    the single canonical PK on every table; replaces the previous
    natural-key PKs on `subjects`, `teachers`, and `levels`. The
    domain-natural key is preserved as `UNIQUE NOT NULL`.
  - `created_at` (`DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`)
    — set once at row insert time.
  - `created_by` (`VARCHAR(64) NOT NULL DEFAULT 'system'`) — the
    actor's identifier string; set by application code on every
    write, defaults to `'system'` for migrations / seeds.
  - `modified_at` (`DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6)`) — bumped automatically on every
    row update.
  - `modified_by` (`VARCHAR(64) NOT NULL DEFAULT 'system'`) — the
    actor's identifier string for the most recent update; set by
    application code on every write.
  - `version` (`INT NOT NULL DEFAULT 1`) — typeORM `@VersionColumn`
    optimistic-locking counter; incremented on every `save()`,
    concurrent stale-version writes surface as HTTP `409 Conflict`.
- **FR-019**: All foreign keys in the data store MUST reference the
  surrogate `id` of the target table (not the natural key); the FK
  column name MUST follow the pattern `<referenced-table-singular>_id`
  (e.g., `teachers.subject_id`, `classes.level_id`,
  `classes.form_teacher_id`). FK constraints MUST use
  `ON UPDATE CASCADE ON DELETE RESTRICT` to match the existing
  referential-integrity semantics documented in FR-009a.
- **FR-020**: The Stage 1 public API responses MUST keep using the
  domain-natural identifier names (`teachers.email`, `subjects.name`,
  `levels.name`, `classes.name`, `classes.formTeacher.email`) so the
  consumer contract is unchanged by the persistence-side PK
  migration. The `id`, `created_at`, `created_by`, `modified_at`,
  `modified_by`, and `version` columns are **not** exposed in the
  Stage 1 API responses; they are persistence-side audit metadata
  available only to internal code. The **`ulid` column is the
  explicit exception** (per FR-021): it IS exposed in every Stage 1
  GET response and every POST 201 confirmation body as the
  frontend-stable sync handle.
- **FR-021**: Every table in the data store (`subjects`, `teachers`,
  `levels`, `classes`) MUST carry a `ulid` column in addition to its
  audit and domain columns (see Clarifications, Session 2026-06-20):
  - `ulid` (`CHAR(26) NOT NULL UNIQUE`) — the 26-character Crockford
    Base32 ULID. Generated server-side by the `ulid` npm package in
    the application layer (route handler or typeORM `@BeforeInsert()`
    hook on the entity); the migration defines the column with no
    `DEFAULT` — the application is the sole source of the value.
    Plain (non-monotonic) ULID is used in Stage 1 — same-millisecond
    ordering is undefined; a future-stage sync that requires
    deterministic same-ms merge ordering replaces this with
    `monotonicFactory()` from the same package (a single call-site
    change, no schema change).
  - The `ulid` column is the public, frontend-stable handle for a
    record. It is **exposed** in every Stage 1 GET response
    (top-level field on each record, alongside the natural-key
    fields) and in every POST 201 confirmation body. This is the
    deliberate exception to the FR-020 "audit columns hidden" rule,
    which still applies to `id`, `created_at`, `created_by`,
    `modified_at`, `modified_by`, and `version`.
  - `ulid` carries a `UNIQUE` index per table (`uq_teachers_ulid`,
    `uq_subjects_ulid`, `uq_classes_ulid`, `uq_levels_ulid`) so a
    duplicate ULID mint is rejected at the data layer with
    `ER_DUP_ENTRY`, which the API layer maps to HTTP `409 Conflict`
    (per FR-013).
  - `ulid` is **not** a foreign-key target. Foreign keys continue to
    reference the surrogate `id` (per FR-019). `ulid` is the sync
    identifier, not the join key.
- **FR-006**: The system MUST enforce `email` uniqueness on the
  `teachers` data at the data layer, so that even direct writes that
  bypass the API cannot create two teachers with the same email.
- **FR-007**: The system MUST enforce that a `class.formTeacherEmail`
  (resolved at the data layer to `classes.form_teacher_id`) refers to
  an existing `teachers.id` (referential integrity), so that a class
  cannot exist without a corresponding teacher record. The
  application-level defence is the `findTeacherByEmail` lookup before
  insert (per FR-020); the FK `fk_classes_form_teacher` is the
  backstop (per FR-019).
- **FR-008**: The system MUST enforce `formTeacherEmail` uniqueness on
  the `classes` data at the data layer, so that even direct writes
  that bypass the API cannot assign the same teacher as the form
  teacher of two different classes.
- **FR-009**: The system MUST enforce **global** `name` uniqueness on
  the `classes` data at the data layer, so that even direct writes that
  bypass the API cannot create two classes with the same `name`
  (regardless of `level`) — aligns with `002-classes/spec.md`
  Clarifications, Session 2026-06-18.
- **FR-009a**: The system MUST enforce referential integrity between
  `teachers.subject_id` and `subjects.id`, and between
  `classes.level_id` and `levels.id` (per FR-019), so that a teacher
  or class cannot reference a non-existent reference-list entry. The
  natural-key API fields (`teachers.subject`, `classes.level`) are
  resolved to the FK id by the route handler before insert; the FK
  constraints (`fk_teachers_subject`, `fk_classes_level`) are the
  backstop for direct writes that bypass the API (see Clarifications,
  Session 2026-06-18).
- **FR-009b**: The system MUST enforce that a `subject` or `level`
  referenced by an existing teacher or class cannot be removed or
  marked inactive; reference-list entries referenced by live data
  are protected from deactivation. Deactivation is a future-stage
  admin operation and is out of Stage 1 scope (see Assumptions).
- **FR-009c**: The system MUST expose `GET /api/subjects` and
  `GET /api/levels` endpoints that return the list of active reference
  entries as `{ "data": [ { "name", "active" } ] }`, with
  `active = true` filter applied server-side (see FR-002 / FR-003).
- **FR-010**: All API endpoints MUST accept and return JSON, and MUST
  require `Content-Type: application/json` on requests that carry a
  body. Requests with a different content type MUST be rejected with
  HTTP `415 Unsupported Media Type` and the agreed error envelope.
- **FR-011**: All list endpoints MUST return a JSON body of the form
  `{ "data": [ ... ] }` on success. The array MAY be empty.
- **FR-012**: All error responses across all endpoints MUST use the
  JSON envelope `{ "error": "Some meaningful error message" }`.
- **FR-013**: The system MUST map the following failure conditions to
  the following HTTP status codes:
  - `400 Bad Request` — request body is missing, malformed, or fails
    field-level validation (e.g., invalid email format, invalid contact
    number, missing required field).
  - `404 Not Found` — a referenced teacher (`teacherEmail`) does not
    exist when creating a class.
  - `409 Conflict` — a uniqueness or referential-integrity rule is
    violated: duplicate teacher email, duplicate form teacher,
    duplicate `(level, name)` pair on a class, or a duplicate `ulid`
    (theoretical ULID collision caught by the per-table `UNIQUE`
    index per FR-021; vanishingly rare in practice but covered for
    defense-in-depth).
  - `415 Unsupported Media Type` — request `Content-Type` is not
    `application/json`.
  - `500 Internal Server Error` — unexpected server-side failure.
  - `503 Service Unavailable` — the data store is briefly unreachable.
  The Stage 1 version prefix `/api/v1.0/` (per FR-022) does not change
  the status code mapping — the same status codes apply to the
  versioned paths.
- **FR-014**: All API writes MUST be atomic: a request that fails MUST
  NOT leave partial data in the data store.
- **FR-015**: All error messages in the agreed envelope MUST be
  meaningful to the administrator or to the calling code, and MUST NOT
  leak internal details (stack traces, connection strings, file paths,
  raw SQL, etc.) in production.
- **FR-016**: The data store schema is **user-managed**, not application-managed.
  The system MUST NOT run a typeORM migration step (or any other schema
  creation / seed / bootstrap SQL) on `docker compose up` or on
  application boot. The MySQL container is prepared by the user with
  the schema, the audit columns, the ULID column, the FK constraints,
  the `UNIQUE` indexes, and the seed data for the `subjects` and
  `levels` reference tables — the application is read/write at runtime
  only. The `docker/docker-compose.yml` boot sequence MUST NOT include
  a `migration:run` or equivalent step. The `lib/db/migrations/`
  directory and the `typeorm-ts-node-commonjs migration:run` command
  are out of Stage 1 scope.
- **FR-017**: Deleted (the previous FR-017 — the second migration for
  the reference-list seed list — is removed in line with FR-016; the
  `subjects` and `levels` seed data is delivered by the user's own SQL
  against the user-prepared MySQL container).
- **FR-022**: All Stage 1 API endpoints MUST be exposed under the path
  prefix `/api/v1.0/`. The four Stage 1 endpoints are:
  - `POST /api/v1.0/teachers` and `GET /api/v1.0/teachers` (owned by
    `001-teachers`).
  - `GET /api/v1.0/subjects` (owned by `001-teachers`).
  - `POST /api/v1.0/classes` and `GET /api/v1.0/classes` (owned by
    `002-classes`).
  - `GET /api/v1.0/levels` (owned by `002-classes`).
  The version string `v1.0` is literal (not a placeholder for "current
  major.minor"); future stages add `v1.1`, `v2.0`, etc. The Stage 1
  contracts in `001-teachers/contracts/` and `002-classes/contracts/`
  MUST mirror the same prefix. Unversioned paths (e.g., `/api/teachers`)
  are out of Stage 1 scope; the route handlers MUST NOT be reachable at
  the unversioned path.

### Key Entities

Every entity below inherits the six audit columns described in FR-018
(`id`, `created_at`, `created_by`, `modified_at`, `modified_by`,
`version`). They are listed once at the top of this section so the
per-entity blocks stay focused on the domain columns.

**Common audit columns (FR-018, inherited by every entity below):**
- `id` (`BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`, primary key)
- `created_at` (`DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`)
- `created_by` (`VARCHAR(64) NOT NULL DEFAULT 'system'`)
- `modified_at` (`DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`)
- `modified_by` (`VARCHAR(64) NOT NULL DEFAULT 'system'`)
- `version` (`INT NOT NULL DEFAULT 1`)

- **Teacher** (data store table: `teachers`).
  - `name` (string, required).
  - `subject_id` (foreign key → `subjects.id`, required; resolves to
    the referenced subject's natural `name` for the public API
    response).
  - `email` (string, required, **UNIQUE** — preserved as the
    domain-natural identifier; previously the PK, now
    `UNIQUE NOT NULL`).
  - `contactNumber` (string, required).
  - `ulid` (string, required, **UNIQUE** — per FR-021; exposed in
    the Stage 1 `GET /api/teachers` and `POST /api/teachers`
    responses as the frontend-stable sync handle).
  - Common audit columns (see block above).
  - Integrity rules: `email` is unique; `ulid` is unique;
    `subject_id` references an active entry in `subjects`. The
    system MUST NOT allow a second teacher with the same `email`
    or the same `ulid` to be inserted.

- **Class** (data store table: `classes`).
  - `level_id` (foreign key → `levels.id`, required; resolves to the
    referenced level's natural `name` for the public API response).
  - `name` (string, required, **UNIQUE** — class names are globally
    unique; see Clarifications, Session 2026-06-18).
  - `form_teacher_id` (foreign key → `teachers.id`, required,
    **UNIQUE** — a teacher can be the form teacher of at most one
    class; resolves to the referenced teacher's `name` for the public
    API response).
  - `ulid` (string, required, **UNIQUE** — per FR-021; exposed in
    the Stage 1 `GET /api/classes` and `POST /api/classes`
    responses as the frontend-stable sync handle).
  - Common audit columns (see block above).
  - Integrity rules: `name` is globally unique; `form_teacher_id` is
    unique; `ulid` is unique; `form_teacher_id` references an
    existing `teachers.id`; `level_id` references an active entry in
    `levels`; a teacher can be the form teacher of at most one
    class.

- **Subject** (data store table: `subjects`; seeded in Stage 1, read-only).
  - `name` (string, required, **UNIQUE** — preserved as the
    domain-natural identifier; previously the PK, now
    `UNIQUE NOT NULL`).
  - `active` (boolean, default `true`).
  - `ulid` (string, required, **UNIQUE** — per FR-021; exposed in
    the Stage 1 `GET /api/subjects` response as the
    frontend-stable sync handle).
  - Common audit columns (see block above).
  - See Clarifications, Session 2026-06-18 — supports the Add Teacher
    dropdown. Admin authoring of subjects is out of Stage 1 scope
    (see Assumptions).

- **Level** (data store table: `levels`; seeded in Stage 1, read-only).
  - `name` (string, required, **UNIQUE** — preserved as the
    domain-natural identifier; previously the PK, now
    `UNIQUE NOT NULL`).
  - `active` (boolean, default `true`).
  - `ulid` (string, required, **UNIQUE** — per FR-021; exposed in
    the Stage 1 `GET /api/levels` response as the frontend-stable
    sync handle).
  - Common audit columns (see block above).
  - See Clarifications, Session 2026-06-18 — supports the Add Class
    dropdown. Admin authoring of levels is out of Stage 1 scope
    (see Assumptions).

- **Relationship**: each class references exactly one teacher via
  `form_teacher_id`; each teacher may be referenced by zero or one
  class. This relationship is owned by the `classes` table (the
  foreign-key column lives on the class side) and is what makes the
  form-teacher invariant enforceable at the data layer. The public
  API surface continues to express the relationship as
  `formTeacher.email` (resolved from the referenced teacher) so the
  consumer contract is unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of teacher and class records created via the API
  remain retrievable through the API after a server restart, with all
  attributes intact.
- **SC-002**: 100% of attempts to insert a duplicate teacher email,
  duplicate class `(level, name)` pair, or duplicate form teacher —
  whether via the API or directly against the data store — are
  rejected by the data layer.
- **SC-003**: 100% of attempts to create a class whose
  `teacherEmail` does not match an existing teacher are rejected with
  HTTP `404 Not Found` and the agreed error envelope.
- **SC-004**: 100% of API responses (success and error) across all
  four endpoints conform to the cross-cutting contract: the agreed
  content type, the agreed envelope shape (`{ "data": ... }` for
  lists, `{ "error": "..." }` for errors), and the agreed HTTP status
  code mapping (FR-013).
- **SC-005**: 100% of failed write operations are atomic: no partial
  data is left in the data store when a write fails.
- **SC-006**: The data store schema can be recreated from scratch in a
  single, repeatable command (the migration entry point) and matches
  the schema implied by FR-004, FR-005, and FR-016.
- **SC-007**: Under a load of 10 concurrent attempts to create a
  class with the same form teacher, at most one attempt succeeds and
  the other nine are rejected with the agreed integrity-error status
  code, so the form-teacher uniqueness invariant is preserved.
- **SC-008**: 100% of GET and POST API responses for teachers,
  classes, subjects, and levels include a top-level `ulid` field on
  every record, and the value matches the `ulid` column persisted in
  the data store (per FR-021). The frontend can therefore capture
  the ULID on first read and reuse it as the stable handle for
  future update endpoints without a separate lookup.

## Assumptions

- The frontend (the Teachers and Classes features) is the primary
  consumer of the API; the API MAY be consumed by other clients in the
  future, but those consumers are out of scope for v1.
- Login, authentication, and per-action authorization are explicitly out
  of scope (per the requirements); the API is open to any caller in the
  current scope.
- The data store is a relational database (per the requirements: "Using
  a RDBMS is highly recommended"). The exact engine and the data-access
  layer are decided in `plan.md` and are not constrained by this spec.
- The public API uses `email` as the natural identifier for a teacher
  and `(level, name)` as the natural identifier for a class, as
  documented in the requirements file. The system MAY add internal
  surrogate identifiers for persistence and joins, but those
  identifiers are not exposed in the public API for v1.
- The list endpoints return the full collection of records. Filtering,
  pagination, sorting, and search are not in scope for v1; the
  requirements file does not specify any of these behaviors.
- The error envelope and the status code mapping in FR-012 and
  FR-013 are the single source of truth for the API contract. The
  Teachers and Classes features' UI code (Add Teacher, Teachers,
  Add Class, Classes) is responsible for surfacing these errors to
  the administrator in a meaningful way.
- Migrations are **not** used in Stage 1. The MySQL schema, audit
  columns, ULID column, FK constraints, `UNIQUE` indexes, and the
  `subjects` / `levels` reference-list seed data are all created by
  the user against the user-prepared MySQL container. The application
  is read/write at runtime only — `docker compose up` MUST NOT run a
  typeORM migration or any equivalent schema-creation step (per
  FR-016).
- All endpoints are read or write operations on the entities
  above. There are no additional endpoints (e.g., health checks,
  metrics, administrative endpoints) in scope for v1. Health checks
  MAY be added later as a separate feature.
- The `subjects` and `levels` reference tables are seeded in Stage 1
  and treated as read-only by the API; no POST/PUT/DELETE endpoint
  for either table is in scope. Admin authoring of reference-list
  entries is a future-stage amendment (see `001-teachers/spec.md` and
  `002-classes/spec.md` Clarifications, Session 2026-06-18).
- The API responses this spec defines (`{ "data": [...] }` for lists,
  `{ "error": "..." }` for errors, status code table) are the cross-cutting
  contract that the `001-teachers` and `002-classes` UI layers consume.
  Per the constitution v2.3.0 amendment (2026-06-19), the UI layers are
  conformant with the constitution's current Technical Stack Constraints
  (the specific UI library and styling solution are named in the
  constitution, not in this spec); the API contract itself is unchanged.
  See `001-teachers/spec.md` and `002-classes/spec.md` Clarifications,
  Session 2026-06-19, for the per-feature translation of the amendment.
