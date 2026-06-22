# Feature Specification: Backend APIs and DB Schema

**Feature Branch**: `003-backend-api-db`
**Created**: 2026-06-18
**Status**: Draft (Stage 1 + Stage 2 cross-cutting amendments)
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

### Session 2026-06-20 (POST/GET reference object shape)

- Q: Reference fields (`subject` on POST teachers; `level` and `formTeacher` on POST classes) are currently flat strings on the wire; should they stay as strings, or become nested `{ ulid, name }` objects so the frontend can reuse the `ulid` it received from GET? → A: Wrap all three reference fields as nested `{ ulid, name }` objects in the POST request body. The `ulid` is the server-side lookup key (single indexed equality test against `uq_subjects_ulid` / `uq_levels_ulid` / `uq_teachers_ulid`); the `name` is a display hint, optional, and ignored server-side. A POST whose `ulid` matches an active record is accepted regardless of `name`; mismatched or missing `name` is NOT an error. This rule is owned by this spec (003) and propagated by reference to `001-teachers/spec.md`, `001-teachers/contracts/teachers.yaml`, `002-classes/spec.md`, and `002-classes/contracts/classes.yaml`.
- Q: GET response shape — mirror the nested `{ ulid, name }` shape, keep the current flat strings, or over-fetch both? → A: Mirror the nested shape on GET responses. Teacher `subject` returns `{ ulid, name }`; class `level` returns `{ ulid, name }`; class `formTeacher` returns `{ ulid, name }` (the existing `name` field stays, `ulid` is added). Round-tripping is consistent (`request.subject` ≅ `response.subject`); the `ulid` is already exposed as the frontend-stable sync handle (per FR-021).

### Session 2026-06-21 (operational rules)

- Q: Teacher `contactNumber` validation — keep the Singapore-mobile pattern (`^[89]\d{7}$`, exactly 8 digits, must start with `8` or `9`), relax it, or drop it entirely? → A: **Relax** the leading-digit rule. The teacher `contactNumber` MUST be exactly 8 digits, digits-only (`^\d{8}$`); no leading-digit restriction. The previous `^[89]\d{7}$` rule (Singapore-mobile assumption) is removed. This rule is owned by `001-teachers/spec.md` FR-004 and is mirrored here for completeness; both specs are updated.
- Q: Migrations in Stage 1 — keep the typeORM migration system (FR-016, FR-017, the `170000000000*-InitSchema.ts` / `SeedSubjects.ts` / `InitClasses.ts` / `SeedLevels.ts` files, the `migration:run` step in `docker-compose up`), or drop them in favour of user-managed MySQL? → A: **Drop the migration system**. The user prepares the MySQL container manually and creates the schema + seed data with their own SQL. The `docker compose up` boot sequence MUST NOT run any migration command. FR-016 and FR-017 are **deleted** from this spec. The migration inventory sections in `data-model.md` are removed. The `lib/db/migrations/` directory is removed from the project structure in `plan.md`. The `docker/docker-compose.yml` migration command is removed. The reference-list seed (subjects, levels) is delivered by user SQL, not by a typeORM migration. This rule is owned by this spec (003) and propagated by reference to `001-teachers/plan.md`, `001-teachers/data-model.md`, `002-classes/plan.md`, and `002-classes/data-model.md`.
- Q: API version prefix — what path prefix should Stage 1 endpoints use? → A: **`/api/v1.0/*`** is the literal Stage 1 prefix. The four Stage 1 endpoints are:
  - `POST /api/v1.0/teachers` and `GET /api/v1.0/teachers` (owned by `001-teachers`).
  - `GET /api/v1.0/subjects` (owned by `001-teachers`).
  - `POST /api/v1.0/classes` and `GET /api/v1.0/classes` (owned by `002-classes`).
  - `GET /api/v1.0/levels` (owned by `002-classes`).
  The version `v1.0` is literal (not a placeholder for "current major.minor"); future stages add `v1.1`, `v2.0`, etc. This rule is owned by this spec (003) and propagated by reference to all contracts in `001-teachers/contracts/` and `002-classes/contracts/`.

### Session 2026-06-21 (version-prefix propagation)

- Q1: Should the three auth endpoints (`POST /api/login`, `POST /api/logout`, `GET /api/me` from `004-user-auth`) be moved under the `/api/v1.0/` prefix (dropping the unversioned exemption), or stay unversioned? → A: **Version them** — the three auth endpoints are exposed at `POST /api/v1.0/login`, `POST /api/v1.0/logout`, `GET /api/v1.0/me`. The unversioned exemption is removed; FR-022 below is updated to list all seven endpoints under the same prefix. The constitution v2.4.0 Stage 2 In Scope block already committed to versioned paths; this clarification propagates that commitment to `004-user-auth/spec.md` and `005-security-hardening/spec.md` (the CSRF exempt list). The Stage 1 contracts in `001-teachers/contracts/` and `002-classes/contracts/` are unchanged.

