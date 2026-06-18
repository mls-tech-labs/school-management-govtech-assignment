# Feature Specification: Classes

**Feature Branch**: `002-classes`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "create the classes feature"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a New Class with a Form Teacher (Priority: P1)

An administrator creates a new class by completing an "Add Class" form with the class's level (e.g., "Primary 1"), class name (e.g., "Class 1A"), and the email of an existing teacher who will serve as the class's form teacher, then submits the form. The system creates the class, links it to the chosen teacher, and confirms the new record was created.

**Why this priority**: A class cannot exist without a form teacher, and listing classes depends on the ability to create them. This is the foundational write path for the classes domain and the only way to exercise the teacher-as-form-teacher relationship that is central to the application's purpose.

**Independent Test**: Can be fully tested by submitting the Add Class form with a valid level, name, and the email of an existing teacher, then verifying that the class appears in the Classes list with the correct level, name, and form teacher name, and that a creation request returns a successful response with HTTP 201.

**Acceptance Scenarios**:

1. **Given** the administrator is on the Add Class screen in its empty/initial state, **When** the administrator enters a valid level, class name, and the email of an existing teacher, and submits the form, **Then** the system records the class, associates the teacher as its form teacher, and the screen confirms the class was added.
2. **Given** the administrator is on the Add Class screen, **When** the administrator submits the form with one or more invalid or missing required fields (level, name, or teacher email), **Then** the screen shows the corresponding field-level error states and the class is not created.
3. **Given** a teacher with the supplied `teacherEmail` does not exist in the system, **When** the administrator submits the Add Class form, **Then** the system rejects the submission and shows a meaningful error indicating that the teacher could not be found.
4. **Given** the teacher identified by `teacherEmail` is already the form teacher of another class, **When** the administrator submits the Add Class form for that same teacher, **Then** the system rejects the submission and shows a meaningful error indicating that the teacher is already assigned as a form teacher.

---

### User Story 2 - Retrieve the List of Classes (Priority: P1)

An administrator navigates to the Classes screen and sees the complete list of classes currently registered in the system, with each class showing its level, name, and the name of its form teacher.

**Why this priority**: The list view is the primary way the administrator confirms class creation succeeded and browses the existing classes. It is the read counterpart to Story 1 and surfaces the form-teacher relationship in a way the administrator can audit at a glance.

**Independent Test**: Can be fully tested by navigating to the Classes screen and verifying that all classes previously created are shown with their level, name, and form teacher name, or that an empty-state view is presented when no classes exist.

**Acceptance Scenarios**:

1. **Given** one or more classes are registered in the system, **When** the administrator opens the Classes screen, **Then** the screen lists every class with its level, name, and form teacher name, in a readable filled state.
2. **Given** no classes are registered, **When** the administrator opens the Classes screen, **Then** the screen shows the empty state with a clear prompt indicating that no classes exist and an entry point to add one.
3. **Given** the Classes screen is loading data, **When** the request to retrieve classes fails, **Then** the screen shows a meaningful error message and does not display stale or partial data.

---

### Edge Cases

