---
description: "Task list for Stage 3 UPDATE / DELETE mutations on Teachers and Classes"
---

# Tasks: Teachers & Classes — UPDATE / DELETE Mutations (006)

**Input**: Design documents from `/specs/006-teachers-classes-mutations/`
- [spec.md](./spec.md) (required — 4 user stories, all P1)
- [plan.md](./plan.md) (required — locked stack: Next.js 15 + typeORM + MySQL + Joi + antd + Tailwind + Redis + Vitest)
- [research.md](./research.md) (required — 11 design decisions; see "Cross-references" sections)
- [data-model.md](./data-model.md) (required — no new entities; 5 new repository methods)
- [contracts/teachers.yaml](./contracts/teachers.yaml) (required — 3 new endpoints on `/api/v1.0/teachers/[ulid]`)
- [contracts/classes.yaml](./contracts/classes.yaml) (required — 3 new endpoints on `/api/v1.0/classes/[ulid]`)
- [quickstart.md](./quickstart.md) (required — 10 validation scenarios)

**Tests**: Constitution Principle III requires unit tests for all domain logic; the plan's Test Strategy (see [plan.md Technical Context](./plan.md)) specifies three Vitest tiers (unit, contract, integration). Test tasks are **mandatory** for this feature.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. All four stories are P1 (priority: high), so the phases are emitted in spec order (US1 → US2 → US3 → US4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