### Session 2026-06-21 (status-code propagation)

- Q1: Should the **`401 Unauthorized`** status code (used by the 004
  auth middleware when a protected endpoint is accessed without a
  valid session) be moved from `004-user-auth/spec.md` into the
  cross-cutting status code table (FR-013 above) for consistency with
  the other shared codes (`400 / 404 / 409 / 415 / 500 / 503`)? → A:
  **Yes — move only 401.** The row is added to FR-013 between `400`
  and `404`, with a one-line note that 401 is returned by the auth
  middleware (owned by 004) before the handler runs. The exempt list
  stays in 004 (it's auth-specific). All other 004 details (session
  cookie attributes, the `users` table, the Redis session store,
  session-fixation prevention, login/logout/me endpoints, login
  observability) are auth-flow-specific and remain in 004 — they do
  NOT belong in the cross-cutting contract.

### Session 2026-06-21 (Stage 2 amendments)

- Q2: How should this spec (003) acknowledge Stage 2 (the auth feature
  in 004 and the hardening feature in 005)? Several Stage 1
  Assumptions are now stale: "login, authentication... out of scope";
  "all endpoints are read or write operations on the entities above
  ... no additional endpoints in scope for v1"; and the migrations
  Assumption that says "not used in Stage 1". The Status header also
  doesn't reflect that 003 now covers Stage 2 cross-cutting
  concerns. → A: **Minimal note** — bump the Status header to "Draft
  (Stage 1 + Stage 2 cross-cutting amendments)"; update the two
  stale Assumptions inline with a "Stage 1 only" marker; update the
  migrations Assumption to cover Stage 1 or Stage 2; add a `### Stage
  2 cross-cutting amendments` sub-section in the Assumptions block
  that summarises the auth-boundary addition, the three new auth
  endpoints, the hardening scope, and the list of consumers (001,
  002, 004, 005). The functional FRs are unchanged.
- Q3: Should `FR-002` / `FR-003` (the Stage 1 endpoint inventory —
  teachers, classes, subjects, levels) also include 004's three
  Stage 2 auth endpoints (`POST /api/v1.0/login`,
  `POST /api/v1.0/logout`, `GET /api/v1.0/me`) for a single
  consolidated endpoint inventory, or stay Stage 1-only? → A:
  **Keep FR-002 / FR-003 Stage 1-only**; reference the auth endpoints
  via `FR-022` (which already lists all 7 endpoints under the
  `/api/v1.0/` prefix). FR-002 / FR-003 describe the Stage 1 features
  (teachers, classes, their reference lists) in detail; adding auth
  endpoints there would dilute that focus. FR-022 is the single
  source of truth for the version-prefix inventory. 004 owns the

### Session 2026-06-22 (Stage 3 propagation from 006-teachers-classes-mutations)

- Q1 (FR-013 status-code table — `200 OK` row and `404 Not Found` clarification on DELETE): Stage 3 introduces UPDATE and DELETE on Teachers and Classes per `specs/006-teachers-classes-mutations/spec.md`. FR-013 below is updated to gain a `200 OK` row for successful UPDATE responses (Stage 3 FR-007 / FR-008) and to clarify that the existing `404 Not Found` row covers the idempotent-second-DELETE case (a second `DELETE /api/v1.0/teachers/[ulid]` or `DELETE /api/v1.0/classes/[ulid]` on a `ulid` that no longer exists returns 404 with the standard envelope — the consumer treats 404 as informational on DELETE, not as an error). The Stage 3 spec is the canonical reference for the per-endpoint behavior; this 003 spec mirrors it in the cross-cutting FR-013 table.
- Q2 (FR-013 — `previousModifiedAt` extension on PUT 200 responses): the Stage 3 PUT 200 response body (per 006 FR-007 / FR-016) MUST include the row's pre-update `modified_at` value as a sibling field named `previousModifiedAt`. This is an additive extension to the standard `{ "data": {...} }` response body (the list endpoint uses `{ "data": [...] }`; the single-resource UPDATE response uses `{ ...row, "previousModifiedAt": "..." }`). Clients that ignore `previousModifiedAt` continue to function correctly — the extension is forward-compatible. FR-013 is updated to note the extension; the per-spec amendment to FR-013 is in this spec's FR-013 below.
- Q3 (error envelope — optional `details` extension for DELETE-Teacher 409): the standard `{ "error": "..." }` envelope from FR-012 gains an optional `details` field that carries structured information about the failure. The first Stage 3 use case is `DELETE /api/v1.0/teachers/[ulid]` returning 409 (006 FR-009, updated per `specs/006-teachers-classes-mutations/spec.md` Clarifications Session 2026-06-22 (DELETE-Teacher 409 envelope — one-to-one simplification), propagated here), where `details` carries `{ "classUlid": "<classUlid>", "className": "<className>" }` (singular — the `UNIQUE INDEX uq_classes_form_teacher_id` on `classes.form_teacher_id` guarantees at most one affected class; the prior array shape `{ "classUlids": [...], "classNames": [...] }` is superseded). The `error` field stays canonical and human-readable; `details` is a machine-readable extension that downstream consumers (UI notifications, automated tests, deep-links to `/classes/[ulid]/edit`) can use without parsing the error string. Other endpoints MAY use the `details` extension but are not required to. FR-012 below is updated to note the optional `details` extension with the singular shape.
- Q4 (error envelope — `details.classNames` truncation policy): **Superseded by `specs/006-teachers-classes-mutations/spec.md` Clarifications Session 2026-06-22 (DELETE-Teacher 409 envelope — one-to-one simplification), propagated here**. The prior N > 5 truncation logic (first-5-names + `… and N more` suffix) is unreachable under the one-to-one DB constraint (`UNIQUE INDEX uq_classes_form_teacher_id` — N is always 0 or 1). The wire envelope becomes singular (`details.classUlid` / `details.className`); no truncation, no array, no suffix. FR-012 / FR-013 below are updated to reflect the singular envelope; this UI-presentation contract is owned by 006 and reflected here for cross-cutting completeness.
  auth endpoints' functional details (request body shape, response
  shape, error envelope, session-fixation prevention).

