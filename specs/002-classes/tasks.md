# Tasks: Classes

**Input**: Design documents from `/specs/002-classes/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Branch**: `002-classes` | **Date**: 2026-06-18

**Tests**: Constitution Principle III (Unit Tests Required) + spec success criteria SC-001..SC-006 mandate tests at every layer. Test tasks are included in each user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Inherited from 001-teachers)

**Purpose**: Verify the inherited setup is sufficient; nothing new to install for 002.

The Classes feature reuses the entire 001-teachers stack — no new npm
dependencies, no new tooling. The tasks in this phase are verification
tasks that confirm the inherited setup is sufficient; if any check
fails, the corresponding 001 task must be revisited first.

- [ ] T001 [P] Verify `package.json` (from `001-teachers/T001`) has the dependency set the Classes feature needs: `next@^15`, `react@^19`, `typeorm@^0.3`, `mysql2@^3`, `joi@^17`, `dotenv@^16`, `@govtechsg/sgds-react@^3`, `vitest` — no new packages required
- [ ] T002 [P] Verify `.env.example` (from `001-teachers/T005`) already documents every env var the Classes feature needs; no additions
- [ ] T003 [P] Update root `README.md` to add a "Classes" section with placeholders for the Add Class / Classes links and the `/api/classes` + `/api/levels` endpoint references (the implementation sections are filled in at the polish phase T032)

---

## Phase 2: Foundational (Inherited + one extension)

**Purpose**: Verify the inherited foundation is in place; extend the typeORM DataSource to register the new `Class` and `Level` entities.

The Classes feature inherits `lib/config.ts`, `lib/api/response.ts`,
`lib/api/content-type.ts`, the `app/layout.tsx`, the docker setup,
and the `app/page.tsx` home redirect — all from 001-teachers. The
only Foundational change is registering the new entities with the
typeORM DataSource so the migrations and repositories can see them.

- [ ] T004 Extend `lib/db/data-source.ts` (from `001-teachers/T009`) — add `Class` and `Level` to the `entities: []` array so the DataSource is aware of them; the `migrations: ["lib/db/migrations/*.ts"]` glob is already correct (the new 002 migrations are picked up automatically)
- [ ] T005 Verify `lib/api/response.ts` (from `001-teachers/T010`) exports `jsonError` and `jsonCreated` are sufficient for the Classes POST / GET endpoints; no new helpers needed (per `001-teachers/plan.md` Constitution Check — no class-based service layer, no DTOs)

**Checkpoint**: Foundation extended — user story implementation can now begin.

---

## Phase 3: User Story 1 - Add a New Class with a Form Teacher (Priority: P1) 🎯 MVP

**Goal**: An administrator creates a new class by completing the Add Class form (Level dropdown, Name text, Form Teacher searchable dropdown of existing teachers) and submitting it; the system creates the class, links it to the chosen teacher, and the new class appears in the Classes list (and `POST /api/classes` returns `201` with the class JSON).

**Independent Test**: Seed at least one teacher (via `001-teachers` quickstart); submit the Add Class form (or `POST /api/classes`) with `level` (an active level from the seed list), `name` (a new unique string), and `teacherEmail` (an existing teacher's email); verify `201` is returned, the row is in the `classes` table with the FK to `teachers`, and the class appears in a follow-up `GET /api/classes` call with the form-teacher name resolved.

### Tests for User Story 1 (REQUIRED per Constitution Principle III + spec SC-001..SC-006) ⚠️

> **NOTE**: Write these tests FIRST; they should FAIL (red) before the implementation tasks below. Each test file maps to one or more quickstart scenarios.

- [ ] T006 [P] [US1] Contract test: `POST /api/classes` happy path (201) + missing field (400) + invalid email (400) + unknown level (400) + unknown teacher (404) + duplicate class name (409) + teacher already assigned (409) + non-JSON content type (415) in `tests/contract/classes.api.spec.ts` (covers quickstart Scenarios 2, 4, 5, 6, 7, 8, 9)
- [ ] T007 [P] [US1] Integration test: `POST /api/classes` against the live MySQL container — same matrix as T006 plus SC-004 race-safety (10 concurrent POSTs with the same `teacherEmail` → exactly one 201 + nine 409s "Teacher already assigned") in `tests/integration/classes.api.spec.ts` (covers quickstart Scenarios 7, 8, 12, 14)
- [ ] T008 [P] [US1] Unit test: `buildCreateClassSchema()` Joi schema — happy path + every rejection path (missing level, unknown level, inactive level, missing name, empty name, name > 255, missing teacherEmail, invalid email format) in `tests/unit/class.validation.spec.ts` (covers quickstart Scenarios 5, 6, 7)

### Implementation for User Story 1

- [ ] T009 [P] [US1] Create `lib/db/entities/Class.ts` — typeORM `@Entity("classes")` class with `@PrimaryGeneratedColumn({ type: "bigint" })` `id` (hidden from Stage 1 API response per spec Clarifications Q5), `@Column` `level VARCHAR(64) NOT NULL`, `name VARCHAR(255) NOT NULL UNIQUE`, `form_teacher_email VARCHAR(254) NOT NULL`; `@Index("uq_classes_name", ["name"], { unique: true })`, `@Index("uq_classes_form_teacher", ["formTeacherEmail"], { unique: true })`; `@ManyToOne(() => Teacher)` + `@ManyToOne(() => Level)` with the right `JoinColumn` mappings (per `data-model.md` §2)
- [ ] T010 [P] [US1] Create `lib/db/entities/Level.ts` — typeORM `@Entity("levels")` class with `@PrimaryColumn` `name VARCHAR(64)` and `@Column({ default: true })` `active BOOLEAN` (per `data-model.md` §1; mirrors `Subject` from 001)
- [ ] T011 [US1] Create migration `lib/db/migrations/1700000000002-InitClasses.ts` — `CREATE TABLE IF NOT EXISTS levels (...)` then `CREATE TABLE IF NOT EXISTS classes (...)` with `UNIQUE KEY uq_classes_name (name)`, `UNIQUE KEY uq_classes_form_teacher (form_teacher_email)`, `FOREIGN KEY (level) REFERENCES levels(name)`, `FOREIGN KEY (form_teacher_email) REFERENCES teachers(email)`; `down` drops both tables (per `data-model.md` §8 + `003-backend-api-db/data-model.md` §4 for the migration-set ordering — this is migration #3 of 4)
- [ ] T012 [US1] Create migration `lib/db/migrations/1700000000003-SeedLevels.ts` — `INSERT IGNORE INTO levels (name, active) VALUES (?, ?), ...` for the 10-row Stage 1 seed list (Primary 1–6, Secondary 1–4 — all `active = true`); `down` deletes the seeded rows by `name` (per `data-model.md` §1 + `003-backend-api-db/spec.md` FR-017 — second-migration seed pattern)
- [ ] T013 [P] [US1] Create `lib/validation/class.ts` — `buildCreateClassSchema()` factory: at call time, `await getActiveLevelNames()` (T015), return a `Joi.object({ level: Joi.string().valid(...levels).required(), name: Joi.string().trim().min(1).max(255).required(), teacherEmail: Joi.string().email({ tlds: false }).trim().lowercase().max(254).required() })` with `additionalProperties: false` (per `data-model.md` §2 "Joi schema")
- [ ] T014 [P] [US1] Create `lib/db/repositories/class.ts` — pure-function helpers around the typeORM Repository: `createClass(input)` (catches `QueryFailedError` `ER_DUP_ENTRY` and re-throws a tagged `DuplicateClassNameError` or `TeacherAlreadyAssignedError` based on the index name, for the route handler), `findClassByName(name)`, `listClassesWithFormTeacher()` (the JOIN query — see T026), `findClassByFormTeacherEmail(email)` (per `data-model.md` §2 + `003-backend-api-db/research.md` §3.6)
- [ ] T015 [P] [US1] Create `lib/db/repositories/level.ts` — pure-function helpers: `getActiveLevelNames()` (returns `string[]`), `listActiveLevels()` (returns `Level[]`); used by T013 (Joi factory) and by US2 (GET endpoint) (per `data-model.md` §1)
- [ ] T016 [P] [US1] Extend `lib/db/repositories/teacher.ts` (from `001-teachers/T026`) with `findTeacherByEmail(email)` — the pre-INSERT check that distinguishes `404 "Teacher not found"` from `409 "Teacher already assigned"`; returns `Teacher | null` (per `research.md` §2.2)
- [ ] T017 [US1] Create `app/api/classes/route.ts` — `POST` handler that: (1) calls `requireJson(req)` (415 short-circuit), (2) awaits `buildCreateClassSchema()` and validates `await req.json()` (400 on error), (3) calls `findTeacherByEmail(value.teacherEmail)` and returns `404 "Teacher not found"` if null, (4) calls `createClass(value)` inside a try/catch that maps `DuplicateClassNameError → 409 "Class name already in use"`, `TeacherAlreadyAssignedError → 409 "Teacher already assigned"`, FK violations on `form_teacher_email` → `404 "Teacher not found"` (race), and unhandled throws to the global 500 handler; returns `201` with the class JSON (with `formTeacher.name` resolved) on success (per `contracts/classes.yaml` POST + `research.md` §2.2 "Route-handler sketch")
- [ ] T018 [P] [US1] Create `components/Select.tsx` — shared, feature-agnostic `<Select label name options value onChange required error>` that wraps the SGDS v3 `<Dropdown>` primitive; `options` is `{ value, label }[]`; no feature-specific hard-coding (per `plan.md` Project Structure + Constitution Principle VIII "Reusable")
- [ ] T019 [P] [US1] Create `app/classes/_components/ClassForm.tsx` — client component with the three controls (`LevelSelect`, `FormField` for Name, `FormTeacherSelect`), a Submit `Button` (disabled when `teachers.length === 0` with a clear "Add a teacher first" message linking to `/teachers/add`), and a `useState` for `{ level, name, teacherEmail, errors, submitting }`; on submit, calls `fetch("/api/classes", { method: "POST", ... })`; on `400`, parses the error message and surfaces it on the matching field; on `404`, surfaces a form-level "Teacher not found" error (suggests the teacher was deleted); on `409`, surfaces a form-level error with the specific message; on `201`, `router.push("/classes")`; on `5xx` / network error, surfaces a form-level error and **preserves all input** (per spec FR-001, FR-005b, FR-011, Edge Case §3, quickstart Scenarios 1, 4, 7, 8)
- [ ] T020 [P] [US1] Create `app/classes/_components/FormTeacherSelect.tsx` — a searchable dropdown of existing teachers that wraps the shared `Select`; props: `teachers: Teacher[]`, `value`, `onChange`; options are derived from `teachers.map(t => ({ value: t.email, label: t.name }))`; shows "No teachers registered" empty state when `teachers.length === 0` (per spec FR-001, FR-005b + Clarifications Q2 — searchable dropdown)
- [ ] T021 [P] [US1] Create `app/classes/_components/LevelSelect.tsx` — a non-searchable dropdown that wraps the shared `Select`; props: `levels: Level[]`, `value`, `onChange`; options are `levels.map(l => ({ value: l.name, label: l.name }))`; rejects inactive levels (the Joi factory already filters by `active = true`; this component just renders the active list) (per spec FR-005a + Clarifications Q1)
- [ ] T022 [US1] Create `app/classes/add/page.tsx` — client component that on mount fetches both `GET /api/levels` and `GET /api/teachers` in parallel; while in flight shows a `<LoadingState>`; on success renders `<ClassForm levels={levels} teachers={teachers} />`; on either fetch's failure shows an `<ErrorState>` with retry (per spec FR-001 + quickstart Scenario 1)

**Checkpoint**: At this point, `POST /api/classes` works end-to-end. The Add Class form renders, validates against the active levels list, checks the form teacher exists, and inserts the class with the FK. Quickstart Scenarios 1, 2, 4–9, 13 (unit), 14 (integration) pass.

---

## Phase 4: User Story 2 - Retrieve the List of Classes (Priority: P1)

**Goal**: An administrator navigates to the Classes screen and sees the complete list of classes (or the empty state) with each entry showing `level`, `name`, and `formTeacher.name`; the data comes from `GET /api/classes` (one `JOIN` query against `teachers`) and the Level dropdown data from `GET /api/levels`.

**Independent Test**: Seed N classes (or use the result of US1), open `/classes`, verify every class is listed with all three fields and the resolved form-teacher name; verify the empty state when zero classes exist; verify the loading and error states. The `GET /api/classes` endpoint must return `200` with `{ "data": [...] }` (no `id` field per spec Clarifications Q5) and the `GET /api/levels` endpoint must return `200` with the seeded list.

### Tests for User Story 2 (REQUIRED per Constitution Principle III + spec SC-005, SC-006) ⚠️

- [ ] T023 [P] [US2] Contract test: `GET /api/classes` empty list (200 + `{ data: [] }`), filled list (200 + array with `formTeacher.name` resolved), `500`, `503` in `tests/contract/classes-list.api.spec.ts` (covers quickstart Scenarios 3, 10)
- [ ] T024 [P] [US2] Contract test: `GET /api/levels` seeded list (200 + 10 entries), empty list (200 + `{ data: [] }`) in `tests/contract/levels.api.spec.ts` (covers quickstart Scenario 10 + FR-005a)
- [ ] T025 [P] [US2] Integration test: `GET /api/classes` after seeding N classes (covers quickstart Scenarios 3, 11) and after a server restart (verifies SC-005) in `tests/integration/classes-list.api.spec.ts`

### Implementation for User Story 2

- [ ] T026 [US1/US2] Extend `lib/db/repositories/class.ts` (T014) with `listClassesWithFormTeacher()` — one `JOIN` query: `SELECT c.level, c.name, t.name AS form_teacher_name FROM classes c JOIN teachers t ON c.form_teacher_email = t.email ORDER BY c.level, c.name`; use `createQueryBuilder` with `innerJoinAndSelect("c.formTeacher", "t")` or a `LEFT JOIN` if a class can exist without a teacher (in Stage 1 it cannot, so INNER is correct); returns `ClassWithFormTeacher[]` with the `id` stripped from the JSON shape (per `research.md` §2.6 "GET /api/classes join strategy")
- [ ] T027 [US1/US2] Extend `lib/db/repositories/level.ts` (T015) with `listActiveLevels()` — `SELECT * FROM levels WHERE active = true`; returns `Level[]` (per `data-model.md` §1)
- [ ] T028 [US2] Create `app/api/classes/route.ts` `GET` handler (extend T017) — returns `200` with `{ data: ClassWithFormTeacher[] }` from `listClassesWithFormTeacher()`; the `id` column is intentionally NOT in the response (per spec Clarifications Q5); wraps in try/catch for 500/503 (per `contracts/classes.yaml` GET)
- [ ] T029 [US2] Create `app/api/levels/route.ts` — `GET` handler that returns `200` with `{ data: Level[] }` from `listActiveLevels()`; same try/catch pattern (per `contracts/levels.yaml` GET)
- [ ] T030 [P] [US2] Create `app/classes/_components/ClassTable.tsx` — presentational component that maps a `ClassWithFormTeacher[]` prop to a table (or list) of `level / name / formTeacher.name` rows; no data fetching; reuses the `StateViews` from `001-teachers/T042` for the empty state (per spec FR-008 + quickstart Scenario 1 filled state)
- [ ] T031 [US2] Create `app/classes/page.tsx` — client component that `useEffect` → `fetch("/api/classes")`; renders `<LoadingState>` while in flight, `<EmptyState>` when `data.length === 0`, `<ErrorState>` on failure (preserving the ability to retry), and `<ClassTable data={data} />` on success; shows an entry-point link to `/classes/add` in the empty state (per spec FR-008, FR-009, quickstart Scenarios 1, 3)

**Checkpoint**: At this point, `GET /api/classes` + `GET /api/levels` work end-to-end. The Classes list renders, the empty state appears when the DB is empty, the error state appears on failure. Quickstart Scenarios 1, 3, 10, 11 pass. US1 + US2 together cover the Stage 1 deliverable for the Classes feature.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Update the README with the Classes section, validate the quickstart, and run the final consistency check. Affects both user stories.

- [ ] T032 [P] Update the root `README.md` Classes section (extend T003) — concrete `docker compose -f docker/docker-compose.yml up -d --build` command (already there from 001), add a link to `/classes` and `/classes/add`, document the 6 status codes per FR-010 (`400` validation, `404` teacher not found, `409` duplicate name / teacher already assigned, `415` non-JSON, `500` unhandled, `503` data store), link to the OpenAPI contract files in `specs/002-classes/contracts/`, document the Stage 1 assumptions specific to Classes (no auth, no pagination, ≤ 500 classes, levels are read-only, form teacher is unique, race-safe via `UNIQUE(classes.form_teacher_email)`) (per Constitution "README is a contract" + spec Assumptions)
- [ ] T033 [P] Create `app/classes/_components/ClassForm.test.tsx` (optional but recommended by the spec's "UI components are testable" guidance) — a Vitest + Testing Library test that mounts the form with mocked `fetch` and the teachers / levels fixtures, fills the inputs, submits, and asserts the 201 / 400 / 404 / 409 paths render the right UI
- [ ] T034 [P] Verify the `app/globals.css` from 001 (per Constitution Principle VIII "Simple" — no per-feature CSS) — confirm the Classes pages render with the same base styles; no new CSS rules added
- [ ] T035 Run the full quickstart validation: `docker compose -f docker/docker-compose.yml up -d --build` → execute Scenarios 1–15 from `specs/002-classes/quickstart.md` in order; fix any failures; mark the quickstart as "validated" with a date in the README
- [ ] T036 Run `/speckit-analyze` to verify the cross-artifact consistency across `spec.md`, `plan.md`, and this `tasks.md`; resolve every inconsistency before opening the PR (per Constitution Compliance Review + plan.md "Done When")
- [ ] T037 [P] Verify the Constitution compliance review checklist: no class-based service / controller code in `app/`, `lib/`, or `components/` (only typeORM entity classes); Joi schema exists next to the `Class` entity and mirrors the columns field-for-field; every body-carrying route handler uses `requireJson` and the error envelope; no `.js` source files; the cross-cutting `withApiContract` wrapper from `003-backend-api-db/plan.md` is NOT in scope for 002 (003 owns it) — 002's route handlers use `requireJson` directly (per Constitution Principles II, VI, VII + `002-classes/plan.md` "Code-review rule")

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — the inherited 001 setup must already be in place; tasks here are verifications + README placeholder
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**; the single DataSource extension (T004) is the only blocker
- **User Stories (Phase 3 + 4)**: All depend on Foundational completion
  - US1 and US2 are both P1 and can be worked on in parallel after Phase 2
  - US2 reuses Phase 3 entities, repos, and the shared `app/api/classes/route.ts` (T028 extends T017; T026 extends T014; T027 extends T015)
- **Polish (Phase 5)**: Depends on US1 + US2 completion

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2). Depends on T004 (DataSource), T009/T010 (entities), T011/T012 (migrations), T013/T014/T015/T016 (validation + repos), T017 (POST handler). Independent of US2.
- **User Story 2 (P1)**: Can start after Foundational (Phase 2). Reuses T009 (Class entity), T014 (class repo — extends in T026), T015 (level repo — extends in T027), T017 (route handler — extends in T028). Depends on US1's entities and repos being merged to avoid merge conflicts on the shared files.

### Within Each User Story

- Tests (T006/T007/T008 for US1; T023/T024/T025 for US2) MUST be written and FAIL before implementation
- Entities (T009/T010) before migrations (T011/T012) before validation + repos (T013/T014/T015/T016)
- Validation + repos (T013/T014/T015/T016) before route handlers (T017)
- Shared UI primitives (T018) before feature components (T019/T020/T021)
- Route handlers before pages (T022)
- Story complete before moving to the polish phase

### Parallel Opportunities

Phase 1 — all tasks (T001–T003) can run in parallel; they read different files or do verifications.

Phase 2 — T004 and T005 can run in parallel; T004 edits `lib/db/data-source.ts`, T005 reads `lib/api/response.ts`.

Phase 3 (US1) — within the implementation block:
- T009 ∥ T010 (entities) — different files
- T013 ∥ T014 ∥ T015 ∥ T016 (validation + 3 repos) — different files
- T018 ∥ T019 ∥ T020 ∥ T021 (shared Select + 3 feature components) — different files
- T011 and T012 depend on T009 and T010
- T017 depends on T013, T014, T015, T016
- T019 depends on T020, T021, T018, T017
- T022 depends on T019

Phase 4 (US2) — within the implementation block:
- T023, T024, T025 (tests) all parallelisable
- T026, T027 (repo extensions) parallelisable
- T028, T029 (route handlers) parallelisable
- T030 (presentational) independent
- T031 (page) depends on T028, T029, T030

### Within-Phase Parallelism Example

```bash
# Once Phase 2 (Foundational) completes, launch these US1 tasks in parallel:
Task: "T009 [US1] Create Class entity in lib/db/entities/Class.ts"
Task: "T010 [US1] Create Level entity in lib/db/entities/Level.ts"
Task: "T013 [US1] Create lib/validation/class.ts"
Task: "T014 [US1] Create lib/db/repositories/class.ts"
Task: "T015 [US1] Create lib/db/repositories/level.ts"
Task: "T016 [US1] Extend lib/db/repositories/teacher.ts with findTeacherByEmail"
Task: "T018 [US1] Create components/Select.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only — then add US2)