This is a single Next.js web application (one process, per Constitution). The codebase follows the conventions in [plan.md §"Project Structure"](./plan.md#project-structure):

- API route handlers: `app/api/v1.0/{teachers,classes}/[ulid]/route.ts`
- React Server Component pages: `app/(authed)/{teachers,classes}/[ulid]/edit/page.tsx`
- Client components: `app/(authed)/{teachers,classes}/_components/`
- Repository / handler logic: `lib/api/{teachers,classes}/`
- Joi schemas: `lib/validation/`
- Shared hooks: `lib/hooks/`
- Unit tests: `tests/unit/{teachers,classes}/`
- Contract tests: `tests/contract/`
- Integration tests: `tests/integration/`

---

## Phase 1: Setup (Cross-Feature Foundations)

**Purpose**: Two cross-feature amendments that must land **before** any 006 user story work begins. These changes touch files in `001-teachers` (the contact-number rule restoration) and the cross-cutting `lib/validation/` tree (the new shared contact-number module). They are not user-story work — they are pre-requisite for Stages 1 + 3 alignment on the Singapore `^[89]\d{7}$` regex.

- [ ] T001 Create shared Singapore contact-number module in `lib/validation/contact-number.ts` exporting `SINGAPORE_CONTACT_NUMBER_REGEX`, `SINGAPORE_CONTACT_NUMBER_MESSAGE`, and `singaporeContactNumberSchema` (per [research.md §6.7](./research.md#67-singapore-contact-number-rule-restoration) and 006 spec FR-013)
- [ ] T002 [P] Update `lib/validation/teacher.ts` in `001-teachers` to import `singaporeContactNumberSchema` and replace the inline `Joi.string().pattern(/^\d{8}$/)` (the relaxed pattern from 001-teachers Clarifications Session 2026-06-21) with the shared Singapore regex `^[89]\d{7}$`
- [ ] T003 [P] Update `lib/validation/teacher.spec.ts` in `001-teachers` to cover the leading-digit rejection path on the POST-Teacher schema (values starting with `0`–`7` and `10`–`99` are rejected with `400 Bad Request` and the message `Contact number must start with 8 or 9 and be 8 digits.`) — per SC-005
- [ ] T004 Verify the `UNIQUE INDEX uq_classes_form_teacher_id` on `classes.form_teacher_id` exists in the user-prepared MySQL container and is the data-layer backstop for Principle X.1 (the DELETE-Teacher 409 form-teacher referential integrity check); if the index is absent, add a one-line `ALTER TABLE classes ADD UNIQUE INDEX uq_classes_form_teacher_id (form_teacher_id);` to the user's prepared SQL — no application-side migration is added (per FR-016 cross-cutting rule)

**Checkpoint**: contact-number regex restored to `^[89]\d{7}$` on the 001 POST path; the form-teacher UNIQUE index confirmed. The 006 user story work can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented. All four user stories (US1..US4) depend on the artifacts produced in this phase: the new Joi schemas, the new repository methods, the two new single-resource GET route handlers (the v2.6.0 data source for the Edit pages), the shared `RowActionsMenu` component, the shared `use-edit-submit` hook, and the test scaffolding (Vitest config for the new test files).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T005 [P] Add `findTeacherByUlid(ulid: string)` (returns the teacher row in the GET-list wire shape, or `null` if not found) to `lib/api/teachers/repository.ts` — shared by the new GET `/api/v1.0/teachers/[ulid]` handler, the Edit Teacher RSC page, and the PUT/DELETE handlers' pre-write lookups (per [data-model.md §7](./data-model.md#7-new-repository-methods-summary))
- [ ] T006 [P] Add `updateTeacherAndReturnPreviousModifiedAt(id, changes)` (wraps the update in a transaction; returns `{ teacher, previousModifiedAt }`) to `lib/api/teachers/repository.ts` — used by the PUT handler to capture the pre-write `modified_at` for the `previousModifiedAt` response field (per [data-model.md §5](./data-model.md#5-the-previousmodifiedat-field-on-the-put-200-response))
- [ ] T007 [P] Add `findClassByUlid(ulid: string)` to `lib/api/classes/repository.ts` — shared by the new GET `/api/v1.0/classes/[ulid]` handler, the Edit Class RSC page, and the PUT/DELETE handlers' pre-write lookups
- [ ] T008 [P] Add `findClassByFormTeacherId(formTeacherId: string)` (returns `{ id, ulid, name } | null`; uses the `UNIQUE INDEX uq_classes_form_teacher_id` for an `O(log n)` lookup; returns 0 or 1 rows) to `lib/api/classes/repository.ts` — used by the DELETE-Teacher 409 form-teacher guard (per [data-model.md §4](./data-model.md#4-the-form-teacher-guard-delete-teacher-fr-009) and FR-009)
- [ ] T009 [P] Add `updateClassAndReturnPreviousModifiedAt(id, changes)` to `lib/api/classes/repository.ts` — used by the PUT-Class handler to capture the pre-write `modified_at` for the `previousModifiedAt` response field
- [ ] T010 [P] Add `buildPutTeacherSchema()` and `deleteTeacherSchema = Joi.object({}).min(0).max(0)` to `lib/validation/teacher.ts` (full-resource PUT mirror of the POST shape; empty-body DELETE that still runs validation per Principle VII; Singapore `^[89]\d{7}$` regex on `contactNumber`; row-exclusion self-match rule on `email` per FR-007) — per [data-model.md §2](./data-model.md#2-existing-table-impact-teachers-from-001-teachers)
- [ ] T011 [P] Add `buildPutClassSchema()` and `deleteClassSchema = Joi.object({}).min(0).max(0)` to `lib/validation/class.ts` (full-resource PUT mirror; row-exclusion self-match rules on `name` and `formTeacher` so a class updating to the same form teacher or name it already has is permitted; collisions with a DIFFERENT class are rejected with 409 per FR-008)
- [ ] T012 [P] Add `validateUlidPathParam` helper export to `lib/validation/ulid.ts` (a `Joi.string().length(26).pattern(/^[0-9A-HJKMNP-TV-Z]{26}$/).required()` schema for the `[ulid]` path parameter on every new endpoint)
- [ ] T013 [P] Create the new single-resource GET route handler skeleton `app/api/v1.0/teachers/[ulid]/route.ts` exposing `GET` only (the `PUT` and `DELETE` are added in the US1 / US2 phases); the GET handler calls `findTeacherByUlid` and returns 200 with the teacher in the GET-list wire shape, or 404 with `{ "error": "Teacher not found" }` (per FR-002 / the constitution v2.6.0 amendment and [research.md §6.2](./research.md#62-single-resource-get-endpoints-v260-amendment))
- [ ] T014 [P] Create the new single-resource GET route handler skeleton `app/api/v1.0/classes/[ulid]/route.ts` exposing `GET` only (the `PUT` and `DELETE` are added in the US3 / US4 phases); the GET handler calls `findClassByUlid` and returns 200 with the class in the GET-list wire shape, or 404 with `{ "error": "Class not found" }` (per FR-003)
- [ ] T014a — Update lib/api/response.ts to support optional details field on the error envelope
- [ ] T015 Create shared `RowActionsMenu` client component at `app/(authed)/teachers/_components/RowActionsMenu.tsx` — composed from `antd` `Dropdown`, takes `{ ulid, name, resource: 'teacher' | 'class', onDeleted }` as typed props; **reused by both** the Teachers and Classes lists (per [research.md §6.5](./research.md#65-reusable-row-actions-menu)); the per-row `...` button has `aria-label="Row actions"` (mouse-only; keyboard accessibility deferred per Clarifications Q4)
- [ ] T016 Create shared `use-edit-submit` hook at `lib/hooks/use-edit-submit.ts` — wraps the PUT call, captures the form-load `modifiedAt`, compares it to the `previousModifiedAt` field in the PUT 200 response, and fires the non-blocking antd warning notification `"Note: this record was edited by another administrator at HH:MM:SS — your changes are saved, but please verify."` when they differ; auto-dismisses after 8 seconds (per FR-016 / Clarifications Q3)
- [ ] T017 [P] Add test scaffolding for the contract tier: `tests/contract/teachers-mutations.api.spec.ts` and `tests/contract/classes-mutations.api.spec.ts` (skeletons with `describe` blocks for the new endpoints, following the `004-user-auth/tests/contract/auth.api.spec.ts` naming convention)
- [ ] T018 [P] Add test scaffolding for the integration tier: `tests/integration/teachers-mutations.api.spec.ts` and `tests/integration/classes-mutations.api.spec.ts` (skeletons with `describe` blocks for SC-001..SC-008, following the `001-teachers/tests/integration/teachers.api.spec.ts` naming convention)
- [ ] T019 [P] Update `TeacherTable.tsx` in `app/(authed)/teachers/_components/` to add a new rightmost **Actions** column that renders the `RowActionsMenu` component (per FR-001); the column header is `Actions` and is right-aligned
- [ ] T020 [P] Update `ClassTable.tsx` in `app/(authed)/classes/_components/` to add a new rightmost **Actions** column that renders the `RowActionsMenu` component (per FR-001)
- [ ] T021 [P] Update `TeacherForm.tsx` in `app/(authed)/teachers/_components/` to support "edit mode" — gated by the presence of an `initialValues` prop, the form is pre-populated and the submit handler dispatches PUT (not POST) when in edit mode; the schema is `buildPutTeacherSchema()`; the form-load `modifiedAt` is captured and passed to the `use-edit-submit` hook (per [research.md §6.2](./research.md#62-single-resource-get-endpoints-v260-amendment) and FR-002 / FR-007)
- [ ] T022 [P] Update `ClassForm.tsx` in `app/(authed)/classes/_components/` to support "edit mode" — gated by the presence of an `initialValues` prop, the form is pre-populated and the submit handler dispatches PUT (not POST) when in edit mode; the schema is `buildPutClassSchema()`; the form-load `modifiedAt` is captured and passed to the `use-edit-submit` hook (per FR-003 / FR-008)

**Checkpoint**: Foundation ready. The repository methods, Joi schemas, GET route handlers, shared UI primitives, and test scaffolding are all in place. Each user story phase below can now proceed in parallel (different files, no inter-story dependencies at this point).

---

## Phase 3: User Story 1 — Edit an Existing Teacher (Priority: P1) 🎯 MVP

**Goal**: An administrator can edit an existing teacher via the per-row `...` menu's **Edit** item. The Edit Teacher form is pre-populated from the new `GET /api/v1.0/teachers/[ulid]` endpoint, the admin changes any subset of the four mutable fields, and submitting issues `PUT /api/v1.0/teachers/[ulid]` with full-resource replacement. The Singapore `^[89]\d{7}$` contact-number rule is enforced on PUT. The concurrent-edit toast fires when `previousModifiedAt` differs from the form-load `modifiedAt`.

**Independent Test**: Navigate to `/teachers`, click the per-row `...` menu on a row, click **Edit**, modify any subset of `name`, `subject`, `email`, `contactNumber` (a `contactNumber` that doesn't start with `8` or `9` is rejected at the field level with HTTP 400), submit, and verify the row reflects the new values and `PUT /api/v1.0/teachers/[ulid]` returned 200 with the `previousModifiedAt` sibling field (per US1 acceptance scenarios 1–5 and SC-001 / SC-005 / SC-007).

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T023 [P] [US1] Add contract test for `PUT /api/v1.0/teachers/[ulid]` happy path + 200 status + `previousModifiedAt` sibling field in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T024 [P] [US1] Add contract test for `PUT /api/v1.0/teachers/[ulid]` 400 path (bad email, bad `contactNumber` that doesn't match `^[89]\d{7}$`, missing field) in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T025 [P] [US1] Add contract test for `PUT /api/v1.0/teachers/[ulid]` 401 / 403 paths (no session cookie → 401; session but no / mismatched `X-CSRF-Token` → 403) in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T026 [P] [US1] Add contract test for `PUT /api/v1.0/teachers/[ulid]` 404 path (unknown `ulid`) in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T027 [P] [US1] Add contract test for `PUT /api/v1.0/teachers/[ulid]` 409 path (duplicate `email` belonging to a DIFFERENT teacher; the row-exclusion self-match rule allows the same email) in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T028 [P] [US1] Add contract test for `PUT /api/v1.0/teachers/[ulid]` 415 path (non-JSON `Content-Type`) in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T029 [P] [US1] Add integration test for SC-001 / SC-005 / SC-007 (end-to-end Edit Teacher happy path + Singapore contact-number rejection + auth/CSRF coverage) in `tests/integration/teachers-mutations.api.spec.ts`
- [ ] T030 [P] [US1] Add unit tests for `buildPutTeacherSchema` (happy path + each rejection path including the leading-digit `contactNumber` rejection) in `tests/unit/teachers/mutations.spec.ts` — the Singapore regex is the canonical rule (per FR-013)
- [ ] T031 [P] [US1] Add unit tests for `updateTeacherAndReturnPreviousModifiedAt` (transaction behavior; `previousModifiedAt` equals the pre-write `modified_at` value; new `modified_at` is bumped via `ON UPDATE CURRENT_TIMESTAMP(6)`) in `tests/unit/teachers/mutations.spec.ts`

### Implementation for User Story 1

- [ ] T032 [US1] Implement the `PUT` handler in `app/api/v1.0/teachers/[ulid]/route.ts` — validate the path `ulid` (T012), validate the body against `buildPutTeacherSchema` (T010), look up the row via `findTeacherByUlid` (T005; 404 on miss), resolve `subject.ulid` against the active `subjects` list (400 on unknown/inactive), apply the row-exclusion self-match rule on `email` (the route's email-uniqueness check is `WHERE email = ? AND id != <teacher.id>`; 409 on collision with a DIFFERENT teacher; 200 on the same email — per Clarifications Session 2026-06-22 Q1), call `updateTeacherAndReturnPreviousModifiedAt` (T006), return 200 with the updated row in the GET-list shape plus the `previousModifiedAt` sibling field
- [ ] T033 [US1] Create the Edit Teacher React Server Component page at `app/(authed)/teachers/[ulid]/edit/page.tsx` — receives `{ params: { ulid: string } }` as a prop; calls `GET /api/v1.0/teachers/[ulid]` from the RSC shell (T13); on 200, passes the resolved record to `TeacherForm` in edit mode (T021) with the form-load `modifiedAt` captured; on 404, calls `redirect("/teachers")` with a flash message rendered as an antd warning notification reading `"Teacher not found"` (per FR-002 / FR-003 and [research.md §6.9](./research.md#69-edit-page-rsc--get-pivot))
- [ ] T034 [US1] Wire the `RowActionsMenu` **Edit** item to `router.push("/teachers/<ulid>/edit")` (the existing Next.js `useRouter` pattern from 001-teachers)
- [ ] T035 [US1] Wire the `use-edit-submit` hook (T016) to the `TeacherForm` submit handler — on PUT 200, compare `previousModifiedAt` to `formLoadTime.modifiedAt`; on a difference, fire the antd warning notification; on PUT 409 (duplicate email or unknown subject), surface the field-level error; on PUT 400 (Singapore contact-number rejection), surface the field-level error on the Contact Number control; on success, navigate to `/teachers` and refresh the list client-side (per FR-006 / FR-016 and Clarifications Q3)

**Checkpoint**: At this point, User Story 1 is fully functional and testable independently — the per-row `...` menu, the Edit Teacher page, the PUT handler, the form-teacher invariant re-checks, the Singapore `^[89]\d{7}$` regex, and the concurrent-edit toast are all in place. SC-001 / SC-005 / SC-007 are testable end-to-end.

---

## Phase 4: User Story 2 — Delete an Existing Teacher (Priority: P1)

**Goal**: An administrator can delete an existing teacher via the per-row `...` menu's **Delete** item. The Delete confirmation modal embeds the teacher's name and uses the project's Tailwind destructive-action token. On confirm, the system issues `DELETE /api/v1.0/teachers/[ulid]`. If the teacher is currently a form teacher of a class, the request is rejected with HTTP 409 Conflict and the singular `details.classUlid` / `details.className` envelope (per Clarifications Session 2026-06-22 (DELETE-Teacher 409 envelope — one-to-one simplification)). A second DELETE on the same `ulid` returns 404 silently (per Principle X.2).

**Independent Test**: Navigate to `/teachers`, click the per-row `...` menu on a row, click **Delete**, confirm the modal, and verify the row disappears from the list. The 409 path is independently testable by deleting a teacher who is currently the form teacher of any class and verifying a 409 with the singular envelope (per US2 acceptance scenarios 1–5 and SC-002 / SC-003 / SC-004 / SC-007).

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T036 [P] [US2] Add contract test for `DELETE /api/v1.0/teachers/[ulid]` happy path + 200 status + `{ "ulid": "<deleted-teacher-ulid>" }` response body in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T037 [P] [US2] Add contract test for `DELETE /api/v1.0/teachers/[ulid]` 401 / 403 paths (no session cookie → 401; session but no / mismatched `X-CSRF-Token` → 403) in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T038 [P] [US2] Add contract test for `DELETE /api/v1.0/teachers/[ulid]` 404 path (second DELETE on the same `ulid`; covers both the "race — another tab deleted first" case and the "unknown `ulid`" case) in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T039 [P] [US2] Add contract test for `DELETE /api/v1.0/teachers/[ulid]` 409 path (teacher is currently a form teacher of a class) — verify the singular envelope `{ "error": "Teacher is assigned as form teacher of class \"<className>\". Reassign or delete that class first.", "details": { "classUlid": "<classUlid>", "className": "<className>" } }` per FR-009 and Clarifications Session 2026-06-22 (DELETE-Teacher 409 envelope — one-to-one simplification) in `tests/contract/teachers-mutations.api.spec.ts`
- [ ] T040 [P] [US2] Add integration test for SC-002 / SC-003 / SC-004 (end-to-end Delete Teacher happy path + form-teacher 409 guard with a real `classes` row pointing at the teacher under test + idempotent 404 on second DELETE) in `tests/integration/teachers-mutations.api.spec.ts`
- [ ] T041 [P] [US2] Add unit tests for `findClassByFormTeacherId` (returns 0 or 1 rows against `uq_classes_form_teacher_id`; the `UNIQUE` constraint guarantees at most one) in `tests/unit/classes/mutations.spec.ts`

### Implementation for User Story 2

- [ ] T042 [US2] Implement the `DELETE` handler in `app/api/v1.0/teachers/[ulid]/route.ts` — validate the path `ulid` (T012), look up the row via `findTeacherByUlid` (T005; 404 on miss), call `findClassByFormTeacherId(teacher.id)` (T008) for the form-teacher guard; if a blocking class is found, return 409 with the singular envelope (per FR-009 and [data-model.md §4](./data-model.md#4-the-form-teacher-guard-delete-teacher-fr-009)); otherwise, delete the row and return 200 with `{ "ulid": "<deleted-teacher-ulid>" }` (per `TODO(STAGE3_DELETE_RESPONSE_SHAPE)` — NOT `204 No Content`; per Principle X.2 — second DELETE returns 404 silently)
- [ ] T043 [US2] Wire the `RowActionsMenu` **Delete** item to an `antd` `Modal.confirm` whose body embeds the entity's name (per FR-004: `Delete teacher {name}? This action cannot be undone.`); the modal presents **Cancel** (default-style) and **Delete** (destructive-style using the project's existing Tailwind destructive-action token — no new design tokens); on **Delete** confirmation, call the `DELETE` route handler via `fetch` with the `X-CSRF-Token` header (per FR-011 / Principle IX.3); on 200, call the `onDeleted` callback to refresh the list client-side (per FR-006); on 404 (second DELETE / race), call the `onDeleted` callback silently (no error notification per FR-006); on 409 (form-teacher guard), close the modal and show an antd error notification whose body reads `"Assigned as form teacher of: {className}. Reassign or delete that class first."` (per FR-005, matching the wire `error` string verbatim — no array truncation, no `… and N more` suffix per the Clarifications one-to-one simplification)

**Checkpoint**: At this point, User Stories 1 AND 2 are both fully functional and testable independently. The per-row `...` menu's **Edit** and **Delete** items are wired, the DELETE-Teacher 409 singular envelope is verified, and the idempotent 404 path is covered. SC-002 / SC-003 / SC-004 / SC-007 are testable end-to-end.

---

## Phase 5: User Story 3 — Edit an Existing Class (Priority: P1)

**Goal**: An administrator can edit an existing class via the per-row `...` menu's **Edit** item. The Edit Class form is pre-populated from the new `GET /api/v1.0/classes/[ulid]` endpoint, the admin changes any subset of `name`, `level`, `formTeacher`, and submitting issues `PUT /api/v1.0/classes/[ulid]` with full-resource replacement. The form-teacher uniqueness invariant is re-checked on PUT (a class updating to the same form teacher it already has is permitted; a class updating to a form teacher belonging to a DIFFERENT class is rejected with 409). The concurrent-edit toast fires when `previousModifiedAt` differs from the form-load `modifiedAt`.

**Independent Test**: Navigate to `/classes`, click the per-row `...` menu on a row, click **Edit**, modify the `formTeacher` to a different registered teacher (one who is NOT already a form teacher of any class), submit, and verify the row reflects the new form teacher. The 409 path is independently testable by setting the `formTeacher` to a teacher who is already the form teacher of a DIFFERENT class (per US3 acceptance scenarios 1–6 and SC-006).

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T044 [P] [US3] Add contract test for `PUT /api/v1.0/classes/[ulid]` happy path + 200 status + `previousModifiedAt` sibling field in `tests/contract/classes-mutations.api.spec.ts`
- [ ] T045 [P] [US3] Add contract test for `PUT /api/v1.0/classes/[ulid]` 400 path (missing field, unknown/inactive `level.ulid`) in `tests/contract/classes-mutations.api.spec.ts`
- [ ] T046 [P] [US3] Add contract test for `PUT /api/v1.0/classes/[ulid]` 401 / 403 paths (no session cookie → 401; session but no / mismatched `X-CSRF-Token` → 403) in `tests/contract/classes-mutations.api.spec.ts`
- [ ] T047 [P] [US3] Add contract test for `PUT /api/v1.0/classes/[ulid]` 404 path (unknown `ulid`; unknown `formTeacher.ulid`) in `tests/contract/classes-mutations.api.spec.ts`
- [ ] T048 [P] [US3] Add contract test for `PUT /api/v1.0/classes/[ulid]` 409 path (duplicate `name` belonging to a DIFFERENT class — the row-exclusion self-match rule allows the same name; `formTeacher.ulid` belongs to a teacher who is the form teacher of a DIFFERENT class — the row-exclusion self-match rule allows the same form teacher the class already has) in `tests/contract/classes-mutations.api.spec.ts`
- [ ] T049 [P] [US3] Add contract test for `PUT /api/v1.0/classes/[ulid]` 415 path (non-JSON `Content-Type`) in `tests/contract/classes-mutations.api.spec.ts`
- [ ] T050 [P] [US3] Add integration test for SC-006 (end-to-end Edit Class happy path + form-teacher-collision 409 with two pre-seeded classes sharing the same form teacher) in `tests/integration/classes-mutations.api.spec.ts`
- [ ] T051 [P] [US3] Add unit tests for `buildPutClassSchema` (happy path + each rejection path including the same-form-teacher-on-same-class allowance and the form-teacher-collision rejection) in `tests/unit/classes/mutations.spec.ts`
- [ ] T052 [P] [US3] Add unit tests for `updateClassAndReturnPreviousModifiedAt` (transaction behavior; `previousModifiedAt` equals the pre-write `modified_at` value) in `tests/unit/classes/mutations.spec.ts`

### Implementation for User Story 3

- [ ] T053 [US3] Implement the `PUT` handler in `app/api/v1.0/classes/[ulid]/route.ts` — validate the path `ulid` (T012), validate the body against `buildPutClassSchema` (T011), look up the row via `findClassByUlid` (T007; 404 on miss), resolve `level.ulid` against the active `levels` list (400 on unknown/inactive), resolve `formTeacher.ulid` against `teachers` via `uq_teachers_ulid` (404 on unknown), apply the row-exclusion self-match rule on `formTeacher` (a class updating to the same form teacher it already has is permitted; a class updating to a form teacher belonging to a DIFFERENT class is rejected with 409 per FR-008 and Principle X.3), apply the row-exclusion self-match rule on `name` (a class updating to the same name it already has is permitted; a class updating to a name belonging to a DIFFERENT class is rejected with 409 per FR-005c), call `updateClassAndReturnPreviousModifiedAt` (T009), return 200 with the updated row in the GET-list shape plus the `previousModifiedAt` sibling field
- [ ] T054 [US3] Create the Edit Class React Server Component page at `app/(authed)/classes/[ulid]/edit/page.tsx` — receives `{ params: { ulid: string } }` as a prop; calls `GET /api/v1.0/classes/[ulid]` from the RSC shell (T14); on 200, passes the resolved record to `ClassForm` in edit mode (T022) with the form-load `modifiedAt` captured; on 404, calls `redirect("/classes")` with a flash message rendered as an antd warning notification reading `"Class not found"` (per FR-003 and [research.md §6.9](./research.md#69-edit-page-rsc--get-pivot))
- [ ] T055 [US3] Wire the `RowActionsMenu` **Edit** item to `router.push("/classes/<ulid>/edit")`
- [ ] T056 [US3] Wire the `use-edit-submit` hook (T016) to the `ClassForm` submit handler — on PUT 200, compare `previousModifiedAt` to `formLoadTime.modifiedAt`; on a difference, fire the antd warning notification; on PUT 409 (form-teacher collision or duplicate name), surface the field-level error; on success, navigate to `/classes` and refresh the list client-side (per FR-006 / FR-016)

**Checkpoint**: At this point, User Stories 1, 2, AND 3 are all fully functional and testable independently. The Edit Class page, the form-teacher uniqueness re-check on PUT, and the same-class self-match rules are all verified. SC-006 is testable end-to-end.

---

## Phase 6: User Story 4 — Delete an Existing Class (Priority: P1)

**Goal**: An administrator can delete an existing class via the per-row `...` menu's **Delete** item. The Delete confirmation modal embeds the class's name. On confirm, the system issues `DELETE /api/v1.0/classes/[ulid]`. No referential-integrity check is required (no other table references `classes.id` outside the audit columns). A second DELETE on the same `ulid` returns 404 silently (per Principle X.2). After a successful delete, the teacher who was the deleted class's form teacher is eligible to be the form teacher of a new class (the form-teacher uniqueness invariant is freed by the class delete).

**Independent Test**: Navigate to `/classes`, click the per-row `...` menu on a row, click **Delete**, confirm the modal, and verify the row disappears. The idempotency path is independently testable by clicking Delete on the same `ulid` a second time and verifying the list refreshes silently (per US4 acceptance scenarios 1–5 and SC-004).

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T057 [P] [US4] Add contract test for `DELETE /api/v1.0/classes/[ulid]` happy path + 200 status + `{ "ulid": "<deleted-class-ulid>" }` response body in `tests/contract/classes-mutations.api.spec.ts`
- [ ] T058 [P] [US4] Add contract test for `DELETE /api/v1.0/classes/[ulid]` 401 / 403 paths in `tests/contract/classes-mutations.api.spec.ts`
- [ ] T059 [P] [US4] Add contract test for `DELETE /api/v1.0/classes/[ulid]` 404 path (second DELETE on the same `ulid`) in `tests/contract/classes-mutations.api.spec.ts`
- [ ] T060 [P] [US4] Add integration test for SC-004 (end-to-end Delete Class happy path + idempotent 404 on second DELETE) in `tests/integration/classes-mutations.api.spec.ts`

### Implementation for User Story 4

- [ ] T061 [US4] Implement the `DELETE` handler in `app/api/v1.0/classes/[ulid]/route.ts` — validate the path `ulid` (T012), look up the row via `findClassByUlid` (T007; 404 on miss), delete the row and return 200 with `{ "ulid": "<deleted-class-ulid>" }` (per `TODO(STAGE3_DELETE_RESPONSE_SHAPE)` — NOT `204 No Content`; per Principle X.2 — second DELETE returns 404 silently; no referential-integrity check required per FR-010 and Principle X.2 since no other table references `classes.id` outside the audit columns)
- [ ] T062 [US4] Wire the `RowActionsMenu` **Delete** item (in the Classes list's menu — the same `RowActionsMenu` component as US2, parameterized by `resource: 'class'`) to an `antd` `Modal.confirm` whose body reads `Delete class {name}? This action cannot be undone.`; on **Delete** confirmation, call the `DELETE` route handler via `fetch` with the `X-CSRF-Token` header; on 200, call the `onDeleted` callback to refresh the list client-side; on 404 (second DELETE / race), call the `onDeleted` callback silently

**Checkpoint**: At this point, **all four user stories** (US1, US2, US3, US4) are fully functional and testable independently. The Stage 3 mutation surface is complete: six new endpoints, two new RSC pages, the per-row `...` menu, the Delete confirmation modal, the concurrent-edit toast, the Singapore `^[89]\d{7}$` regex, the form-teacher referential integrity guard, and the idempotent DELETE semantics.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and the cross-cutting project surface (README, propagation to upstream specs, the `details` envelope extension, the constitution TODO closures, and the final quickstart validation pass).

- [ ] T063 [P] Update `specs/003-backend-api-db/spec.md` FR-013 cross-cutting status-code table — add the Stage 3 `200 OK` row for UPDATE success, the `415` row for PUT non-JSON content, the `404 Not Found` row for second DELETE on a missing `ulid`, and a documentation note for the optional `details` envelope extension (per 006 spec FR-015 propagation contract)
- [ ] T064 [P] Update `specs/003-backend-api-db/spec.md` FR-022 versioned-prefix inventory — list the six new Stage 3 endpoints (two single-resource GETs, two PUTs, two DELETEs) alongside the existing seven Stage 1 + Stage 2 endpoints
- [ ] T065 [P] Update `README.md` at the repo root — add a Stage 3 section describing the new PUT / DELETE endpoints, the Singapore `^[89]\d{7}$` contact-number rule (re-tightened from the relaxed Stage 1 / Stage 2 `^\d{8}$` pattern), the per-row Edit + Delete UI, the single-resource GET endpoints, the form-teacher referential integrity guard, and the idempotent DELETE semantics
- [ ] T066 [P] Update `docker/.env.docker` (or the relevant `.env` file) to ensure no new environment variables are required by the 006 feature (per Principle V — YAGNI; this feature adds zero new runtime dependencies and zero new configuration knobs)
- [ ] T067 Verify all four `SC-001`..`SC-008` are covered by passing tests in the three Vitest tiers — `npm run test:unit`, `npm run test:contract`, `npm run test:integration` all green; no test is flaky; coverage of the 200 / 400 / 401 / 403 / 404 / 409 / 415 / 500 / 503 status matrix on every new endpoint
- [ ] T068 Run the 10 validation scenarios in `quickstart.md` end-to-end against a fresh `docker compose up` — verify Scenario 1 (Edit Teacher UI happy path), Scenario 3 (Singapore contact-number rule on PUT — the `12345678` rejection and the 9-digit rejection), Scenario 4 (DELETE-Teacher 409 with the singular envelope), Scenario 5 (DELETE-Teacher success path after reassignment), Scenario 6 (idempotent DELETE — 404 silently), Scenario 7 (UPDATE-Class form-teacher collision — 409), Scenario 8 (auth + CSRF coverage), and Scenario 9 (concurrent-edit toast)
- [ ] T069 [P] Code cleanup pass — remove any `TODO` markers introduced during implementation, run the linter / formatter configured in `package.json` (e.g., `npm run lint`, `npm run format`), and ensure no `class` keyword is used outside typeORM entity classes (per Principle VI — verified by the `simplify` skill's code-review rule, or by manual `grep -r "class " lib/ app/`)
- [ ] T070 [P] Final Constitution Check re-validation — re-read the plan's Constitution Check table and confirm all 10 principles still pass; confirm the three new `TODO` items (TODO(CONTACT_NUMBER_RULE_OWNER), TODO(STAGE3_DELETE_RESPONSE_SHAPE), TODO(STAGE3_GET_SINGLE_RESOURCE_AMENDMENT)) are RESOLVED by the implementation; the new `TODO(FEATURE_006)` (manual check that the DELETE-Teacher 409 envelope deep-link to `/classes/[ulid]/edit` works) is documented in the quickstart

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. The contact-number shared module and the 001 POST-Teacher regex update are pre-requisite for any PUT-Teacher work.
- **Foundational (Phase 2)**: Depends on Setup completion (T001..T004) — **BLOCKS all user stories**. The repository methods, Joi schemas, GET route handlers, shared UI primitives, and test scaffolding are blocking prerequisites.
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion.
  - User Story 1 (Phase 3) — Edit Teacher
  - User Story 2 (Phase 4) — Delete Teacher
  - User Story 3 (Phase 5) — Edit Class
  - User Story 4 (Phase 6) — Delete Class
  - All four stories are P1 and have **no inter-story dependencies** (different files, no shared state beyond the foundational artifacts).
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### User Story Dependencies

- **User Story 1 (Edit Teacher, P1)**: Can start after Foundational (Phase 2). Depends on T005 (findTeacherByUlid), T006 (updateTeacherAndReturnPreviousModifiedAt), T010 (PUT Joi schema), T013 (GET-by-ulid route handler), T015 (RowActionsMenu), T016 (use-edit-submit), T017 (test scaffolding), T021 (TeacherForm edit mode).
- **User Story 2 (Delete Teacher, P1)**: Can start after Foundational (Phase 2). Depends on T005 (findTeacherByUlid), T008 (findClassByFormTeacherId), T015 (RowActionsMenu — same component as US1), T017 (test scaffolding). Shares `RowActionsMenu` and the `app/api/v1.0/teachers/[ulid]/route.ts` file with US1 (sequential within the file; US1's T032 adds the PUT handler, US2's T042 adds the DELETE handler to the same file).
- **User Story 3 (Edit Class, P1)**: Can start after Foundational (Phase 2). Depends on T007 (findClassByUlid), T009 (updateClassAndReturnPreviousModifiedAt), T011 (PUT Joi schema), T014 (GET-by-ulid route handler), T015 (RowActionsMenu — same component), T016 (use-edit-submit — same hook), T018 (test scaffolding), T022 (ClassForm edit mode).
- **User Story 4 (Delete Class, P1)**: Can start after Foundational (Phase 2). Depends on T007 (findClassByUlid), T015 (RowActionsMenu — same component), T018 (test scaffolding). Shares `RowActionsMenu` and the `app/api/v1.0/classes/[ulid]/route.ts` file with US3 (sequential within the file; US3's T053 adds the PUT handler, US4's T061 adds the DELETE handler to the same file).

### Within Each User Story

- **Tests MUST be written and FAIL before implementation** (per the standard TDD discipline and Constitution Principle III).
- Repository methods before route handlers (the route handlers depend on the repository methods).
- Joi schemas before route handlers (the route handlers validate the body via Joi per Principle VII).
- Single-resource GET route handler (T013 / T014) before the PUT / DELETE route handlers (the Edit pages depend on the GET response; the route handlers' pre-write lookups share the repository methods).
- RowActionsMenu + use-edit-submit before the Edit pages (the Edit pages compose these primitives).
- Test scaffolding (T017 / T018) before the test cases (the test cases extend the scaffolding).

### Parallel Opportunities

- All Phase 1 Setup tasks marked [P] (T002, T003) can run in parallel.
- All Phase 2 Foundational tasks marked [P] (T005..T022 — 14 of 18 tasks) can run in parallel within Phase 2.
- Once Phase 2 completes, **all four user stories can start in parallel** (if team capacity allows). The shared `RowActionsMenu` (T015) and `use-edit-submit` (T016) are completed in Phase 2, so US1 and US2 share the same RowActionsMenu; US3 and US4 share the same RowActionsMenu.
- All test tasks for a user story marked [P] can run in parallel.
- All repository / Joi / test-scaffolding tasks within a user story marked [P] can run in parallel.
- US1 and US2 touch **different files** within `app/api/v1.0/teachers/[ulid]/route.ts` (US1 adds the PUT handler, US2 adds the DELETE handler); they can be parallelized **only if** the two handler functions are added in different commits, with the route file briefly shipping only one handler at a time. The safer ordering is sequential: US1 first (T032 adds the PUT handler), then US2 (T042 adds the DELETE handler to the same file).
- US3 and US4 touch **different files** within `app/api/v1.0/classes/[ulid]/route.ts` (US3 adds the PUT handler, US4 adds the DELETE handler); same sequential ordering recommendation.

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (TDD-first):
Task: "Add contract test for PUT /api/v1.0/teachers/[ulid] happy path + 200 status + previousModifiedAt sibling field in tests/contract/teachers-mutations.api.spec.ts"
Task: "Add contract test for PUT /api/v1.0/teachers/[ulid] 400 path (bad email, bad contactNumber that doesn't match ^[89]\d{7}$, missing field) in tests/contract/teachers-mutations.api.spec.ts"
Task: "Add contract test for PUT /api/v1.0/teachers/[ulid] 401 / 403 paths in tests/contract/teachers-mutations.api.spec.ts"
Task: "Add contract test for PUT /api/v1.0/teachers/[ulid] 404 path (unknown ulid) in tests/contract/teachers-mutations.api.spec.ts"
Task: "Add contract test for PUT /api/v1.0/teachers/[ulid] 409 path (duplicate email) in tests/contract/teachers-mutations.api.spec.ts"
Task: "Add contract test for PUT /api/v1.0/teachers/[ulid] 415 path (non-JSON Content-Type) in tests/contract/teachers-mutations.api.spec.ts"
Task: "Add integration test for SC-001 / SC-005 / SC-007 in tests/integration/teachers-mutations.api.spec.ts"
Task: "Add unit tests for buildPutTeacherSchema in tests/unit/teachers/mutations.spec.ts"
Task: "Add unit tests for updateTeacherAndReturnPreviousModifiedAt in tests/unit/teachers/mutations.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001..T004)
2. Complete Phase 2: Foundational (T005..T022) — the most task-dense phase
3. Complete Phase 3: User Story 1 — Edit Teacher (T023..T035)
4. **STOP and VALIDATE**: Test User Story 1 independently — verify the per-row `...` menu's **Edit** item, the pre-populated Edit Teacher form, the PUT 200 with the `previousModifiedAt` field, the Singapore `^[89]\d{7}$` regex, the row-exclusion self-match on `email`, and the concurrent-edit toast
5. Deploy / demo if ready — the MVP is "Edit a Teacher"

### Incremental Delivery

1. Complete Setup (Phase 1) + Foundational (Phase 2) → Foundation ready
2. Add User Story 1 (Phase 3) → Test independently → Deploy/Demo (MVP! "Edit a Teacher")
3. Add User Story 2 (Phase 4) → Test independently → Deploy/Demo ("Edit + Delete a Teacher")
4. Add User Story 3 (Phase 5) → Test independently → Deploy/Demo ("Edit a Teacher, Edit a Class")
5. Add User Story 4 (Phase 6) → Test independently → Deploy/Demo (full Stage 3 surface)
6. Complete Polish (Phase 7) — README, propagation to 003, constitution TODO closures, quickstart validation
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (the most task-dense portion)
2. Once Phase 2 is done:
   - Developer A: User Story 1 (Edit Teacher) — touches `app/api/v1.0/teachers/[ulid]/route.ts` (PUT handler only), `app/(authed)/teachers/[ulid]/edit/page.tsx`, the Teachers list wiring
   - Developer B: User Story 3 (Edit Class) — touches `app/api/v1.0/classes/[ulid]/route.ts` (PUT handler only), `app/(authed)/classes/[ulid]/edit/page.tsx`, the Classes list wiring
   - Developer C: User Story 2 (Delete Teacher) — touches `app/api/v1.0/teachers/[ulid]/route.ts` (DELETE handler only; sequential after Developer A's PUT handler lands), the per-row `...` menu's **Delete** wiring
   - Developer D: User Story 4 (Delete Class) — touches `app/api/v1.0/classes/[ulid]/route.ts` (DELETE handler only; sequential after Developer B's PUT handler lands), the per-row `...` menu's **Delete** wiring
3. Stories complete and integrate independently — the PUT and DELETE handlers within the same route file must land sequentially (PUT first, then DELETE) because they share the route file's imports and the test scaffolding, but the cross-file work (Teacher vs Class stories) is fully parallel.

---

## Notes

- [P] tasks = different files, no dependencies. The `[P]` marker is an LLM-execution hint, not a hard guarantee; route files that ship both PUT and DELETE on the same path (`app/api/v1.0/{teachers,classes}/[ulid]/route.ts`) are intentionally NOT marked [P] across stories because they touch the same file.
- [Story] label maps task to specific user story for traceability (US1, US2, US3, US4 — all P1).
- Each user story is independently completable and testable per the standard SDD discipline.
- Verify tests FAIL before implementing (TDD discipline, Constitution Principle III).
- Commit after each task or logical group.
- Stop at any checkpoint to validate story independently.
- Avoid: vague tasks (all tasks here have a single file path and a single concrete action), same-file conflicts (the PUT and DELETE handlers within the same route file are split across US1/US2 and US3/US4 with explicit sequential ordering), cross-story dependencies that break independence (the shared `RowActionsMenu` and `use-edit-submit` are completed in Phase 2 so all four user stories can proceed without inter-story coupling).