### Session 2026-06-22 (DELETE-Teacher 409 envelope — one-to-one simplification propagation from 006)

- Q1 (per-spec propagation of `specs/006-teachers-classes-mutations/spec.md` Clarifications Session 2026-06-22 (DELETE-Teacher 409 envelope — one-to-one simplification)): the FR-012 example and the Session 2026-06-22 (Stage 3 propagation) Q3 / Q4 wording above are updated from arrays (`classUlids[]` / `classNames[]`) to singular (`classUlid` / `className`). The Stage 3 error envelope for `DELETE /api/v1.0/teachers/[ulid]` 409 is `{ "error": "Teacher is assigned as form teacher of class \"<className>\". Reassign or delete that class first.", "details": { "classUlid": "<classUlid>", "className": "<className>" } }`. The `details` extension on the error envelope (per FR-012) is preserved — it carries structured info for programmatic consumers (deep-link to `/classes/[ulid]/edit`, automated tests). The Q4 truncation policy (first-5-names + `… and N more`) is unreachable under the one-to-one DB constraint and is superseded. The same propagation is mirrored in `specs/002-classes/spec.md` (Session 2026-06-22 Stage 3 propagation Q2 wording + Edge Cases bullet). `specs/001-teachers/spec.md` does not reference the DELETE-Teacher 409 envelope and needs no propagation.

### Session 2026-06-22 (v2.6.0 expansion — single-resource GET, per constitution v2.6.0)

- Q1 (two new single-resource GET endpoints — `GET /api/v1.0/teachers/[ulid]` and `GET /api/v1.0/classes/[ulid]`): the constitution v2.6.0 amendment (per the Sync Impact Report at the top of `.specify/memory/constitution.md`) authorises two new single-resource fetch endpoints in the Stage 3 In Scope block. The teachers endpoint is added to FR-002 (Teachers API surface) below; the classes endpoint is added to FR-003 (Classes API surface) below. Both endpoints are authenticated (Principle IV — `401` without a valid session cookie, inherited from FR-013 below) and CSRF-exempt (GET is exempt per Principle IX.3). Both endpoints return `404 Not Found` with `{ "error": "Teacher not found" }` / `{ "error": "Class not found" }` on an unknown `ulid`; the `404 Not Found` row in FR-013 below is extended to cover these two new endpoints (the row already covered DELETE-second-call; the GET-`[ulid]` 404 is an additive use of the same status). The endpoints are the data source for the Stage 3 Edit Teacher / Edit Class pages owned by `specs/006-teachers-classes-mutations/spec.md` FR-002 / FR-003; the previous RSC + typeORM fallback in 006 is superseded.
- Q2 (FR-022 prefix inventory — gap closure for v2.5.0 + addition of v2.6.0 endpoints): the previous FR-022 listed only the Stage 1 and Stage 2 endpoints under the `/api/v1.0/` prefix and missed the four Stage 3 v2.5.0 PUT/DELETE endpoints (introduced by the constitution v2.5.0 amendment). The v2.6.0 amendment closes that gap and adds the two new v2.6.0 GET endpoints. FR-022 below is restructured to list all endpoints grouped by stage, making FR-022 the single source of truth for the versioned-prefix inventory. This is a per-spec amendment to FR-022; the cross-cutting prefix rule is unchanged.

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
3. **Given** no teacher exists with `ulid = "01H00000000000000000000000"` (i.e., no teacher row whose `uq_teachers_ulid` matches),
   **When** the system is asked to create a class with
   `formTeacher = { ulid: "01H00000000000000000000000", name: "Nobody" }`, **Then** the request is
   rejected with a not-found status code (`404 Not Found`) and a meaningful error message (`{ "error": "Teacher not found" }`).
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
  `name`, unknown `subject.ulid`, unknown `level.ulid`)? — The
  endpoint MUST map the violation to the agreed status code (see
  FR-009, FR-009a) and a meaningful error message.