1. Verify Phase 1 (Setup inherited from 001) — T001–T003
2. Complete Phase 2 (Foundational — DataSource extension) — T004, T005
3. Complete Phase 3: User Story 1 — T006–T022
4. **STOP and VALIDATE**: `docker compose up` → run 001-teachers quickstart to seed a teacher → run 002-classes quickstart Scenarios 1, 2, 4–9, 13 (unit), 14 (integration) pass → `POST /api/classes` works end-to-end
5. Deploy / demo the Add Class flow alone (US1 is the foundational write path; the FK to `teachers` is the only cross-feature surface)

### Incremental Delivery

1. Setup + Foundational → foundation extended
2. Add US1 → test independently → **MVP** (Add Class works, but list is unverified)
3. Add US2 → test independently → Stage 1 deliverable (Add Class + Classes list both work, `GET /api/levels` populates the Level dropdown, `GET /api/teachers` populates the Form Teacher dropdown)
4. Polish → README + quickstart validation + `/speckit-analyze`
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes 001-teachers first (T001–T052 of 001)
2. Once 001 is merged, the shared files (`lib/db/data-source.ts`, `lib/api/*`, `app/globals.css`, the shared `components/FormField.tsx`, `components/Button.tsx`, `components/StateViews.tsx`) must be in place before 002 can start
3. After 001 is merged:
   - Developer A: US1 entities, repos, validation (T009–T016, T018–T021)
   - Developer B: US1 tests (T006, T007, T008) + the migrations (T011, T012) — migrations can land in parallel with the entities as long as the typeORM `Entity` decorators are agreed
