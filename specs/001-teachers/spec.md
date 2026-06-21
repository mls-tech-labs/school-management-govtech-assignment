# Feature Specification: Teachers

**Feature Branch**: `001-teachers`
**Created**: 2026-06-18
**Status**: Draft(Stage 1 + Stage 2 cross-cutting amendments)
**Input**: User description: "Please help to create 3 feature specifications. 1 for teachers, 2 Classes, 3 Backend api and DB manipulations. Please refer to the .requirements/Full Stack Assignment.md file for teachers and Classes behaviors. you may capture the all data fields from the UI for DB table models. UI must be matched on the designs provided."

## Clarifications

### Session 2026-06-18

- Q: Subject field type — free-text or predefined list? → A: Predefined list (extensible). Stage 1 ships with a seeded set of subjects, the Add Teacher form selects **Subject** from a dropdown populated by that list, and the value is persisted as a foreign key to a `subjects` reference table. Adding or editing subjects is deferred to a later stage (admin UI for the `subjects` reference table) and is explicitly out of Stage 1 scope.
- Q: Contact number format and length? → A: 8-digit Singapore number, digits only, must start with `8` or `9` (e.g., `91234567`). The Figma design referenced in FR-004 is not accessible, so the format is pinned here so the Joi schema, typeORM column, regex, and unit tests share one source of truth.
- Q: HTTP status when a duplicate email is submitted, including races? → A: `409 Conflict`, sourced from the MySQL `UNIQUE` constraint violation. Joi still rejects malformed payloads with `400`. The route handler must translate the typeORM unique-constraint error into the standard `{ "error": "Email already in use" }` envelope with `409`. This is race-safe by construction — two simultaneous submissions with the same email cannot both succeed.
- Q: Pagination for the teachers list? → A: No pagination in Stage 1. The GET endpoint returns the full list of teachers in a single `{ "data": [...] }` response. The Stage 1 upper bound is ≤ 500 teachers (see Assumptions); pagination is a future-stage amendment if the school outgrows that bound.
- Q: API response-time target? → A: No new API-level target in Stage 1. The existing end-to-end `SC-001` (≤ 30 s from form submit to teacher visible in the list) is the only performance criterion for this spec. Adding a p95 latency target is deferred to a future stage if it becomes necessary; YAGNI per Principle V (Simplicity).
- Q: Cross-cutting `415` + `503` status codes (propagated from `003-backend-api-db`)? → A: Accepted. The status-code table for this spec is updated to `400` (validation) / `409` (duplicate email) / `415` (request `Content-Type` is not `application/json`) / `500` (unhandled server failure) / `503` (data store briefly unreachable). Aligns with `003-backend-api-db/spec.md` Clarifications, Session 2026-06-18.

### Session 2026-06-19

- Q: Constitution v2.2.0 → v2.3.0 amendment swaps SGDS v3 (`@govtechsg/sgds-react`) for **Ant Design (`antd`)** + **Tailwind CSS** — how does that apply to this feature's UI? → A: The change is materialised in `plan.md` (Technical Context dependency list, Constitution Check Principle VIII row, Project Structure source tree, "Constitution TODO items" resolution entry) and `research.md` §1.3 (new "UI library and styling version pin" entry supersedes the prior SGDS v3 entry), and in `tasks.md` (T001 dependency list, new T012a for `tailwind.config.ts` + `postcss.config.mjs`, T012/T013/T029/T030/T049 wrap-up comments). The functional behaviour of the Teachers feature is unchanged: the same four user stories, the same FR-001..FR-012, the same SC-001..SC-005, the same Figma layout intent, the same JSDoc/Form/Table/State components — just composed from `antd` primitives (`Form`, `Input`, `Select`, `Table`, `Button`, `Modal`) and styled with Tailwind utility classes instead of SGDS. The "Add a teacher first" empty state, the field-level error slot, the loading skeleton, and the form-level error handling are all preserved. Tailwind tokens (colour palette, font stack, breakpoints, spacing scale) are declared in `tailwind.config.ts` (new T012a) and component code references them via utility classes — no raw hex values, no per-component CSS modules.

### Session 2026-06-19 (audit columns)