- What happens when the request body carries a reference object whose
  nested `name` field does not match the row identified by its
  `ulid` (e.g., `subject: { ulid: "01H...", name: "Wrong Label" }`)? —
  The server ignores `name`; only `ulid` is consulted for the lookup
  (per Clarifications, Session 2026-06-20 (POST/GET reference object
  shape)). The response echoes the authoritative `name` from the
  referenced row, not the client-supplied value.
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
    `ulid` (per FR-021), `name`, `subject` (nested `{ ulid, name }`
    per FR-020 and Clarifications, Session 2026-06-20 (POST/GET
    reference object shape)), `email`, and `contactNumber`.
  - `GET /api/v1.0/teachers` — list all teachers; success returns HTTP
    `200 OK` with `{ "data": [ ...teachers ] }`, each entry carrying
    `ulid` (per FR-021), `name`, `subject` (nested `{ ulid, name }`
    per FR-020), `email`, and `contactNumber`.
  - `GET /api/v1.0/teachers/[ulid]` (NEW, per constitution v2.6.0) —
    single-resource fetch on a Teacher. Success returns HTTP
    `200 OK` with the teacher record in the same shape as a single
    entry in `GET /api/v1.0/teachers` (per the previous bullet):
    `ulid`, `name`, `subject` (nested `{ ulid, name }` per FR-020),
    `email`, and `contactNumber`. The endpoint returns `404 Not
    Found` with `{ "error": "Teacher not found" }` on an unknown
    `ulid` (per the cross-cutting FR-013 status-code table, which
    is extended by the v2.6.0 amendment to cover this GET-`[ulid]`
    404 case). The endpoint is the data source for the Stage 3 Edit
    Teacher page (`/teachers/[ulid]/edit`, owned by
    `specs/006-teachers-classes-mutations/spec.md` FR-002); the
    previous RSC + typeORM fallback in 006 is superseded by this
    endpoint. See Clarifications, Session 2026-06-22 (v2.6.0
    expansion).
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
    `ulid` (per FR-021), `name`, `level` (nested `{ ulid, name }`
    per FR-020 and Clarifications, Session 2026-06-20 (POST/GET
    reference object shape)), and `formTeacher` (nested
    `{ ulid, name }`).
  - `GET /api/v1.0/classes` — list all classes; success returns HTTP
    `200 OK` with `{ "data": [ ...classes ] }`. Each entry includes
    `ulid` (per FR-021), `name`, `level` (nested `{ ulid, name }`),
    and `formTeacher` (nested `{ ulid, name }`).
  - `GET /api/v1.0/classes/[ulid]` (NEW, per constitution v2.6.0) —
    single-resource fetch on a Class. Success returns HTTP
    `200 OK` with the class record in the same shape as a single
    entry in `GET /api/v1.0/classes` (per the previous bullet):
    `ulid`, `name`, `level` (nested `{ ulid, name }`), and
    `formTeacher` (nested `{ ulid, name }`). The endpoint returns
    `404 Not Found` with `{ "error": "Class not found" }` on an
    unknown `ulid` (per the cross-cutting FR-013 status-code table,
    which is extended by the v2.6.0 amendment to cover this
    GET-`[ulid]` 404 case). The endpoint is the data source for
    the Stage 3 Edit Class page (`/classes/[ulid]/edit`, owned by
    `specs/006-teachers-classes-mutations/spec.md` FR-003); the
    previous RSC + typeORM fallback in 006 is superseded by this
    endpoint. See Clarifications, Session 2026-06-22 (v2.6.0
    expansion).
  - `GET /api/v1.0/levels` — list all active levels; success returns
    HTTP `200 OK` with `{ "data": [ { "name", "active", "ulid" } ] }`,
    filtered to entries where `active = true`. (See Clarifications,
    Session 2026-06-18 — supports the Add Class dropdown; `ulid`
    is the frontend-stable sync handle per FR-021.)