4. After US1 lands, US2 can proceed in parallel:
   - Developer A: US2 implementation (T026–T031)
   - Developer B: US2 tests (T023, T024, T025)
5. Stories complete and integrate independently; the `tests/contract/*` and `tests/integration/*` suites catch any contract drift between 001's `teachers` table and 002's `classes.form_teacher_email` FK

---

## Notes

- [P] tasks = different files, no dependencies
- [US1] / [US2] / [US1/US2] labels map each task to its user story for traceability
- Each user story is independently completable and testable
- Tests fail before implementation (red-green-refactor) per Constitution Principle III
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- 002-classes is the **second feature** to land; it adds 0 directories at the project root, 0 new npm dependencies, and reuses the entire 001-teachers Next.js codebase (per `002-classes/plan.md` "Structure Decision")
- The migration set produced by T011/T012 is the **third and fourth** of the four migrations; the timestamps (`1700000000002`, `1700000000003`) place them after the two 001 migrations, which is the order typeORM uses (per `003-backend-api-db/data-model.md` §4)
- The cross-feature `FOREIGN KEY(classes.form_teacher_email → teachers.email)` is the most important 002 deliverable — it makes the "at most one form teacher per teacher" invariant race-safe by construction (per `research.md` §2.3 + SC-004)
- The 002 status-code table adds `404 "Teacher not found"` to the cross-cutting table from 001; this is the only status-code addition 002 makes to the 001 contract (per `002-classes/spec.md` FR-010 and the `003-backend-api-db` Clarifications, Session 2026-06-18, Q3)
- The cross-cutting `withApiContract` wrapper from `003-backend-api-db/plan.md` is **not** in scope for 002-classes (003 owns it); 002's route handlers (T017, T028, T029) use `requireJson` (from `001-teachers/T011`) directly and let unhandled throws become 500s — this is the pre-003 baseline that 003 will consolidate
