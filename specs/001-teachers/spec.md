# Feature Specification: Teachers

**Feature Branch**: `001-teachers`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "Please help to create 3 feature specifications. 1 for teachers, 2 Classes, 3 Backend api and DB manipulations. Please refer to the .requirements/Full Stack Assignment.md file for teachers and Classes behaviors. you may capture the all data fields from the UI for DB table models. UI must be matched on the designs provided."

## Clarifications

### Session 2026-06-18

- Q: Subject field type — free-text or predefined list? → A: Predefined list (extensible). Stage 1 ships with a seeded set of subjects, the Add Teacher form selects **Subject** from a dropdown populated by that list, and the value is persisted as a foreign key to a `subjects` reference table. Adding or editing subjects is deferred to a later stage (admin UI for the `subjects` reference table) and is explicitly out of Stage 1 scope.
- Q: Contact number format and length? → A: 8-digit Singapore number, digits only, must start with `8` or `9` (e.g., `91234567`). The Figma design referenced in FR-004 is not accessible, so the format is pinned here so the Joi schema, typeORM column, regex, and unit tests share one source of truth.
- Q: HTTP status when a duplicate email is submitted, including races? → A: `409 Conflict`, sourced from the MySQL `UNIQUE` constraint violation. Joi still rejects malformed payloads with `400`. The route handler must translate the typeORM unique-constraint error into the standard `{ "error": "Email already in use" }` envelope with `409`. This is race-safe by construction — two simultaneous submissions with the same email cannot both succeed.
- Q: Pagination for the teachers list? → A: No pagination in Stage 1. The GET endpoint returns the full list of teachers in a single `{ "data": [...] }` response. The Stage 1 upper bound is ≤ 500 teachers (see Assumptions); pagination is a future-stage amendment if the school outgrows that bound.
- Q: API response-time target? → A: No new API-level target in Stage 1. The existing end-to-end `SC-001` (≤ 30 s from form submit to teacher visible in the list) is the only performance criterion for this spec. Adding a p95 latency target is deferred to a future stage if it becomes necessary; YAGNI per Principle V (Simplicity).
- Q: Cross-cutting `415` + `503` status codes (propagated from `003-backend-api-db`)? → A: Accepted. The status-code table for this spec is updated to `400` (validation) / `409` (duplicate email) / `415` (request `Content-Type` is not `application/json`) / `500` (unhandled server failure) / `503` (data store briefly unreachable). Aligns with `003-backend-api-db/spec.md` Clarifications, Session 2026-06-18.

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
- What happens when the administrator enters a contact number with non-numeric characters, the wrong length, or a leading digit other than `8`/`9`? — The form must show a field-level contact number error and reject submission.
- What happens when the Add Teacher form is submitted with a Subject that is not in the predefined list (unknown, removed, or marked inactive)? — The form must show a field-level Subject error and reject submission with HTTP `400`.
- What happens when the same name, subject, and contact number are submitted for a different person? — The system uses email as the unique identifier; submissions with a new email are accepted.
- What happens when the network is unavailable while submitting the Add Teacher form? — The screen must show a meaningful error and the form's input is preserved so the administrator can retry.
- What happens when the teachers list contains a very large number of records? — The screen must remain responsive and present records in a way the administrator can scroll. Stage 1 does not paginate the list (see Clarifications, Session 2026-06-18); the response is expected to remain below the documented upper bound (see Assumptions).
- What happens when the administrator reloads the Teachers screen mid-load? — The screen must show a consistent loading or error state and must not show mixed/stale data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a screen titled "Add Teacher" that exposes input controls for **Name**, **Subject** (a dropdown populated from the predefined, seeded `subjects` reference list — see Clarifications, Session 2026-06-18), **Email**, and **Contact Number**, with the labels, order, and types matching the corresponding Figma design (`./designs/teachers/Add Teacher - Empty State.png` and `./designs/teachers/Add Teacher - Error State.png`).
- **FR-002**: The system MUST require Name, Subject, Email, and Contact Number to be supplied and valid before the Add Teacher form can be submitted successfully.
- **FR-003**: The system MUST validate that the Email field contains a syntactically valid email address.
- **FR-004**: The system MUST validate that the Contact Number field is exactly **8 digits**, contains only numeric characters `0-9`, and **starts with `8` or `9`** (Singapore mobile format, e.g., `91234567`). Any other length, non-digit character, or invalid leading digit MUST be rejected with a field-level error on the Contact Number control.
- **FR-005**: The system MUST treat Email as the unique identifier for a teacher; submitting a teacher with an Email that already exists MUST be rejected with HTTP `409 Conflict` and the standard `{ "error": "Email already in use" }` envelope (see Clarifications, Session 2026-06-18). The conflict MUST be enforced by the MySQL `UNIQUE` constraint on `teachers.email`, so the behaviour is race-safe by construction.
- **FR-005a**: The system MUST require the selected **Subject** to reference an **active** entry in the predefined `subjects` reference list; submissions with a subject that is missing, unknown, or marked inactive MUST be rejected with a field-level error on the Subject control.
- **FR-006**: The system MUST expose a public API endpoint to create a teacher that accepts the four fields above and, on success, returns a confirmation response with HTTP status 201.
- **FR-007**: The system MUST expose a public API endpoint to list all teachers that, on success, returns the full list of teachers wrapped in a `data` array with HTTP status 200, with each entry containing `name`, `subject`, `email`, and `contactNumber`. Stage 1 does not paginate; the response is the complete set (see Clarifications, Session 2026-06-18).
- **FR-008**: The system MUST provide a screen titled "Teachers" that lists the registered teachers with each entry showing `name`, `subject`, `email`, and `contactNumber`, in a layout consistent with the Figma design (`./designs/teachers/Teachers - Empty State.png` and `./designs/teachers/Teachers - Filled State.png`).
- **FR-009**: The Teachers screen MUST present an empty state when no teachers are registered, and a filled state when at least one teacher exists, both matching the corresponding Figma design.
- **FR-010**: All API endpoints for this feature MUST, on any error condition, return a JSON response body of the form `{ "error": "Some meaningful error message" }` together with an appropriate HTTP status code. The status-code mapping MUST be: `400 Bad Request` for Joi / payload validation failures (invalid email, bad contact number, missing required field, unknown/inactive subject); `409 Conflict` for duplicate email; `415 Unsupported Media Type` for requests whose `Content-Type` is not `application/json`; `500 Internal Server Error` for unhandled server failures; `503 Service Unavailable` when the data store is briefly unreachable.
- **FR-011**: The Add Teacher screen MUST preserve the administrator's input on a failed submission and surface the field-level errors shown in the `Add Teacher - Error State.png` design.
- **FR-012**: Teacher data MUST be persisted so that it survives server restarts and is available to other features (e.g., assigning a teacher as a form teacher for a class).