- **FR-004**: The system MUST store the following attributes for each
  **teacher** record, with the constraints listed:
  - `name` (string, required, non-empty).
  - `subject` (**nested object** on the public API surface, required —
    see Clarifications, Session 2026-06-20 (POST/GET reference object
    shape); the wire shape is `{ ulid: string, name?: string }`):
    - `ulid` (string, required, exactly 26 characters, Crockford
      Base32 — the server-side lookup key, resolved against
      `uq_subjects_ulid`).
    - `name` (string, optional on the request; display hint, ignored
      server-side; on the response, echoes the referenced subject's
      authoritative `name`).
    Persisted as `teachers.subject_id` — a foreign key → `subjects.id`
    referencing an active entry in the `subjects` reference list (see
    FR-019). The route handler resolves the submitted `subject.ulid`
    to `subjects.id` before insert; the `subject.name` value is NOT
    validated against the referenced row. An unknown or inactive
    `subject.ulid` is rejected with `400 Bad Request` +
    `{ "error": "Invalid subject" }` per FR-013.
  - `email` (string, required, must be a syntactically valid email
    address, **unique across all teacher records**).
  - `contactNumber` (string, required, exactly 8 digits, digits-only;
    no leading-digit restriction — see
    `001-teachers/spec.md` Clarifications, Session 2026-06-21).
- **FR-005**: The system MUST store the following attributes for each
  **class** record, with the constraints listed:
  - `level` (**nested object** on the public API surface, required —
    see Clarifications, Session 2026-06-20 (POST/GET reference object
    shape); the wire shape is `{ ulid: string, name?: string }`):
    - `ulid` (string, required, exactly 26 characters, Crockford
      Base32 — the server-side lookup key, resolved against
      `uq_levels_ulid`).
    - `name` (string, optional on the request; display hint, ignored
      server-side; on the response, echoes the referenced level's
      authoritative `name`).
    Persisted as `classes.level_id` — a foreign key → `levels.id`
    referencing an active entry in the `levels` reference list (see
    FR-019). The route handler resolves the submitted `level.ulid`
    to `levels.id` before insert; the `level.name` value is NOT
    validated against the referenced row. An unknown or inactive
    `level.ulid` is rejected with `400 Bad Request` +
    `{ "error": "Invalid level" }` per FR-013.
  - `name` (string, required, non-empty, **unique across all class
    records** — class names are globally unique; see
    `002-classes/spec.md` Clarifications, Session 2026-06-18).
  - `formTeacher` (**nested object** on the public API surface,
    required — see Clarifications, Session 2026-06-20 (POST/GET
    reference object shape); the wire shape is
    `{ ulid: string, name?: string }`):
    - `ulid` (string, required, exactly 26 characters, Crockford
      Base32 — the server-side lookup key, resolved against
      `uq_teachers_ulid`).
    - `name` (string, optional on the request; display hint, ignored
      server-side; on the response, echoes the referenced teacher's
      authoritative `name`).
    Persisted as `classes.form_teacher_id` — a foreign key →
    `teachers.id` resolving to the referenced teacher row (see FR-019).
    The `form_teacher_id` column carries a `UNIQUE` constraint so a
    teacher can be the form teacher of at most one class. The route
    handler resolves the submitted `formTeacher.ulid` to `teachers.id`
    before insert; the `formTeacher.name` value is NOT validated
    against the referenced row. A `formTeacher.ulid` that does not
    match any active teacher is rejected with `404 Not Found` +
    `{ "error": "Teacher not found" }` per FR-013.
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
  domain-natural identifier names on the `name` fields (`subjects.name`,
  `levels.name`, `classes.name`, the teacher name resolved from
  `form_teacher_id` and surfaced via `formTeacher.name`) so the
  consumer contract remains stable. Reference fields on the public API
  surface are **nested objects** of shape `{ ulid, name }` (see
  Clarifications, Session 2026-06-20 (POST/GET reference object
  shape)) on both POST and GET: teachers expose `subject` as
  `{ ulid, name }`; classes expose `level` as `{ ulid, name }` and
  `formTeacher` as `{ ulid, name }`. The `id`, `created_at`,
  `created_by`, `modified_at`, `modified_by`, and `version` columns
  are **not** exposed in the Stage 1 API responses; they are
  persistence-side audit metadata available only to internal code. The
  **`ulid` column is the explicit exception** (per FR-021): it IS
  exposed in every Stage 1 GET response (top-level on each record, and
  on the nested reference objects) and every POST 201 confirmation
  body as the frontend-stable sync handle.
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
- **FR-007**: The system MUST enforce that a `class.formTeacher.ulid`
  (resolved at the data layer to `classes.form_teacher_id` via
  `uq_teachers_ulid`) refers to an existing `teachers.id`
  (referential integrity), so that a class cannot exist without a
  corresponding teacher record. The application-level defence is the
  `findTeacherByUlid` lookup before insert (per FR-020); the FK
  `fk_classes_form_teacher` is the backstop (per FR-019).
