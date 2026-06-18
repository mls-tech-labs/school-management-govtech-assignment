# Feature Specification: Backend APIs and DB Schema

**Feature Branch**: `003-backend-api-db`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "create the backend apis and db schema feature"

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
  email, duplicate form teacher, missing teacher, duplicate
  level+name)? — The endpoint MUST map the violation to the agreed
  status code (see FR-009) and a meaningful error message.
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

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist teachers and classes in a relational
  data store that survives process restarts and supports the integrity
  rules in FR-006..FR-009.
- **FR-002**: The system MUST expose a public API surface for the
  Teachers feature with at least the following endpoints, each of which
  conforms to the cross-cutting contract in FR-010..FR-015:
  - `POST /api/teachers` — create a teacher; success returns HTTP
    `201 Created`.
  - `GET /api/teachers` — list all teachers; success returns HTTP
    `200 OK` with `{ "data": [ ...teachers ] }`.
- **FR-003**: The system MUST expose a public API surface for the
  Classes feature with at least the following endpoints, each of which
  conforms to the cross-cutting contract in FR-010..FR-015:
  - `POST /api/classes` — create a class; success returns HTTP
    `201 Created`.
  - `GET /api/classes` — list all classes; success returns HTTP
    `200 OK` with `{ "data": [ ...classes ] }`. Each entry includes
    `level`, `name`, and `formTeacher.name` (the form teacher's name
    resolved from the referenced teacher record).
- **FR-004**: The system MUST store the following attributes for each
  **teacher** record, with the constraints listed:
  - `name` (string, required, non-empty).
  - `subject` (string, required, non-empty).
  - `email` (string, required, must be a syntactically valid email
    address, **unique across all teacher records**).
  - `contactNumber` (string, required, digits only, length/format as
    defined in the Figma design for the Add Teacher screen).
- **FR-005**: The system MUST store the following attributes for each
  **class** record, with the constraints listed:
  - `level` (string, required, non-empty, drawn from the allowed
    levels shown in the Figma design).
  - `name` (string, required, non-empty).
  - `formTeacherEmail` (string, required, must be a syntactically valid
    email address, **must reference an existing teacher's `email`**, and
    **must be unique across all class records** — a teacher can be the
    form teacher of at most one class).
  - The combination of `level` and `name` MUST be unique across all
    class records.
- **FR-006**: The system MUST enforce `email` uniqueness on the
  `teachers` data at the data layer, so that even direct writes that
  bypass the API cannot create two teachers with the same email.
- **FR-007**: The system MUST enforce that a `class.formTeacherEmail`
  refers to an existing `teacher.email` (referential integrity), so
  that a class cannot exist without a corresponding teacher record.
- **FR-008**: The system MUST enforce `formTeacherEmail` uniqueness on
  the `classes` data at the data layer, so that even direct writes
  that bypass the API cannot assign the same teacher as the form
  teacher of two different classes.
- **FR-009**: The system MUST enforce uniqueness of the `(level, name)`
  pair on the `classes` data at the data layer, so that even direct
  writes that bypass the API cannot create two classes with the same
  level and name.
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
    violated: duplicate teacher email, duplicate form teacher, or
    duplicate `(level, name)` pair on a class.
  - `415 Unsupported Media Type` — request `Content-Type` is not
    `application/json`.
  - `500 Internal Server Error` — unexpected server-side failure.
  - `503 Service Unavailable` — the data store is briefly unreachable.
- **FR-014**: All API writes MUST be atomic: a request that fails MUST
  NOT leave partial data in the data store.
- **FR-015**: All error messages in the agreed envelope MUST be
  meaningful to the administrator or to the calling code, and MUST NOT
  leak internal details (stack traces, connection strings, file paths,
  raw SQL, etc.) in production.
- **FR-016**: The data store schema MUST be created and updated through
  a repeatable, versioned migration process so that the schema can be
  recreated from scratch and upgraded incrementally.

### Key Entities

- **Teacher** (data store table: `teachers`).
  - `name` (string, required).
  - `subject` (string, required).
  - `email` (string, required, unique).
  - `contactNumber` (string, required).
  - Internal persistence identifier (a value the system uses for joins
    and bookkeeping; not exposed in the public API for v1).
  - Integrity rules: `email` is unique. The system MUST NOT allow a
    second teacher with the same `email` to be inserted.

- **Class** (data store table: `classes`).
  - `level` (string, required).
  - `name` (string, required).
  - `formTeacherEmail` (string, required, foreign key → `teachers.email`).
  - Internal persistence identifier (a value the system uses for joins
    and bookkeeping; not exposed in the public API for v1).
  - Integrity rules: `(level, name)` is unique;
    `formTeacherEmail` is unique; `formTeacherEmail` references an
    existing `teachers.email`; a teacher can be the form teacher of at
    most one class.

- **Relationship**: each class references exactly one teacher via
  `formTeacherEmail`; each teacher may be referenced by zero or one
  class. This relationship is owned by the `classes` table (the
  foreign-key column lives on the class side) and is what makes the
  form-teacher invariant enforceable at the data layer.

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
- Migrations are part of the application source tree and are run as
  part of the application's normal startup or as a documented
  one-off command; the exact mechanism is decided in `plan.md`.
- All endpoints are read or write operations on the two entities
  above. There are no additional endpoints (e.g., health checks,
  metrics, administrative endpoints) in scope for v1. Health checks
  MAY be added later as a separate feature.
