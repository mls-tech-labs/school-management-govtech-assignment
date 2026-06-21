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

- [ ] T001 [P] Verify `package.json` (from `001-teachers/T001`) has the dependency set the Classes feature needs: `next@^15`, `react@^19`, `typeorm@^0.3`, `mysql2@^3`, `joi@^17`, `dotenv@^16`, `antd@<pinned>`, `tailwindcss@<pinned>`, `postcss@<pinned>`, `autoprefixer@<pinned>`, `vitest` — no new packages required (reflects the constitution v2.3.0 amendment; SGDS v3 is no longer used)
- [ ] T002 [P] Verify `.env.example` (from `001-teachers/T005`) already documents every env var the Classes feature needs; no additions
- [ ] T003 [P] Update root `README.md` to add a "Classes" section with placeholders for the Add Class / Classes links and the `/api/v1.0/classes` + `/api/v1.0/levels` endpoint references (the implementation sections are filled in at the polish phase T032 + FR-022 for the `/api/v1.0/` version prefix)

---

## Phase 2: Foundational (Inherited + one extension)

**Purpose**: Verify the inherited foundation is in place; extend the typeORM DataSource to register the new `Class` and `Level` entities.

The Classes feature inherits `lib/config.ts`, `lib/api/response.ts`,
`lib/api/content-type.ts`, the `app/layout.tsx`, the docker setup,
and the `app/page.tsx` home redirect — all from 001-teachers. The
only Foundational change is registering the new entities with the
typeORM DataSource so the migrations and repositories can see them.

- [ ] T004 Extend `lib/db/data-source.ts` (from `001-teachers/T009`) — add `Class` and `Level` to the `entities: []` array so the DataSource is aware of them; **no `migrations` array in Stage 1** — the schema is user-prepared against the MySQL container (per FR-016, Session 2026-06-21); the DataSource is `read/write at runtime only`, with no boot-time migration runner
- [ ] T005 Verify `lib/api/response.ts` (from `001-teachers/T010`) exports `jsonError` and `jsonCreated` are sufficient for the Classes POST / GET endpoints; no new helpers needed (per `001-teachers/plan.md` Constitution Check — no class-based service layer, no DTOs)

**Checkpoint**: Foundation extended — user story implementation can now begin.

---

## Phase 3: User Story 1 - Add a New Class with a Form Teacher (Priority: P1) 🎯 MVP

**Goal**: An administrator creates a new class by completing the Add Class form (Level dropdown, Name text, Form Teacher searchable dropdown of existing teachers) and submitting it; the system creates the class, links it to the chosen teacher, and the new class appears in the Classes list (and `POST /api/v1.0/classes` returns `201` with the class JSON).