- **FR-008**: The system MUST enforce `formTeacher.ulid` uniqueness on
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
  nested API fields (`subject.ulid`, `level.ulid`) are resolved to
  the FK id by the route handler via `uq_subjects_ulid` /
  `uq_levels_ulid` before insert (per Clarifications, Session
  2026-06-20 (POST/GET reference object shape)); the FK constraints
  (`fk_teachers_subject`, `fk_classes_level`) are the backstop for
  direct writes that bypass the API (see Clarifications, Session
  2026-06-18).
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
  JSON envelope `{ "error": "Some meaningful error message" }`. The
  envelope MAY be extended with an optional `details` field that
  carries structured, machine-readable information about the failure
  (e.g., `{ "details": { "classUlid": "<classUlid>", "className": "<className>" } }`
  on `DELETE /api/v1.0/teachers/[ulid]` 409 per `specs/006-teachers-classes-mutations/spec.md`
  FR-009, updated per `specs/006-teachers-classes-mutations/spec.md`
  Clarifications Session 2026-06-22 (DELETE-Teacher 409 envelope —
  one-to-one simplification) — the prior array shape `{ "classUlids": [...], "classNames": [...] }`
  is superseded because the `UNIQUE INDEX uq_classes_form_teacher_id`
  constraint guarantees at most one affected class; N is always 0 or
  1). The `error` field stays canonical and human-readable; the
  `details` extension is opt-in per endpoint and consumers that ignore
  it continue to function correctly. Per Clarifications, Session
  2026-06-22 (Stage 3 propagation), the first Stage 3 use case is
  DELETE-Teacher 409; future endpoints MAY adopt the same pattern.