- Q: `teachers` and `subjects` need a uniform audit column pattern (`id`, `created_at`, `created_by`, `modified_at`, `modified_by`, `version`) — how does this apply to the two tables owned by the Teachers feature? → A: Both tables gain the six audit columns per `003-backend-api-db/spec.md` FR-018 (cross-cutting; same answers — `id` becomes the PK on every table; natural keys `teachers.email` and `subjects.name` are preserved as `UNIQUE NOT NULL`; FKs reference `id` not the natural key; `created_by`/`modified_by` are `VARCHAR(64) NOT NULL DEFAULT 'system'`; `version` is `INT NOT NULL DEFAULT 1`; `created_at`/`modified_at` are `DATETIME(6)` with `CURRENT_TIMESTAMP(6)` defaults). The Stage 1 public API responses continue to expose `teachers.email`, `teachers.subject` (resolved by joining to `subjects.name`), `subjects.name`, and `subjects.active` so the consumer contract is unchanged (per FR-020). The Teachers feature's existing Joi schemas, typeORM entities, and repository code are updated to map between the API surface (natural-key field names) and the persistence layer (surrogate `id` + FK by `id`). The migration that introduces these columns is the existing `InitSchema.ts` migration (no separate "add audit columns" migration because Stage 1's DB has not yet been seeded with live data).

### Session 2026-06-20 (ULID column)