- What happens when the administrator enters a `teacherEmail` that is not a valid email format? — The form must show a field-level email error and reject submission.
- What happens when the administrator enters a `teacherEmail` that exists in the system but the teacher has been deleted before the request is processed? — The system must treat this as a "teacher not found" condition and reject submission with a meaningful error.
- What happens when two administrators submit the Add Class form for the same teacher at the same time? — The system must accept at most one of the submissions and reject the other with the "teacher already assigned" error, so the uniqueness invariant on form teacher is preserved.
- What happens when a teacher is deleted (or otherwise no longer available) after a class was created with that teacher as the form teacher? — This scenario is out of scope for v1; the class keeps the form teacher reference as it was at creation time.
- What happens when the network is unavailable while submitting the Add Class form? — The screen must show a meaningful error and the form's input is preserved so the administrator can retry.
- What happens when the administrator reloads the Classes screen mid-load? — The screen must show a consistent loading or error state and must not show mixed or stale data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a screen titled "Add Class" that exposes input controls for **Level**, **Name**, and **Teacher Email**, with the labels, order, and field types matching the Figma design (`./designs/classes/Add Class - Empty State.png` and `./designs/classes/Fields.png`).
- **FR-002**: The system MUST require Level, Name, and Teacher Email to be supplied and valid before the Add Class form can be submitted successfully.
- **FR-003**: The system MUST validate that the Teacher Email field contains a syntactically valid email address.
- **FR-004**: The system MUST treat the Teacher Email as a reference to an existing teacher registered in the system (see the Teachers feature); the system MUST reject the submission with a meaningful error if no teacher with that email exists.
- **FR-005**: The system MUST enforce the invariant that a teacher can be the form teacher of **at most one** class. Submitting a class whose `teacherEmail` is already the form teacher of another class MUST be rejected with a meaningful error.
- **FR-006**: The system MUST expose a public API endpoint to create a class that accepts `level`, `name`, and `teacherEmail` in the request body, and, on success, returns a confirmation response with HTTP status 201.
- **FR-007**: The system MUST expose a public API endpoint to list all classes that, on success, returns the classes wrapped in a `data` array with HTTP status 200, with each entry containing `level`, `name`, and `formTeacher.name` (the form teacher's name).
- **FR-008**: The system MUST provide a screen titled "Classes" that lists the registered classes with each entry showing `level`, `name`, and `formTeacher.name`, in a layout consistent with the Figma design (`./designs/classes/Classes - Empty State.png` and `./designs/classes/Classes - Filled State.png`).
- **FR-009**: The Classes screen MUST present an empty state when no classes are registered, and a filled state when at least one class exists, both matching the corresponding Figma design.
- **FR-010**: All API endpoints for this feature MUST, on any error condition, return a JSON response body of the form `{ "error": "Some meaningful error message" }` together with an appropriate HTTP status code (e.g., 400 for client validation failures, 404 for a non-existent teacher, 409 for the "teacher already assigned" conflict).
- **FR-011**: The Add Class screen MUST preserve the administrator's input on a failed submission and surface the field-level errors shown in the Figma error state.
- **FR-012**: Class data and the form-teacher relationship MUST be persisted so that they survive server restarts and remain consistent with the Teachers feature (i.e., a class's form teacher is always an existing teacher).

### Key Entities

- **Class**: Represents a class registered in the system.
  - `level` (string, required) — the educational level of the class (e.g., "Primary 1"); the allowed values are determined by the Figma design and the operating context of the private education business.
  - `name` (string, required) — the class's display name (e.g., "Class 1A"); the format is determined by the Figma design.
  - `formTeacher` (reference to a Teacher, required) — the teacher who serves as the form teacher of the class.
    - On the wire / in the UI, the class is identified to its form teacher by the form teacher's `email` (per the API request shape in the requirements file: `teacherEmail`).
    - The system stores the reference as the form teacher's unique identifier (email) so that the form-teacher name can be resolved for display.
  - Relationships: a Class references exactly one Teacher via the form-teacher relationship. A Teacher may be the form teacher of zero or one Class (see FR-005).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can create a new class and see the class appear in the Classes list in under 30 seconds of form time, with no page reload required beyond standard navigation.
- **SC-002**: 100% of successful Add Class submissions result in a class record that is persisted and visible on the Classes screen after a full page refresh, with the correct form teacher name displayed.
- **SC-003**: 100% of Add Class submissions with an invalid email format, an unknown `teacherEmail`, or a `teacherEmail` already assigned to another class as form teacher are rejected with a field-level or form-level error message.
- **SC-004**: The invariant "a teacher can be the form teacher of at most one class" holds for 100% of class records in the system at all times, including under concurrent submissions.
- **SC-005**: The Classes screen presents the empty state on first load (zero classes) and the filled state immediately after the first successful creation, with no stale or empty data shown.
- **SC-006**: 100% of API errors (validation, not-found, conflict, server) for the classes endpoints are returned with the agreed JSON error envelope (`{ "error": "..." }`) and an appropriate HTTP status code, so they can be consumed by automated test tools.

## Assumptions

- The administrator accesses the application on a modern desktop browser; mobile/responsive support is not required for the Classes feature in v1.
- The Teachers feature (see `specs/001-teachers/spec.md`) is in place before this feature is implemented; the Add Class form's `teacherEmail` field is validated against the existing teacher records. If the Teachers feature is not yet present, an equivalent minimal teacher record set (e.g., a fixture) is required for testing.
- The Add Class form's field types (e.g., text input, dropdown, validation rules) follow the Figma designs in `./designs/classes/`. The "Fields" design asset is treated as the authoritative reference for field types and validation cues.
- The list of allowed `level` values is provided by the Figma design (e.g., "Primary 1", "Primary 2", ...). If the design does not enumerate the levels, the system accepts the levels shown in the Filled State of the Classes screen and rejects any other value with a field-level error.
- The `name` of a class is unique within the system; submitting a class whose name is already in use is rejected with a meaningful error. (The requirements file does not state this explicitly; it is treated as a reasonable default for an admin tool and is captured here so it can be amended if the Figma design or business rules say otherwise.)
- The Classes feature does not edit or delete classes in v1; create and list are the only two operations. Edit/delete are out of scope until a future feature amends this spec.
- Login, authentication, and role-based access control are explicitly out of scope per the requirements ("you do not need to implement login and access control").