- **FR-013**: The system MUST map the following failure conditions to
  the following HTTP status codes:
  - `200 OK` — successful UPDATE responses on `PUT /api/v1.0/teachers/[ulid]`
    and `PUT /api/v1.0/classes/[ulid]` (per Stage 3, `specs/006-teachers-classes-mutations/spec.md`
    FR-007 / FR-008). The 200 response body MAY include the optional
    `previousModifiedAt` extension described in the Stage 3 spec (FR-007
    / FR-016); clients that ignore the extension continue to function
    correctly.
  - `400 Bad Request` — request body is missing, malformed, or fails
    field-level validation (e.g., invalid email format, invalid contact
    number, missing required field, unknown `subject.ulid`, unknown
    `level.ulid`).
  - `401 Unauthorized` — a protected endpoint is accessed without a
    valid session cookie; the auth middleware (owned by
    `specs/004-user-auth/spec.md`) rejects the request before the
    handler runs. The exempt list is owned by 004 (currently
    `POST /api/v1.0/login` and `GET /api/v1.0/me`; logout is exempt
    by idempotency and `GET` exemption). (Per
    `specs/004-user-auth/spec.md` Clarification Session
    2026-06-21, Q1 — status code propagation: 401 was promoted
    from a 004 Assumption into this cross-cutting table.)
  - `404 Not Found` — a referenced teacher (`formTeacher.ulid`) does
    not exist when creating a class; OR a `DELETE /api/v1.0/teachers/[ulid]`
    / `DELETE /api/v1.0/classes/[ulid]` request targets a `ulid` that
    no longer exists (idempotent-second-DELETE per Stage 3 Principle X.2);
    OR a `GET /api/v1.0/teachers/[ulid]` / `GET /api/v1.0/classes/[ulid]`
    request targets a `ulid` that does not match any registered
    teacher / class (per the constitution v2.6.0 expansion; the
    error envelope is `{ "error": "Teacher not found" }` /
    `{ "error": "Class not found" }`). The consumer treats 404 on
    DELETE and on GET-`[ulid]` as informational, not as an error;
    the standard envelope is returned in all cases.
  - `409 Conflict` — a uniqueness or referential-integrity rule is
    violated: duplicate teacher email, duplicate form teacher,
    duplicate class `name` (globally unique per FR-009), or a
    duplicate `ulid` (theoretical ULID collision caught by the
    per-table `UNIQUE` index per FR-021; vanishingly rare in practice
    but covered for defense-in-depth). Stage 3 extends this row with
    two additional 409 cases: `DELETE /api/v1.0/teachers/[ulid]` against
    a teacher currently assigned as form teacher (per
    `specs/006-teachers-classes-mutations/spec.md` FR-009 / Principle
    X.1), and `PUT /api/v1.0/classes/[ulid]` updating `formTeacher.ulid`
    to a teacher who is already the form teacher of a different class
    (per 006 FR-008 / Principle X.3). The DELETE-Teacher 409 carries the
    optional `details` extension (FR-012).
  - `415 Unsupported Media Type` — request `Content-Type` is not
    `application/json`.
  - `500 Internal Server Error` — unexpected server-side failure.
  - `503 Service Unavailable` — the data store (or the Redis session
    store, per 004) is briefly unreachable.
  The Stage 1 version prefix `/api/v1.0/` (per FR-022) does not change
  the status code mapping — the same status codes apply to the
  versioned paths. The Stage 3 spec (`specs/006-teachers-classes-mutations/spec.md`)
  is the canonical reference for the Stage 3 200 / 409 / 404 additions.
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
- **FR-022**: All API endpoints MUST be exposed under the path prefix
  `/api/v1.0/`. The endpoints are:

  **Stage 1** (per Clarifications, Session 2026-06-21):
  - `POST /api/v1.0/teachers` and `GET /api/v1.0/teachers` (owned by
    `001-teachers`).
  - `GET /api/v1.0/subjects` (owned by `001-teachers`).
  - `POST /api/v1.0/classes` and `GET /api/v1.0/classes` (owned by
    `002-classes`).
  - `GET /api/v1.0/levels` (owned by `002-classes`).

  **Stage 2** (per Clarifications, Session 2026-06-21 (version-prefix
  propagation) — the unversioned exemption for the three auth
  endpoints is removed):
  - `POST /api/v1.0/login` and `POST /api/v1.0/logout` and
    `GET /api/v1.0/me` (owned by `004-user-auth`).

  **Stage 3 v2.5.0** (per constitution v2.5.0 amendment; added to
  FR-022 by the v2.6.0 amendment to close a pre-existing gap in the
  prefix inventory):
  - `PUT /api/v1.0/teachers/[ulid]` and
    `DELETE /api/v1.0/teachers/[ulid]` (owned by
    `006-teachers-classes-mutations`).
  - `PUT /api/v1.0/classes/[ulid]` and
    `DELETE /api/v1.0/classes/[ulid]` (owned by
    `006-teachers-classes-mutations`).

  **Stage 3 v2.6.0** (NEW, per constitution v2.6.0 amendment and
  Clarifications, Session 2026-06-22 (v2.6.0 expansion)):
  - `GET /api/v1.0/teachers/[ulid]` (owned by
    `006-teachers-classes-mutations`).
  - `GET /api/v1.0/classes/[ulid]` (owned by
    `006-teachers-classes-mutations`).

  The version string `v1.0` is literal (not a placeholder for "current
  major.minor"); future stages add `v1.1`, `v2.0`, etc. The contracts
  in `001-teachers/contracts/`, `002-classes/contracts/`,
  `004-user-auth/contracts/`, and the Stage 3 contracts in
  `006-teachers-classes-mutations/contracts/` MUST mirror the same
  prefix. Unversioned paths (e.g., `/api/teachers`, `/api/login`)
  are out of scope; the route handlers MUST NOT be reachable at the
  unversioned path.

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
  - `subject_id` (foreign key → `subjects.id`, required; the route
    handler resolves the request body's `subject.ulid` (per FR-004
    and Clarifications, Session 2026-06-20 (POST/GET reference
    object shape)) to `subjects.id` via `uq_subjects_ulid` before
    insert; the public API exposes the reference as the nested
    `{ ulid, name }` shape on both POST and GET).
  - `email` (string, required, **UNIQUE** — preserved as the
    domain-natural identifier; previously the PK, now
    `UNIQUE NOT NULL`).
  - `contactNumber` (string, required).
  - `ulid` (string, required, **UNIQUE** — per FR-021; exposed in
    the Stage 1 `GET /api/v1.0/teachers` and `POST /api/v1.0/teachers`
    responses as the frontend-stable sync handle).
  - Common audit columns (see block above).
  - Integrity rules: `email` is unique; `ulid` is unique;
    `subject_id` references an active entry in `subjects`. The
    system MUST NOT allow a second teacher with the same `email`
    or the same `ulid` to be inserted.