**Independent Test**: Seed at least one teacher (via `001-teachers` quickstart); submit the Add Class form (or `POST /api/v1.0/classes`) with `level` (an active level from the seed list, sent as the nested `{ ulid, name }` object), `name` (a new unique string), and `formTeacher` (an existing teacher's nested `{ ulid, name }` object, per Clarifications, Session 2026-06-20 (POST/GET reference object shape)); verify `201` is returned, the row is in the `classes` table with the FK to `teachers`, and the class appears in a follow-up `GET /api/v1.0/classes` call with `level` and `formTeacher` resolved as nested `{ ulid, name }` objects.

### Tests for User Story 1 (REQUIRED per Constitution Principle III + spec SC-001..SC-006) ⚠️

> **NOTE**: Write these tests FIRST; they should FAIL (red) before the implementation tasks below. Each test file maps to one or more quickstart scenarios.

- [ ] T006 [P] [US1] Contract test: `POST /api/v1.0/classes` happy path (201) + missing field (400) + malformed `formTeacher.ulid` (400) + unknown `level.ulid` (400) + unknown `formTeacher.ulid` (404) + duplicate class name (409) + teacher already assigned (409) + non-JSON content type (415) in `tests/contract/classes.api.spec.ts` — both `level` and `formTeacher` are nested `{ ulid, name }` reference objects per Clarifications, Session 2026-06-20 (POST/GET reference object shape); the wire-format `level.ulid` is resolved against `uq_levels_ulid`, the wire-format `formTeacher.ulid` is resolved against `uq_teachers_ulid` (covers quickstart Scenarios 2, 4, 5, 6, 7, 8, 9)
- [ ] T007 [P] [US1] Integration test: `POST /api/v1.0/classes` against the live MySQL container — same matrix as T006 plus SC-004 race-safety (10 concurrent POSTs with the same `formTeacher.ulid` → exactly one 201 + nine 409s "Teacher already assigned") in `tests/integration/classes.api.spec.ts` (covers quickstart Scenarios 7, 8, 12, 14)
- [ ] T008 [P] [US1] Unit test: `buildCreateClassSchema()` Joi schema — happy path + every rejection path (missing `level`, unknown `level.ulid`, inactive level, missing name, empty name, name > 255, missing `formTeacher`, malformed `formTeacher.ulid`, `formTeacher.ulid` not in `uq_teachers_ulid`) in `tests/unit/class.validation.spec.ts` — `level` and `formTeacher` are nested `Joi.object({ ulid, name })` per Clarifications, Session 2026-06-20 (POST/GET reference object shape); the nested `name` field is optional and ignored server-side (covers quickstart Scenarios 5, 6, 7)

### Implementation for User Story 1

- [ ] T009 [P] [US1] Create `lib/db/entities/Class.ts` — typeORM `@Entity("classes")` class with `@PrimaryGeneratedColumn({ type: "bigint", unsigned: true })` `id` (surrogate PK, hidden from Stage 1 API response per spec Clarifications Q5), `@ManyToOne(() => Level)` with `@JoinColumn({ name: "level_id", referencedColumnName: "id" })`, `@Column({ unique: true })` `name VARCHAR(255) NOT NULL`, `@ManyToOne(() => Teacher)` with `@JoinColumn({ name: "form_teacher_id", referencedColumnName: "id" })`, the five audit columns (`created_at`, `created_by`, `modified_at`, `modified_by`, `version`) with `@CreateDateColumn`, `@UpdateDateColumn`, `@VersionColumn`; `@Index("uq_classes_name", ["name"], { unique: true })`, `@Index("uq_classes_form_teacher", ["formTeacherId"], { unique: true })` (per `data-model.md` §2 + `003-backend-api-db/spec.md` FR-018/FR-019 — Session 2026-06-19 audit-columns clarification)
- [ ] T010 [P] [US1] Create `lib/db/entities/Level.ts` — typeORM `@Entity("levels")` class with `@PrimaryGeneratedColumn({ type: "bigint", unsigned: true })` `id` (surrogate PK), `@Column({ unique: true })` `name VARCHAR(64) NOT NULL` (natural key preserved as `UNIQUE NOT NULL`), `@Column({ default: true })` `active BOOLEAN`, and the five audit columns with the same decorators as T009 (per `data-model.md` §1 + FR-018/FR-019; mirrors `Subject` from 001)
- [ ] ~~T011 [US1] Create migration `lib/db/migrations/1700000000002-InitClasses.ts`~~ — **REMOVED in Stage 1** (per FR-016, Session 2026-06-21). The DDL is now created by the user against the user-prepared MySQL container (mirrored in `docker/mysql/init/01-schema-and-seed.sql`); the `lib/db/migrations/` directory is out of Stage 1 scope. The migration history is preserved in `data-model.md` §8 ("Migration inventory — legacy") for reference only.
- [ ] ~~T012 [US1] Create migration `lib/db/migrations/1700000000003-SeedLevels.ts`~~ — **REMOVED in Stage 1** (per FR-016, Session 2026-06-21). The 10-row `levels` seed list is inserted by the user against the user-prepared MySQL container; no `SeedLevels` migration is run on app boot. The original FR-017 (second-migration seed pattern) is also deleted from `003-backend-api-db/spec.md`.
- [ ] T013 [P] [US1] Create `lib/validation/class.ts` — `buildCreateClassSchema()` factory: at call time, `await getActiveLevelUlids()` (T015) and `await getActiveTeacherUlids()` (re-exposed by T016 via the existing `lib/db/repositories/teacher.ts` — sibling method to `findTeacherByUlid`), return a `Joi.object({ level: Joi.object({ ulid: Joi.string().length(26).valid(...activeLevelUlids).required(), name: Joi.string().min(1).max(64).optional() }).required(), name: Joi.string().trim().min(1).max(255).required(), formTeacher: Joi.object({ ulid: Joi.string().length(26).valid(...activeTeacherUlids).required(), name: Joi.string().min(1).max(64).optional() }).required() })` with `additionalProperties: false` — both `level` and `formTeacher` are nested `{ ulid, name }` reference objects per Clarifications, Session 2026-06-20 (POST/GET reference object shape); the nested `name` field is optional and is ignored server-side (the lookup is `ulid`-only) (per `data-model.md` §2 "Joi schema" + FR-019/FR-020/FR-021)
- [ ] T014 [P] [US1] Create `lib/db/repositories/class.ts` — pure-function helpers around the typeORM Repository: `createClass(input)` (resolves the wire-format `level.ulid` → `level_id` via `findLevelByUlid` (T015) and `formTeacher.ulid` → `form_teacher_id` via `findTeacherByUlid` (T016) before insert — the nested `level.name` and `formTeacher.name` are ignored server-side, per Clarifications, Session 2026-06-20 (POST/GET reference object shape); catches `QueryFailedError` `ER_DUP_ENTRY` and re-throws a tagged `DuplicateClassNameError` (on `uq_classes_name`) or `TeacherAlreadyAssignedError` (on `uq_classes_form_teacher`) based on the index name, for the route handler), `findClassByName(name)`, `listClassesWithFormTeacher()` (the JOIN query — see T026), `findClassByFormTeacherId(formTeacherId)` (per `data-model.md` §2 + `003-backend-api-db/research.md` §3.6 + FR-019/FR-020/FR-021)
- [ ] T015 [P] [US1] Create `lib/db/repositories/level.ts` — pure-function helpers: `getActiveLevelUlids()` (returns `string[]` of 26-char ULIDs — used by T013's Joi factory to validate `level.ulid` against `uq_levels_ulid`), `listActiveLevels()` (returns `Level[]` for the UI dropdown and the GET endpoint), `findLevelByUlid(ulid)` (returns `Level | null` — resolves the public-API `level.ulid` field to `levels.id` for the FK insert, per Clarifications, Session 2026-06-20 (POST/GET reference object shape)); used by T013 (Joi factory), T014 (Class create), and by US2 (GET endpoint) (per `data-model.md` §1 + FR-019/FR-021)
- [ ] T016 [P] [US1] Extend `lib/db/repositories/teacher.ts` (from `001-teachers/T026`) with `findTeacherByUlid(ulid)` — the pre-INSERT check that resolves the wire-format `formTeacher.ulid` → `teachers.id` so the route handler can return `404 "Teacher not found"` for an unknown ulid before attempting the insert (the FK `fk_classes_form_teacher` is the backstop for the race window per FR-019); also expose `getActiveTeacherUlids()` for T013's Joi factory; returns `Teacher | null` (per `research.md` §2.2 + FR-019/FR-021 + Clarifications, Session 2026-06-20)
- [ ] T017 [US1] Create `app/api/v1.0/classes/route.ts` — `POST` handler (under the `/api/v1.0/` version prefix per FR-022, Session 2026-06-21) that: (1) calls `requireJson(req)` (415 short-circuit), (2) awaits `buildCreateClassSchema()` and validates `await req.json()` (400 on error), (3) calls `findTeacherByUlid(value.formTeacher.ulid)` and returns `404 "Teacher not found"` if null (this also gives the handler the `teachers.id` to pass as `form_teacher_id` per FR-019; the nested `formTeacher.name` is ignored server-side per Clarifications, Session 2026-06-20), (4) calls `createClass(value)` inside a try/catch that maps `DuplicateClassNameError → 409 "Class name already in use"`, `TeacherAlreadyAssignedError → 409 "Teacher already assigned"`, FK violations on `fk_classes_form_teacher` → `404 "Teacher not found"` (race), and unhandled throws to the global 500 handler; returns `201` with the class JSON on success — the response shape is `{ "ulid", "level": { "ulid", "name" }, "name", "formTeacher": { "ulid", "name" } }` per FR-020/FR-021 + Clarifications, Session 2026-06-20 (per `contracts/classes.yaml` POST + `research.md` §2.2 "Route-handler sketch" + FR-019/FR-020/FR-021/FR-022)
- [ ] T018 [P] [US1] Create `components/Select.tsx` — shared, feature-agnostic `<Select label name options value onChange required error>` that wraps the **Ant Design (`antd`)** `<Select>` primitive and is styled with **Tailwind CSS** utility classes; `options` is `{ value, label }[]`; no feature-specific hard-coding (per `plan.md` Project Structure + Constitution v2.3.0 Principle VIII "Reusable")
- [ ] T019 [P] [US1] Create `app/classes/_components/ClassForm.tsx` — client component with the three controls (`LevelSelect`, `FormField` for Name, `FormTeacherSelect`), a Submit `Button` (disabled when `teachers.length === 0` with a clear "Add a teacher first" message linking to `/teachers/add`), and a `useState` for `{ level: { ulid, name }, name, formTeacher: { ulid, name }, errors, submitting }` — `level` and `formTeacher` are nested `{ ulid, name }` objects per Clarifications, Session 2026-06-20 (POST/GET reference object shape); the Level and Form Teacher dropdowns submit the selected row's `ulid` and store `{ ulid, name }` in state (the `name` is the dropdown label); on submit, calls `fetch("/api/v1.0/classes", { method: "POST", ... })` with the state JSON (the `/api/v1.0/` version prefix per FR-022); on `400`, parses the error message and surfaces it on the matching field; on `404`, surfaces a form-level "Teacher not found" error (suggests the teacher was deleted); on `409`, surfaces a form-level error with the specific message; on `201`, `router.push("/classes")`; on `5xx` / network error, surfaces a form-level error and **preserves all input** (per spec FR-001, FR-005b, FR-011, Edge Case §3, quickstart Scenarios 1, 4, 7, 8 + Clarifications, Session 2026-06-20)
- [ ] T020 [P] [US1] Create `app/classes/_components/FormTeacherSelect.tsx` — a searchable dropdown of existing teachers that wraps the shared `Select`; props: `teachers: Teacher[]`, `value`, `onChange`; options are derived from `teachers.map(t => ({ value: t.ulid, label: t.name }))` — the dropdown submits the selected teacher's `ulid` (the server-side lookup key per Clarifications, Session 2026-06-20 (POST/GET reference object shape)) and the displayed label is the teacher's `name`; shows "No teachers registered" empty state when `teachers.length === 0` (per spec FR-001, FR-005b + Clarifications Q2 — searchable dropdown)
- [ ] T021 [P] [US1] Create `app/classes/_components/LevelSelect.tsx` — a non-searchable dropdown that wraps the shared `Select`; props: `levels: Level[]`, `value`, `onChange`; options are `levels.map(l => ({ value: l.ulid, label: l.name }))` — the dropdown submits the selected level's `ulid` (the server-side lookup key per Clarifications, Session 2026-06-20 (POST/GET reference object shape)) and the displayed label is the level's `name`; rejects inactive levels (the Joi factory already filters by `active = true`; this component just renders the active list) (per spec FR-005a + Clarifications Q1)
- [ ] T022 [US1] Create `app/classes/add/page.tsx` — client component that on mount fetches both `GET /api/v1.0/levels` and `GET /api/v1.0/teachers` in parallel (the `/api/v1.0/` version prefix per FR-022); while in flight shows a `<LoadingState>`; on success renders `<ClassForm levels={levels} teachers={teachers} />`; on either fetch's failure shows an `<ErrorState>` with retry (per spec FR-001 + quickstart Scenario 1)

**Checkpoint**: At this point, `POST /api/v1.0/classes` works end-to-end (under the `/api/v1.0/` version prefix per FR-022, Session 2026-06-21). The Add Class form renders, validates against the active levels list, checks the form teacher exists, and inserts the class with the FK. Quickstart Scenarios 1, 2, 4–9, 13 (unit), 14 (integration) pass.

---

## Phase 4: User Story 2 - Retrieve the List of Classes (Priority: P1)

**Goal**: An administrator navigates to the Classes screen and sees the complete list of classes (or the empty state) with each entry showing `level`, `name`, and `formTeacher.name`; the data comes from `GET /api/v1.0/classes` (one `JOIN` query against `teachers`) and the Level dropdown data from `GET /api/v1.0/levels` (the `/api/v1.0/` version prefix per FR-022, Session 2026-06-21).

**Independent Test**: Seed N classes (or use the result of US1), open `/classes`, verify every class is listed with all three fields and the resolved form-teacher name; verify the empty state when zero classes exist; verify the loading and error states. The `GET /api/v1.0/classes` endpoint must return `200` with `{ "data": [...] }` (no `id` field per spec Clarifications Q5; each entry carries a `ulid` per FR-021) and the `GET /api/v1.0/levels` endpoint must return `200` with the seeded list (each entry carries a `ulid` per FR-021).

### Tests for User Story 2 (REQUIRED per Constitution Principle III + spec SC-005, SC-006) ⚠️

- [ ] T023 [P] [US2] Contract test: `GET /api/v1.0/classes` (under the `/api/v1.0/` version prefix per FR-022) — empty list (200 + `{ data: [] }`), filled list (200 + array with `formTeacher.name` resolved), `500`, `503` in `tests/contract/classes-list.api.spec.ts` (covers quickstart Scenarios 3, 10)
- [ ] T024 [P] [US2] Contract test: `GET /api/v1.0/levels` (under the `/api/v1.0/` version prefix per FR-022) — seeded list (200 + 10 entries), empty list (200 + `{ data: [] }`) in `tests/contract/levels.api.spec.ts` (covers quickstart Scenario 10 + FR-005a)
- [ ] T025 [P] [US2] Integration test: `GET /api/v1.0/classes` (under the `/api/v1.0/` version prefix per FR-022) — after seeding N classes (covers quickstart Scenarios 3, 11) and after a server restart (verifies SC-005) in `tests/integration/classes-list.api.spec.ts`

### Implementation for User Story 2

- [ ] T026 [US1/US2] Extend `lib/db/repositories/class.ts` (T014) with `listClassesWithFormTeacher()` — one `JOIN` query: `SELECT c.ulid, c.name, l.ulid AS level_ulid, l.name AS level_name, t.ulid AS form_teacher_ulid, t.name AS form_teacher_name FROM classes c JOIN levels l ON c.level_id = l.id JOIN teachers t ON c.form_teacher_id = t.id ORDER BY l.name, c.name`; use `createQueryBuilder` with `innerJoinAndSelect("c.formTeacher", "t").innerJoinAndSelect("c.levelRef", "l")` (in Stage 1 every class has both a level and a form teacher, so INNER is correct on both joins); the `toJSON` mapping exposes `ulid` per FR-021, resolves `level_id` → `level` as a nested `{ ulid, name }` object (via `levelRef.ulid` and `levelRef.name`) and `form_teacher_id` → `formTeacher` as a nested `{ ulid, name }` object (via `formTeacher.ulid` and `formTeacher.name`) so the response shape stays `{ "ulid", "level": { "ulid", "name" }, "name", "formTeacher": { "ulid", "name" } }` per FR-020/FR-021 + Clarifications, Session 2026-06-20 (POST/GET reference object shape); returns `ClassWithFormTeacher[]` with the surrogate `id` and the audit columns stripped from the JSON shape (per `research.md` §2.6 "GET /api/v1.0/classes join strategy" + FR-019/FR-020/FR-021/FR-022)
- [ ] T027 [US1/US2] Extend `lib/db/repositories/level.ts` (T015) with `listActiveLevels()` — `SELECT * FROM levels WHERE active = true`; returns `Level[]` (per `data-model.md` §1)
- [ ] T028 [US2] Create `app/api/v1.0/classes/route.ts` `GET` handler (extend T017, under the `/api/v1.0/` version prefix per FR-022) — returns `200` with `{ data: ClassWithFormTeacher[] }` from `listClassesWithFormTeacher()`; the `id` column is intentionally NOT in the response (per spec Clarifications Q5); each entry carries a `ulid` per FR-021; wraps in try/catch for 500/503 (per `contracts/classes.yaml` GET)
- [ ] T029 [US2] Create `app/api/v1.0/levels/route.ts` — `GET` handler (under the `/api/v1.0/` version prefix per FR-022) that returns `200` with `{ data: Level[] }` from `listActiveLevels()`; each entry carries a `ulid` per FR-021; same try/catch pattern (per `contracts/levels.yaml` GET)
- [ ] T030 [P] [US2] Create `app/classes/_components/ClassTable.tsx` — presentational component that maps a `ClassWithFormTeacher[]` prop to a table (or list) of `level / name / formTeacher.name` rows; no data fetching; reuses the `StateViews` from `001-teachers/T042` for the empty state (per spec FR-008 + quickstart Scenario 1 filled state)
- [ ] T031 [US2] Create `app/classes/page.tsx` — client component that `useEffect` → `fetch("/api/v1.0/classes")` (the `/api/v1.0/` version prefix per FR-022); renders `<LoadingState>` while in flight, `<EmptyState>` when `data.length === 0`, `<ErrorState>` on failure (preserving the ability to retry), and `<ClassTable data={data} />` on success; shows an entry-point link to `/classes/add` in the empty state (per spec FR-008, FR-009, quickstart Scenarios 1, 3)

**Checkpoint**: At this point, `GET /api/v1.0/classes` + `GET /api/v1.0/levels` work end-to-end (under the `/api/v1.0/` version prefix per FR-022, Session 2026-06-21). The Classes list renders, the empty state appears when the DB is empty, the error state appears on failure. Quickstart Scenarios 1, 3, 10, 11 pass. US1 + US2 together cover the Stage 1 deliverable for the Classes feature.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Update the README with the Classes section, validate the quickstart, and run the final consistency check. Affects both user stories.

- [ ] T032 [P] Update the root `README.md` Classes section (extend T003) — concrete `docker compose -f docker/docker-compose.yml up -d --build app` command (the user-prepared MySQL contract per FR-016 — there is no migration step on boot), add a link to `/classes` and `/classes/add`, document the 6 status codes per FR-010 (`400` validation, `404` teacher not found, `409` duplicate name / teacher already assigned, `415` non-JSON, `500` unhandled, `503` data store), link to the OpenAPI contract files in `specs/002-classes/contracts/`, document the Stage 1 assumptions specific to Classes (no auth, no pagination, ≤ 500 classes, levels are read-only, form teacher is unique, race-safe via `UNIQUE(classes.form_teacher_id)` — the wire-format `level` and `formTeacher` are nested `{ ulid, name }` reference objects per Clarifications, Session 2026-06-20 (POST/GET reference object shape); `level.ulid` is resolved to `level_id` and `formTeacher.ulid` is resolved to `form_teacher_id` by the route handler per `003-backend-api-db/spec.md` FR-019 (the nested `name` fields are display hints and are ignored server-side); all endpoints live under `/api/v1.0/` per FR-022; the `ulid` row handle is exposed in every response per FR-021) (per Constitution "README is a contract" + spec Assumptions)
- [ ] T033 [P] Create `app/classes/_components/ClassForm.test.tsx` (optional but recommended by the spec's "UI components are testable" guidance) — a Vitest + Testing Library test that mounts the form with mocked `fetch` and the teachers / levels fixtures, fills the inputs, submits, and asserts the 201 / 400 / 404 / 409 paths render the right UI
- [ ] T034 [P] Verify the `app/globals.css` from 001 (per Constitution Principle VIII "Simple" — no per-feature CSS) — confirm the Classes pages render with the same base styles; no new CSS rules added
- [ ] T035 Run the full quickstart validation: `docker compose -f docker/docker-compose.yml up -d --build` → execute Scenarios 1–15 from `specs/002-classes/quickstart.md` in order; fix any failures; mark the quickstart as "validated" with a date in the README
- [ ] T036 Run `/speckit-analyze` to verify the cross-artifact consistency across `spec.md`, `plan.md`, and this `tasks.md`; resolve every inconsistency before opening the PR (per Constitution Compliance Review + plan.md "Done When")
- [ ] T036a [P] **Audit-columns verification** (per `spec.md` FR-013 — Session 2026-06-19 audit-columns clarification; cross-references `003-backend-api-db/spec.md` FR-018 / FR-019 / FR-020 and `003-backend-api-db/tasks.md` T024a, with `001-teachers/tasks.md` T052a owning the upstream teacher/subject audit-columns verification) — the upstream tasks T009, T010, T014–T017, T026 already create `lib/db/entities/Class.ts`, `lib/db/entities/Level.ts`, the user-prepared MySQL schema (audit columns, FKs, UNIQUE indexes, `ulid CHAR(26) UNIQUE` per FR-021 — no migration files per FR-016, Session 2026-06-21), and the class / level / teacher repositories with the full audit-columns pattern (id PK, `level_id` and `form_teacher_id` FKs referencing `levels.id` and `teachers.id`, six audit columns, natural-key `UNIQUE NOT NULL`, route-handler email → id resolution) so no entity / schema / repo updates are required by this task. **This task verifies** that the implementation produced by the upstream tasks matches `docker/mysql/init/01-schema-and-seed.sql` and `data-model.md` §5, and **adds** an integration test asserting that the Stage 1 public API responses continue to expose `ulid`, `level`, `name`, and `formTeacher.name` (and do NOT contain `id`, `created_at`, `created_by`, `modified_at`, `modified_by`, or `version`) per FR-020/FR-021. Extend T006 / T007 / T023 / T025 with the response-shape assertion.
- [ ] T037 [P] Verify the Constitution compliance review checklist (per Constitution Principles II, VI, VII, **VIII** + `002-classes/plan.md` "Code-review rule"):
  - **II. TypeScript End-to-End**: `strict: true` is on in `tsconfig.json`; no `.js` source files
  - **VI. Functional-First**: no class-based service / controller code in `app/`, `lib/`, or `components/` (only the typeORM entity classes are allowed); React code is function components + hooks
  - **VII. Joi Schema Validation**: a Joi schema exists next to the `Class` entity and mirrors the columns field-for-field; every body-carrying route handler uses `requireJson` and the error envelope
  - **VIII. UI Quality — Self-Explanatory, Reusable, Simple**: every UI component composes from `antd` primitives; all visual presentation is expressed via Tailwind utility classes in JSX `className`; the new `components/Select.tsx` (T018) wraps `antd` `Select` with `showSearch` and is styled with Tailwind classes; the Form Teacher searchable dropdown is built on the shared `Select` (no feature-specific hard-coding); the shared `FormField` / `Button` / `StateViews` from `001-teachers` are reused as-is; the cross-cutting `withApiContract` wrapper from `003-backend-api-db/plan.md` is NOT in scope for 002 (003 owns it) — 002's route handlers use `requireJson` directly; all Stage 1 endpoints live under the `/api/v1.0/` version prefix per FR-022

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — the inherited 001 setup must already be in place; tasks here are verifications + README placeholder
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**; the single DataSource extension (T004) is the only blocker
- **User Stories (Phase 3 + 4)**: All depend on Foundational completion
  - US1 and US2 are both P1 and can be worked on in parallel after Phase 2
  - US2 reuses Phase 3 entities, repos, and the shared `app/api/v1.0/classes/route.ts` (T028 extends T017; T026 extends T014; T027 extends T015) — the `/api/v1.0/` version prefix per FR-022, Session 2026-06-21
- **Polish (Phase 5)**: Depends on US1 + US2 completion

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2). Depends on T004 (DataSource), T009/T010 (entities), T013/T014/T015/T016 (validation + repos), T017 (POST handler). The previous T011/T012 migration tasks are REMOVED in Stage 1 (per FR-016, Session 2026-06-21); the MySQL schema is user-prepared. Independent of US2.
- **User Story 2 (P1)**: Can start after Foundational (Phase 2). Reuses T009 (Class entity), T014 (class repo — extends in T026), T015 (level repo — extends in T027), T017 (route handler — extends in T028). Depends on US1's entities and repos being merged to avoid merge conflicts on the shared files.

### Within Each User Story

- Tests (T006/T007/T008 for US1; T023/T024/T025 for US2) MUST be written and FAIL before implementation
- Entities (T009/T010) before validation + repos (T013/T014/T015/T016). The previous migrations-before-validation rule (T011/T012) is REMOVED in Stage 1 per FR-016 — the schema is user-prepared, no migration files in `lib/db/migrations/`.
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
- T011 and T012 are REMOVED in Stage 1 (per FR-016, Session 2026-06-21); the MySQL schema is user-prepared
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
Task: "T016 [US1] Extend lib/db/repositories/teacher.ts with findTeacherByUlid (and getActiveTeacherUlids)"
Task: "T018 [US1] Create components/Select.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only — then add US2)

1. Verify Phase 1 (Setup inherited from 001) — T001–T003
2. Complete Phase 2 (Foundational — DataSource extension) — T004, T005
3. Complete Phase 3: User Story 1 — T006–T022
4. **STOP and VALIDATE**: `docker compose up` (with the user-prepared MySQL container per FR-016) → run 001-teachers quickstart to seed a teacher → run 002-classes quickstart Scenarios 1, 2, 4–9, 13 (unit), 14 (integration) pass → `POST /api/v1.0/classes` works end-to-end (under the `/api/v1.0/` version prefix per FR-022)
5. Deploy / demo the Add Class flow alone (US1 is the foundational write path; the FK to `teachers` is the only cross-feature surface)

### Incremental Delivery

1. Setup + Foundational → foundation extended
2. Add US1 → test independently → **MVP** (Add Class works, but list is unverified)
3. Add US2 → test independently → Stage 1 deliverable (Add Class + Classes list both work, `GET /api/v1.0/levels` populates the Level dropdown, `GET /api/v1.0/teachers` populates the Form Teacher dropdown — all under the `/api/v1.0/` version prefix per FR-022, Session 2026-06-21)
4. Polish → README + quickstart validation + `/speckit-analyze`
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes 001-teachers first (T001–T052 of 001)
2. Once 001 is merged, the shared files (`lib/db/data-source.ts`, `lib/api/*`, `app/globals.css`, the shared `components/FormField.tsx`, `components/Button.tsx`, `components/StateViews.tsx`) must be in place before 002 can start
3. After 001 is merged:
   - Developer A: US1 entities, repos, validation (T009, T010, T013–T016, T018–T021)
   - Developer B: US1 tests (T006, T007, T008). T011 and T012 are REMOVED in Stage 1 (per FR-016, Session 2026-06-21) — the MySQL schema is user-prepared, no migration files are in `lib/db/migrations/`
4. After US1 lands, US2 can proceed in parallel:
   - Developer A: US2 implementation (T026–T031)
   - Developer B: US2 tests (T023, T024, T025)
5. Stories complete and integrate independently; the `tests/contract/*` and `tests/integration/*` suites catch any contract drift between 001's `teachers` table and 002's `classes.form_teacher_id` FK (which references `teachers.id`, per `003-backend-api-db/spec.md` FR-019)

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
- The cross-feature `FOREIGN KEY(classes.form_teacher_id → teachers.id)` is the most important 002 deliverable — it makes the "at most one form teacher per teacher" invariant race-safe by construction (per `research.md` §2.3 + SC-004 + `003-backend-api-db/spec.md` FR-019)
- The 002 status-code table adds `404 "Teacher not found"` to the cross-cutting table from 001; this is the only status-code addition 002 makes to the 001 contract (per `002-classes/spec.md` FR-010 and the `003-backend-api-db` Clarifications, Session 2026-06-18, Q3)
- The cross-cutting `withApiContract` wrapper from `003-backend-api-db/plan.md` is **not** in scope for 002-classes (003 owns it); 002's route handlers (T017, T028, T029) use `requireJson` (from `001-teachers/T011`) directly and let unhandled throws become 500s — this is the pre-003 baseline that 003 will consolidate