### Key Entities

- **Teacher**: Represents a teacher registered in the system.
  - `name` (string, required) — the teacher's full name.
  - `subject` (string, required, references `Subject.name`) — the primary subject the teacher teaches, chosen from the predefined `subjects` reference list (see Subject entity below).
  - `email` (string, required, unique) — the teacher's contact email; serves as the unique identifier across the system.
  - `contactNumber` (string, required) — the teacher's contact phone number, validated as exactly 8 digits starting with `8` or `9` (Singapore mobile format; see Clarifications, Session 2026-06-18).
  - Relationships: a teacher may be the form teacher of zero or one class (this relationship is owned and constrained by the Classes feature, not enforced inside the Teachers feature).

- **Subject** (reference table, seeded in Stage 1; admin-managed in a later stage):
  - `name` (string, required, unique) — display name of the subject as it appears in the Add Teacher dropdown (e.g., "English", "Mathematics", "Science").
  - `active` (boolean, default `true`) — whether the subject is currently selectable in the Add Teacher form. Stage 1 treats this list as read-only and seeds it; admin authoring of subjects is out of Stage 1 scope (see Assumptions).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can register a new teacher and see the teacher appear in the Teachers list in under 30 seconds of form time, with no page reload required beyond standard navigation.
- **SC-002**: 100% of successful Add Teacher submissions result in a teacher record that is persisted and visible on the Teachers screen after a full page refresh.
- **SC-003**: 100% of Add Teacher submissions with an invalid email format, an invalid contact number, or a duplicate email are rejected with a field-level or form-level error message that matches the Figma error-state design.
- **SC-004**: The Teachers screen presents the empty state on first load (zero teachers) and the filled state immediately after the first successful registration, with no stale or empty data shown.
- **SC-005**: 100% of API errors (validation, conflict, content-type, server, data store) for the teachers endpoints are returned with the agreed JSON error envelope (`{ "error": "..." }`) and the correct HTTP status code (`400` for validation, `409` for duplicate email, `415` for non-JSON content type, `500` for unhandled server failures, `503` when the data store is briefly unreachable), so they can be consumed by automated test tools.

## Assumptions

- The administrator accesses the application on a modern desktop browser; mobile/responsive support is not required for the Teachers feature in v1.
- Email is the chosen unique identifier for a teacher; the system does not generate internal surrogate IDs that are exposed to the UI for this feature.
- The Add Teacher form's field types (e.g., text input, numeric input, validation rules) follow the Figma designs in `./designs/teachers/`. If the Figma design is later updated, the spec will be amended accordingly.
- The Filled State design referenced in the requirements (`./designs/teachers/Teachers - Filled State.png`) is provided by the design team; until it is available, the Filled State is implemented to mirror the data shape shown in the Filled State for the Classes screen.
- Persistence layer, API framework, and frontend library are not constrained by this spec; they are decided in `plan.md` (see `.specify/memory/constitution.md` for the project's technical stack constraints).
- Login, authentication, and role-based access control are explicitly out of scope per the requirements ("you do not need to implement login and access control").
- The `subjects` reference list is seeded in Stage 1 and treated as read-only by the Teachers feature; an admin UI or API to author new subjects is out of Stage 1 scope (see Clarifications, Session 2026-06-18).
- Stage 1 assumes a realistic upper bound of **≤ 500 teachers** for the system. The GET endpoint returns the full list in a single response (no pagination); if the school outgrows this bound, pagination is added in a future stage as an amendment to FR-007 (see Clarifications, Session 2026-06-18).