- **Class** (data store table: `classes`).
  - `level_id` (foreign key → `levels.id`, required; the route
    handler resolves the request body's `level.ulid` (per FR-005
    and Clarifications, Session 2026-06-20 (POST/GET reference
    object shape)) to `levels.id` via `uq_levels_ulid` before
    insert; the public API exposes the reference as the nested
    `{ ulid, name }` shape on both POST and GET).
  - `name` (string, required, **UNIQUE** — class names are globally
    unique; see Clarifications, Session 2026-06-18).
  - `form_teacher_id` (foreign key → `teachers.id`, required,
    **UNIQUE** — a teacher can be the form teacher of at most one
    class; the route handler resolves the request body's
    `formTeacher.ulid` (per FR-005 and Clarifications, Session
    2026-06-20 (POST/GET reference object shape)) to `teachers.id`
    via `uq_teachers_ulid` before insert; the public API exposes
    the reference as the nested `{ ulid, name }` shape on both
    POST and GET).
  - `ulid` (string, required, **UNIQUE** — per FR-021; exposed in
    the Stage 1 `GET /api/v1.0/classes` and `POST /api/v1.0/classes`
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
  API surface expresses the relationship as a nested
  `formTeacher: { ulid, name }` object (per Clarifications, Session
  2026-06-20 (POST/GET reference object shape) and FR-020); the
  `ulid` is the server-side lookup key resolved against
  `uq_teachers_ulid`, and the `name` echoes the referenced teacher's
  authoritative `name`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of teacher and class records created via the API
  remain retrievable through the API after a server restart, with all
  attributes intact.
- **SC-002**: 100% of attempts to insert a duplicate teacher email,
  duplicate class `name` (globally unique per FR-009), or duplicate
  form teacher — whether via the API or directly against the data
  store — are rejected by the data layer.
- **SC-003**: 100% of attempts to create a class whose
  `formTeacher.ulid` does not match any registered teacher are
  rejected with HTTP `404 Not Found` and the agreed error envelope.
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
- **SC-009**: 100% of GET and POST API responses for teachers and
  classes expose reference fields as nested `{ ulid: string,
  name: string }` objects — teachers expose `subject`; classes
  expose `level` and `formTeacher`. The `ulid` value on each
  reference object matches the `ulid` column of the referenced row
  in the corresponding reference table (`subjects`, `levels`, or
  `teachers`). The POST request body uses the same nested shape
  with `ulid` required (26-character Crockford Base32) and `name`
  optional; the server uses `ulid` for the lookup and ignores
  `name` (per Clarifications, Session 2026-06-20 (POST/GET reference
  object shape)).

## Assumptions

- The frontend (the Teachers and Classes features) is the primary
  consumer of the API; the API MAY be consumed by other clients in the
  future, but those consumers are out of scope for v1.
- In Stage 1, login, authentication, and per-action authorization are
  explicitly out of scope (per the original requirements); the API is
  open to any caller in Stage 1. (Stage 2 brings authentication in
  scope — see "Stage 2 cross-cutting amendments" below.)
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
- Migrations are **not** used in Stage 1 or Stage 2. The MySQL schema,
  audit columns, ULID column, FK constraints, `UNIQUE` indexes, and the
  `subjects` / `levels` reference-list seed data (Stage 1), plus the
  `users` table (Stage 2, per `specs/004-user-auth/spec.md`), are all
  created by the user against the user-prepared MySQL container. The
  application is read/write at runtime only — `docker compose up` MUST
  NOT run a typeORM migration or any equivalent schema-creation step
  (per FR-016).
- In Stage 1, all endpoints are read or write operations on the
  `subjects`, `teachers`, `levels`, and `classes` entities. Stage 2
  adds three cross-cutting auth endpoints (`login`, `logout`, `me`)
  under the same `/api/v1.0/` prefix — see "Stage 2 cross-cutting
  amendments" below and FR-022. Health checks and other administrative
  endpoints remain out of scope.
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

### Stage 2 cross-cutting amendments (added 2026-06-21, per
`specs/003-backend-api-db` Clarification Session 2026-06-21, Q2, and
the constitution v2.4.0 amendment):

- **Consumers of this contract.** `specs/001-teachers/spec.md` and
  `specs/002-classes/spec.md` (Stage 1; both inherit FR-013 and
  FR-022), `specs/004-user-auth/spec.md` (Stage 2; the three auth
  endpoints are listed in FR-022 and the 401 status code is driven
  by the 004 auth middleware), and `specs/005-security-hardening/spec.md`
  (Stage 2; the four Principle IX controls apply at the HTTP boundary
  and add no new status code beyond `401`).
- **Authentication is in scope.** The session-based authentication
  boundary (Stage 2 In Scope — `specs/004-user-auth/spec.md`) protects
  every `/api/v1.0/*` endpoint except the auth-middleware exempt list
  (`POST /api/v1.0/login` and `GET /api/v1.0/me`; logout is exempt by
  idempotency and `GET`-method exemption). The `401 Unauthorized` row
  in FR-013 is the cross-cutting status code for "no valid session";
  the auth middleware itself is owned by 004 and described there.
- **Stage 1 assumptions above describe Stage 1 scope.** Where an
  Assumption says "Stage 1", the rule continues to apply to Stage 2
  unless explicitly superseded by this amendments section.
- **Hardening is in scope** (`specs/005-security-hardening/spec.md`)
  but adds no new status codes and no new endpoints; it applies the
  four Principle IX controls at the HTTP boundary and is invisible to
  the FR-013 / FR-022 contract.