- Q: `teachers` and `subjects` tables gain a `ulid CHAR(26) NOT NULL UNIQUE` column per `003-backend-api-db/spec.md` FR-021 — how does this apply to the two tables owned by the Teachers feature? → A: Both tables (`teachers`, `subjects`) carry the new `ulid` column. It is generated server-side via the `ulid` npm package (route handler or typeORM `@BeforeInsert()` hook), is `UNIQUE` per row with its own `UNIQUE` index, is **exposed** in every Stage 1 GET and POST response as the frontend-stable sync handle (the deliberate exception to the FR-020 "audit columns hidden" rule), and is **not** used as a foreign-key target — joins remain on the surrogate `id` (per FR-019). The Stage 1 public API responses gain a top-level `ulid` field on each teacher and each subject; the natural-key fields (`teachers.email`, `teachers.subject`, `subjects.name`, `subjects.active`) are unchanged. The migration that introduces this column is the existing `InitSchema.ts` migration (no separate "add ulid column" migration because Stage 1's DB has not yet been seeded with live data). **Superseded by Session 2026-06-21**: there is no `InitSchema.ts` migration in Stage 1; the schema is created by the user against the user-prepared MySQL container (per the FR-016 change in `003-backend-api-db/spec.md`).

### Session 2026-06-21 (operational rules)

- Q: Teacher `contactNumber` validation — keep the Singapore-mobile pattern (`^[89]\d{7}$`, exactly 8 digits, must start with `8` or `9`), relax it, or drop it entirely? → A: **Relax the leading-digit rule** (per `003-backend-api-db/spec.md` Clarifications, Session 2026-06-21). The teacher's `contactNumber` MUST be exactly 8 digits, digits-only, and **must NOT have any leading-digit restriction**. The Joi pattern becomes `^\d{8}$`. The previous "must start with `8` or `9`" Singapore-mobile assumption is removed. FR-004 below is updated.
- Q: Migrations in Stage 1 — keep the typeORM migration system or drop it in favour of user-managed MySQL? → A: **Drop the migration system** (per `003-backend-api-db/spec.md` FR-016). The user prepares the MySQL container manually and creates the schema + seed data with their own SQL. The `docker compose up` boot sequence MUST NOT run any migration command. The `lib/db/migrations/` directory and the `typeorm-ts-node-commonjs migration:run` command are out of Stage 1 scope for the Teachers feature. The `1700000000000-InitSchema.ts` and `1700000000001-SeedSubjects.ts` migration files (referenced throughout this spec and `plan.md` / `data-model.md` / `quickstart.md`) are removed. The "the migration that introduces this column is the existing `InitSchema.ts` migration" wording in the previous two Sessions is superseded.
- Q: API version prefix — what path prefix should Stage 1 endpoints use? → A: **`/api/v1.0/*`** is the literal Stage 1 prefix (per `003-backend-api-db/spec.md` FR-022). The two Teachers-feature endpoints are `POST /api/v1.0/teachers` and `GET /api/v1.0/teachers`; the Subjects endpoint is `GET /api/v1.0/subjects`. The unversioned paths (`/api/teachers`, `/api/subjects`) are out of Stage 1 scope. FR-006, FR-007, and the contract files in `./contracts/` are updated to match.

### Session 2026-06-20 (POST/GET reference object shape)

- Q: `subject` on POST teachers is currently a string on the wire — should it stay a string, or become a nested `{ ulid, name }` object so the frontend can reuse the `ulid` it received from GET `/api/v1.0/subjects`? → A: Wrap `subject` as a nested `{ ulid, name }` object in the POST request body. The `ulid` is the server-side lookup key (single indexed equality test against `uq_subjects_ulid`); the `name` is a display hint, optional, and ignored server-side. A POST whose `ulid` matches an active entry is accepted regardless of `name`; mismatched or missing `name` is NOT an error. This rule is owned by `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20 and propagated by reference to this spec, FR-005a, FR-006, FR-007, FR-010, and the contract files in `./contracts/`.
- Q: GET response shape for teachers — mirror the nested `{ ulid, name }` shape, keep the current flat string for `subject`, or over-fetch both? → A: Mirror the nested shape on GET responses. Teacher `subject` returns `{ ulid, name }` on every entry in `GET /api/v1.0/teachers`. Round-tripping is consistent (`request.subject` ≅ `response.subject`); the `ulid` is already exposed as the frontend-stable sync handle (per FR-014).

### Session 2026-06-21 (401 propagation)

- Q1: After Stage 2 ships, every protected `/api/v1.0/*` endpoint
  returns `401 Unauthorized` when accessed without a valid session
  cookie. Should this FR-010 status code table add the `401` row?
  → A: **Yes — add the 401 row only.** The row is inserted between
  `400 Bad Request` and `409 Conflict`, with a one-line note that
  401 is inherited from `specs/003-backend-api-db/spec.md` FR-013
  (owned by `specs/004-user-auth/spec.md`'s auth middleware). No
  other Stage 2 details (CSRF / CORS / XSS posture) are added here —
  those are owned by `specs/005-security-hardening/spec.md` and
  apply at the HTTP boundary without changing the status code
  mapping.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register a Teacher (Priority: P1)

An administrator adds a new teacher to the system by completing a registration form with the teacher's name, subject, email, and contact number, and submitting it. The system saves the teacher and confirms the new record was created.

**Why this priority**: Without the ability to create teachers, no other teacher-related functionality (listing, assigning as form teacher, etc.) can be exercised. This is the foundational write path for the teachers domain.

**Independent Test**: Can be fully tested by submitting the Add Teacher form with valid data and verifying the teacher appears in the teachers list and that a creation request returns a successful response with HTTP 201.

**Acceptance Scenarios**:

1. **Given** the administrator is on the Add Teacher screen in its empty/initial state, **When** the administrator enters a valid name, subject, email, and contact number and submits the form, **Then** the system records the teacher and the screen shows confirmation that the teacher was added.
2. **Given** the administrator is on the Add Teacher screen, **When** the administrator submits the form with one or more invalid or missing required fields, **Then** the screen shows the corresponding field-level error states and the teacher is not created.
3. **Given** a teacher with the same email already exists in the system, **When** the administrator submits the Add Teacher form with that email, **Then** the system rejects the submission with HTTP `409 Conflict` and shows a meaningful error indicating the email is already in use.

---

### User Story 2 - Retrieve the List of Teachers (Priority: P1)

An administrator navigates to the Teachers screen and sees the complete list of teachers currently registered in the system, with each teacher showing their name, subject, email, and contact number.

**Why this priority**: The list view is the primary way the administrator confirms that registrations succeeded and browses the existing teaching staff. It is the read counterpart to Story 1 and is required for the class-assignment flow.

**Independent Test**: Can be fully tested by navigating to the Teachers screen and verifying that all teachers previously registered are shown with their full information, or that an empty-state view is presented when none exist.

**Acceptance Scenarios**:

1. **Given** one or more teachers are registered in the system, **When** the administrator opens the Teachers screen, **Then** the screen lists every teacher with their name, subject, email, and contact number, in a readable filled state.
2. **Given** no teachers are registered, **When** the administrator opens the Teachers screen, **Then** the screen shows the empty state with a clear prompt indicating that no teachers exist and an entry point to add one.
3. **Given** the Teachers screen is loading data, **When** the request to retrieve teachers fails, **Then** the screen shows a meaningful error message and does not display stale or partial data.

---

### Edge Cases

- What happens when the administrator enters an email that is not a valid email format? — The form must show a field-level email error and reject submission.
- What happens when the administrator enters a contact number with non-numeric characters or the wrong length? — The form must show a field-level contact number error and reject submission. (Per Clarifications, Session 2026-06-21, no leading-digit restriction is enforced — any digit is allowed as the leading character.)
- What happens when the Add Teacher form is submitted with a Subject that is not in the predefined list (unknown, removed, or marked inactive)? — The form must show a field-level Subject error and reject submission with HTTP `400`. On the wire, the lookup is by `subject.ulid` (per `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20 (POST/GET reference object shape)); an unknown or inactive `subject.ulid` triggers the 400.
- What happens when the request body carries a `subject` object whose nested `name` field does not match the row identified by its `ulid` (e.g., `{ ulid: "01H...", name: "Wrong Label" }`)? — The server ignores `subject.name`; only `subject.ulid` is consulted for the lookup. The response echoes the authoritative `name` from the referenced subject row, not the client-supplied value.
- What happens when the same name, subject, and contact number are submitted for a different person? — The system uses email as the unique identifier; submissions with a new email are accepted.
- What happens when the network is unavailable while submitting the Add Teacher form? — The screen must show a meaningful error and the form's input is preserved so the administrator can retry.
- What happens when the teachers list contains a very large number of records? — The screen must remain responsive and present records in a way the administrator can scroll. Stage 1 does not paginate the list (see Clarifications, Session 2026-06-18); the response is expected to remain below the documented upper bound (see Assumptions).
- What happens when the administrator reloads the Teachers screen mid-load? — The screen must show a consistent loading or error state and must not show mixed/stale data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a screen titled "Add Teacher" that exposes input controls for **Name**, **Subject** (a dropdown populated from the predefined, seeded `subjects` reference list — see Clarifications, Session 2026-06-18), **Email**, and **Contact Number**, with the labels, order, and types matching the corresponding Figma design (`./designs/teachers/Add Teacher - Empty State.png` and `./designs/teachers/Add Teacher - Error State.png`).
- **FR-002**: The system MUST require Name, Subject, Email, and Contact Number to be supplied and valid before the Add Teacher form can be submitted successfully.
- **FR-003**: The system MUST validate that the Email field contains a syntactically valid email address.
- **FR-004**: The system MUST validate that the Contact Number field is exactly **8 digits** and contains only numeric characters `0-9`; **no leading-digit restriction** (per Clarifications, Session 2026-06-21). Any other length or non-digit character MUST be rejected with a field-level error on the Contact Number control.
- **FR-005**: The system MUST treat Email as the unique identifier for a teacher; submitting a teacher with an Email that already exists MUST be rejected with HTTP `409 Conflict` and the standard `{ "error": "Email already in use" }` envelope (see Clarifications, Session 2026-06-18). The conflict MUST be enforced by the MySQL `UNIQUE` constraint on `teachers.email`, so the behaviour is race-safe by construction.
- **FR-005a**: The system MUST require the selected **Subject** to reference an **active** entry in the predefined `subjects` reference list. On the wire, `Subject` is a nested object `{ ulid: string, name?: string }` (per `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20 (POST/GET reference object shape)): the route handler resolves `subject.ulid` to `subjects.id` via `uq_subjects_ulid` before insert; the nested `subject.name` is a display hint and is NOT validated against the row identified by `ulid`. Submissions whose `subject.ulid` is missing, unknown, or marked inactive MUST be rejected with a field-level error on the Subject control.
- **FR-006**: The system MUST expose a public API endpoint to create a teacher at `POST /api/v1.0/teachers` (per FR-022, owned by `003-backend-api-db`) that accepts the four fields above (with `subject` expressed as a nested `{ ulid, name }` object per FR-005a and `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20 (POST/GET reference object shape)) and, on success, returns a confirmation response with HTTP status 201. The 201 response body MUST include the newly-created teacher's `ulid` (per FR-014) so the client can store the sync handle without a separate GET. The 201 body MUST echo the `subject` reference as a nested `{ ulid, name }` object on the same shape as the request (round-trip consistency).
- **FR-007**: The system MUST expose a public API endpoint at `GET /api/v1.0/teachers` (per FR-022, owned by `003-backend-api-db`) to list all teachers that, on success, returns the full list of teachers wrapped in a `data` array with HTTP status 200, with each entry containing `name`, `subject` (nested `{ ulid, name }` per FR-005a and `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20 (POST/GET reference object shape)), `email`, `contactNumber`, and `ulid` (per FR-014). The `GET /api/v1.0/subjects` endpoint returns the active `subjects` reference list as `{ name, active, ulid }` entries. Stage 1 does not paginate; the response is the complete set (see Clarifications, Session 2026-06-18).
- **FR-008**: The system MUST provide a screen titled "Teachers" that lists the registered teachers with each entry showing `name`, `subject.name` (resolved from the nested `{ ulid, name }` object on each entry), `email`, and `contactNumber`, in a layout consistent with the Figma design (`./designs/teachers/Teachers - Empty State.png` and `./designs/teachers/Teachers - Filled State.png`).
- **FR-009**: The Teachers screen MUST present an empty state when no teachers are registered, and a filled state when at least one teacher exists, both matching the corresponding Figma design.
- **FR-010**: All API endpoints for this feature MUST, on any error condition, return a JSON response body of the form `{ "error": "Some meaningful error message" }` together with an appropriate HTTP status code. The status-code mapping MUST be: `400 Bad Request` for Joi / payload validation failures (invalid email, bad contact number, missing required field, unknown/inactive `subject.ulid`); `401 Unauthorized` for protected endpoints accessed without a valid session cookie (inherited from `specs/003-backend-api-db/spec.md` FR-013; the auth middleware is owned by `specs/004-user-auth/spec.md` and rejects the request before the handler runs); `409 Conflict` for duplicate email; `415 Unsupported Media Type` for requests whose `Content-Type` is not `application/json`; `500 Internal Server Error` for unhandled server failures; `503 Service Unavailable` when the data store is briefly unreachable.
- **FR-011**: The Add Teacher screen MUST preserve the administrator's input on a failed submission and surface the field-level errors shown in the `Add Teacher - Error State.png` design.
- **FR-012**: Teacher data MUST be persisted so that it survives server restarts and is available to other features (e.g., assigning a teacher as a form teacher for a class).
- **FR-013** (inherited from `003-backend-api-db/spec.md` FR-018 / FR-019 / FR-020 — audit columns): Both the `teachers` and `subjects` tables MUST carry the six-column audit pattern (`id`, `created_at`, `created_by`, `modified_at`, `modified_by`, `version`). `id` is the surrogate primary key on both tables; `teachers.email` and `subjects.name` are preserved as `UNIQUE NOT NULL`; the foreign key column in `teachers` is renamed `subject_id` and references `subjects.id`. The Stage 1 public API responses continue to expose natural-key field names (`teachers.email`, `teachers.subject`, `subjects.name`, `subjects.active`) — none of the audit columns are exposed in the response body.
- **FR-014** (inherited from `003-backend-api-db/spec.md` FR-021 — ULID column): Both the `teachers` and `subjects` tables MUST carry the `ulid CHAR(26) NOT NULL UNIQUE` column (per `003-backend-api-db/spec.md` FR-021). `ulid` is generated server-side via the `ulid` npm package (route handler or typeORM `@BeforeInsert()` hook), carries a `UNIQUE` index per table, is **exposed** in every Stage 1 GET and POST response as the frontend-stable sync handle (the deliberate exception to the FR-020 "audit columns hidden" rule), and is **not** a foreign-key target — joins remain on the surrogate `id` (per FR-019). The Stage 1 public API responses gain a top-level `ulid` field on each teacher and each subject; the natural-key fields (`teachers.email`, `teachers.subject`, `subjects.name`, `subjects.active`) are unchanged.

### Key Entities

- **Teacher**: Represents a teacher registered in the system.
  - `name` (string, required) — the teacher's full name.
  - `subject_id` (foreign key → `subjects.id`, required; the route handler resolves the request body's `subject.ulid` (per FR-005a and `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20 (POST/GET reference object shape)) to `subjects.id` via `uq_subjects_ulid` before insert; the public API exposes the reference as a nested `{ ulid, name }` object on both POST and GET) — the primary subject the teacher teaches, chosen from the predefined `subjects` reference list (see Subject entity below).
  - `email` (string, required, `UNIQUE NOT NULL`) — the teacher's contact email; serves as the domain-natural unique identifier across the system. The column was previously the primary key; it is now `UNIQUE NOT NULL` (per `003-backend-api-db/spec.md` FR-018).
  - `contactNumber` (string, required) — the teacher's contact phone number, validated as exactly 8 digits, digits-only, with no leading-digit restriction (per Clarifications, Session 2026-06-21).
  - `ulid` (string, required, `UNIQUE`) — the frontend-stable sync handle (per FR-014 / `003-backend-api-db/spec.md` FR-021); exposed in the Stage 1 `GET /api/v1.0/teachers` and `POST /api/v1.0/teachers` responses as a top-level field on each record.
  - Inherits the six audit columns from FR-018: `id` (surrogate PK), `created_at`, `created_by`, `modified_at`, `modified_by`, `version`.
  - Relationships: a teacher may be the form teacher of zero or one class (this relationship is owned and constrained by the Classes feature, not enforced inside the Teachers feature).

- **Subject** (reference table, seeded in Stage 1; admin-managed in a later stage):
  - `name` (string, required, `UNIQUE NOT NULL`) — display name of the subject as it appears in the Add Teacher dropdown (e.g., "English", "Mathematics", "Science"). The column was previously the primary key; it is now `UNIQUE NOT NULL` (per `003-backend-api-db/spec.md` FR-018).
  - `active` (boolean, default `true`) — whether the subject is currently selectable in the Add Teacher form. Stage 1 treats this list as read-only and seeds it; admin authoring of subjects is out of Stage 1 scope (see Assumptions).
  - `ulid` (string, required, `UNIQUE`) — the frontend-stable sync handle (per FR-014 / `003-backend-api-db/spec.md` FR-021); exposed in the `GET /api/subjects` response as a top-level field on each record.
  - Inherits the six audit columns from FR-018: `id` (surrogate PK), `created_at`, `created_by`, `modified_at`, `modified_by`, `version`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can register a new teacher and see the teacher appear in the Teachers list in under 30 seconds of form time, with no page reload required beyond standard navigation.
- **SC-002**: 100% of successful Add Teacher submissions result in a teacher record that is persisted and visible on the Teachers screen after a full page refresh.
- **SC-003**: 100% of Add Teacher submissions with an invalid email format, an invalid contact number, or a duplicate email are rejected with a field-level or form-level error message that matches the Figma error-state design.
- **SC-004**: The Teachers screen presents the empty state on first load (zero teachers) and the filled state immediately after the first successful registration, with no stale or empty data shown.
- **SC-005**: 100% of API errors (validation, conflict, content-type, server, data store) for the teachers endpoints are returned with the agreed JSON error envelope (`{ "error": "..." }`) and the correct HTTP status code (`400` for validation, `409` for duplicate email, `415` for non-JSON content type, `500` for unhandled server failures, `503` when the data store is briefly unreachable), so they can be consumed by automated test tools.
- **SC-006**: 100% of GET and POST API responses for teachers expose the `subject` field as a nested `{ ulid: string, name: string }` object on every entry. The `ulid` value matches the `ulid` column of the referenced subject row in `subjects`. The POST request body uses the same nested shape with `ulid` required (26-character Crockford Base32) and `name` optional; the server uses `ulid` for the lookup (against `uq_subjects_ulid`) and ignores `name` (per `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20 (POST/GET reference object shape)).

## Assumptions

- The administrator accesses the application on a modern desktop browser; mobile/responsive support is not required for the Teachers feature in v1.
- Email is the chosen unique identifier for a teacher; the system does not generate internal surrogate IDs that are exposed to the UI for this feature.
- The Add Teacher form's field types (e.g., text input, numeric input, validation rules) follow the Figma designs in `./designs/teachers/`. If the Figma design is later updated, the spec will be amended accordingly.
- The Filled State design referenced in the requirements (`./designs/teachers/Teachers - Filled State.png`) is provided by the design team; until it is available, the Filled State is implemented to mirror the data shape shown in the Filled State for the Classes screen.
- Persistence layer, API framework, and frontend library are not constrained by this spec; they are decided in `plan.md` (see `.specify/memory/constitution.md` for the project's technical stack constraints).
- role-based access control are explicitly out of scope per the requirements.
- The `subjects` reference list is seeded in Stage 1 and treated as read-only by the Teachers feature; an admin UI or API to author new subjects is out of Stage 1 scope (see Clarifications, Session 2026-06-18).
- Stage 1 assumes a realistic upper bound of **≤ 500 teachers** for the system. The GET endpoint returns the full list in a single response (no pagination); if the school outgrows this bound, pagination is added in a future stage as an amendment to FR-007 (see Clarifications, Session 2026-06-18).
