# Tasks: Teachers

**Input**: Design documents from `/specs/001-teachers/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Branch**: `001-teachers` | **Date**: 2026-06-18

**Tests**: Constitution Principle III (Unit Tests Required) + spec success criteria SC-001..SC-005 mandate tests at every layer. Test tasks are included in each user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependency manifest, config files, repo hygiene.

- [ ] T001 Create `package.json` with the runtime + dev dependency set per `plan.md` Technical Context (`next@^15`, `react@^19`, `react-dom@^19`, `typeorm@^0.3`, `mysql2@^3`, `joi@^17`, `dotenv@^16`, `antd@<pinned>`, `tailwindcss@<pinned>`, `postcss@<pinned>`, `autoprefixer@<pinned>`, `vitest`, `typescript@^5`) — reflects the constitution v2.3.0 swap (SGDS v3 → Ant Design + Tailwind CSS); see [research.md §1.3](./research.md#13-ui-library-and-styling-version-pin-ant-design--tailwind-css)
- [ ] T002 [P] Create `tsconfig.json` with `strict: true`, `moduleResolution: "bundler"`, path aliases for `@/*`, and the Next.js + React JSX settings (per `plan.md` Project Structure)
- [ ] T003 [P] Create `next.config.mjs` that enables the App Router and TypeScript strict mode (per `plan.md` Project Structure)
- [ ] T004 [P] Create `vitest.config.ts` that discovers `tests/unit/**/*.spec.ts`, `tests/contract/**/*.spec.ts`, `tests/integration/**/*.spec.ts`, and points the integration tier at the test MySQL container env vars
- [ ] T005 [P] Create `.env.example` documenting every env var (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `MYSQL_ROOT_PASSWORD`, `PORT`); create `.env.local` (gitignored) for local dev credentials; leave the existing JSON `.env` (model config) untouched (per `CLAUDE.md` Environment + Constitution Secrets)
- [ ] T006 [P] Create `.gitignore` that excludes `node_modules/`, `.next/`, `coverage/`, `.env.local`, `*.log`, `dist/`, and the `docker/mysql/data/` volume
- [ ] T007 [P] Create the root `README.md` per the Constitution's "README is a contract" rule — clear `docker compose up` instructions, assumptions, link to API spec; leave the implementation sections as `TBD` placeholders that the polish phase fills in

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented. No user story work can begin until this phase is complete.

- [ ] T008 Create `lib/config.ts` — pure-function env loader that reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT` from `process.env` and validates them with a Joi schema at module load (per `001-teachers/plan.md` Project Structure)
- [ ] T009 Create `lib/db/data-source.ts` — the typeORM `DataSource` singleton: `mysql2` driver, `entities: [Teacher, Subject]`, `synchronize: false`; **no `migrations` runner** (the schema is user-prepared per FR-016, Session 2026-06-21); export a `getDataSource()` lazy initialiser (per `plan.md` Project Structure + `research.md` §1.4)
- [ ] T010 Create `lib/api/response.ts` — pure-function helpers: `errorEnvelope(message)`, `jsonError(status, message)`, `jsonOk(status, body)`, `jsonCreated(body)`. No class, no DI; each is a 1–3 line function returning a `Response` (per `plan.md` Project Structure + `research.md` §1.5)
- [ ] T011 Create `lib/api/content-type.ts` — `requireJson(req)` that returns a `415` response if `req.headers.get("content-type")` is not `application/json`, or `null` if it is. Pure function, no class (per `003-backend-api-db/research.md` §3.3 — this is the gate that `003` propagates)
- [ ] T012 Create `app/layout.tsx` — root layout that imports `antd/dist/reset.css` and the Tailwind-compiled `app/globals.css`, wraps the tree in `<ConfigProvider>` (per Constitution v2.3.0 + [research.md §1.3](./research.md#13-ui-library-and-styling-version-pin-ant-design--tailwind-css)), sets `<html lang="en">`, and renders `{children}`
- [ ] T012a [P] Create `tailwind.config.ts` + `postcss.config.mjs` — declare `content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"]` and the project token set (colour palette, font stack, breakpoints, spacing scale) per Constitution v2.3.0 Styling constraint
- [ ] T013 Update `app/globals.css` to include the Tailwind directives (`@tailwind base; @tailwind components; @tailwind utilities;`) at the top, then minimal global styles (body font, container max-width, focus ring); no per-feature styles
- [ ] T014 Create `app/page.tsx` — the home page: a client component that `useEffect` → `router.replace("/teachers")`
- [ ] T015 Create `docker/Dockerfile` — multi-stage build: `node:20-alpine` builder that runs `npm ci && npm run build`, then a slim runtime stage that copies `.next/standalone` and runs `node server.js` (per `research.md` §1.2 — docker-compose layout, not a single image)
- [ ] T016 Create `docker/docker-compose.yml` — two services: `mysql` (`mysql:8.0` with a named volume and `MYSQL_ROOT_PASSWORD` from env; **no migration step on boot** — the schema is user-prepared per FR-016, Session 2026-06-21), `app` (built from `Dockerfile`, depends on `mysql:healthcheck`, runs `npm start`); expose `app:3000` to the host (per `research.md` §1.2)
- [ ] T017 Create `docker/docker-compose.test.yml` — one service: `mysql` (same image, different container name + port `3307` + a separate volume) for the integration test suite

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Register a Teacher (Priority: P1) 🎯 MVP

**Goal**: An administrator adds a new teacher by completing the Add Teacher form (Name, Subject dropdown, Email, Contact Number) and submitting it; the system records the teacher and the new entry is visible in the Teachers list (and the `POST /api/v1.0/teachers` endpoint returns `201` with the teacher JSON — the `/api/v1.0/` version prefix is owned by 003-backend-api-db, per FR-022, Session 2026-06-21).

**Independent Test**: Submit the Add Teacher form (or `POST /api/v1.0/teachers`) with valid data; verify `201` is returned, the row is in the `teachers` table, and the teacher appears in a follow-up `GET /api/v1.0/teachers` call. Tests must run end-to-end against the `app + MySQL` Docker stack AND in isolation via the contract / unit / integration tiers.

### Tests for User Story 1 (REQUIRED per Constitution Principle III + spec SC-001..SC-005) ⚠️

> **NOTE**: Write these tests FIRST; they should FAIL (red) before the implementation tasks below. Each test file maps to one or more quickstart scenarios.

- [ ] T018 [P] [US1] Contract test: `POST /api/v1.0/teachers` happy path (201) + missing field (400) + invalid email (400) + invalid contact number (400) + unknown subject (400) + duplicate email (409) + non-JSON content type (415) in `tests/contract/teachers.api.spec.ts` (covers quickstart Scenarios 2, 4, 5, 6, 7, 8, 9)
- [ ] T019 [P] [US1] Integration test: `POST /api/v1.0/teachers` against the live MySQL container — same matrix as T018 plus SC-006 race-safety (10 concurrent POSTs with the same email → exactly one 201 + nine 409s) in `tests/integration/teachers.api.spec.ts` (covers quickstart Scenarios 8, 12, 14)
- [ ] T020 [P] [US1] Unit test: `buildCreateTeacherSchema()` Joi schema — happy path + every rejection path (missing name, missing subject, unknown subject, missing email, invalid email, missing contact number, contact length ≠ 8 digits, contact with non-digit characters, extra unknown field) in `tests/unit/teacher.validation.spec.ts` (covers quickstart Scenario 4-7, 8 — the contact regex is `/^\d{8}$/` per FR-004, Session 2026-06-21; there is NO leading-digit restriction in Stage 1)

### Implementation for User Story 1

- [ ] T021 [P] [US1] Create `lib/db/entities/Teacher.ts` — typeORM `@Entity("teachers")` class with `@PrimaryGeneratedColumn({ type: "bigint", unsigned: true })` `id` (surrogate PK), `@Column` `name VARCHAR(255) NOT NULL`, `@ManyToOne(() => Subject)` with `@JoinColumn({ name: "subject_id", referencedColumnName: "id" })`, `@Column({ unique: true })` `email VARCHAR(254) NOT NULL`, `@Column({ name: "contact_number", type: "char", length: 8 })` `contactNumber NOT NULL`, and the five audit columns (`created_at`, `created_by`, `modified_at`, `modified_by`, `version`) with `@CreateDateColumn`, `@UpdateDateColumn`, `@VersionColumn`; `@Index("uq_teachers_email", ["email"], { unique: true })` (per `data-model.md` §"teachers" entity + `003-backend-api-db/spec.md` FR-018/FR-019 — Session 2026-06-19 audit-columns clarification)
- [ ] T022 [P] [US1] Create `lib/db/entities/Subject.ts` — typeORM `@Entity("subjects")` class with `@PrimaryGeneratedColumn({ type: "bigint", unsigned: true })` `id` (surrogate PK), `@Column({ unique: true })` `name VARCHAR(64) NOT NULL` (natural key preserved as `UNIQUE NOT NULL`), `@Column({ default: true })` `active BOOLEAN`, and the five audit columns with the same decorators as T021 (per `data-model.md` §"subjects" entity + FR-018/FR-019)
- [ ] T023 [US1] ~~Create migration `lib/db/migrations/1700000000000-InitSchema.ts`~~ **REMOVED in Stage 1** (per FR-016, Session 2026-06-21 — the MySQL schema is user-prepared; `lib/db/migrations/` is out of scope). The schema is delivered by the user's SQL against the user-prepared MySQL container.
- [ ] T024 [US1] ~~Create migration `lib/db/migrations/1700000000001-SeedSubjects.ts`~~ **REMOVED in Stage 1** (per FR-016, Session 2026-06-21 — the `subjects` seed list is inserted by the user, not by a typeORM migration). The 9-row Stage 1 seed list (English, Mathematics, Science, Chinese, Malay, Tamil, Art, Music, Physical Education — all `active = true`) is delivered by the user's SQL.
- [ ] T025 [P] [US1] Create `lib/validation/teacher.ts` — `buildCreateTeacherSchema()` factory: at call time, `await getActiveSubjectNames()` (T026), return a `Joi.object({ name, subject: Joi.string().valid(...subjects).required(), email: Joi.string().email({ tlds: false }).trim().lowercase().max(254).required(), contactNumber: Joi.string().pattern(/^\d{8}$/).required() })` with `additionalProperties: false` (per `data-model.md` §"Joi schema" + FR-004, Session 2026-06-21 — exactly 8 digits, no leading-digit restriction)
- [ ] T026 [P] [US1] Create `lib/db/repositories/teacher.ts` — pure-function helpers around the typeORM Repository: `createTeacher(input)` (maps the public-API `subject` name → `subjects.id` via `findSubjectByName` before insert; catches `QueryFailedError` with `code = "ER_DUP_ENTRY"` and re-throws a tagged `DuplicateEmailError` for the route handler), `findTeacherByEmail(email)`, `listTeachers()`; the route handler's `toJSON` mapping continues to expose the natural-key field names (`name`, `subject` (resolved from `subject_id` via `subjectRef.name`), `email`, `contactNumber`) so the public-API surface is unchanged per FR-020 (per `research.md` §"Race-safety" + `003-backend-api-db/research.md` §3.6 + FR-019/FR-020 — Session 2026-06-19 audit-columns clarification)
- [ ] T027 [P] [US1] Create `lib/db/repositories/subject.ts` — pure-function helpers: `getActiveSubjectNames()` (returns `string[]`), `listActiveSubjects()` (returns `Subject[]`), `findSubjectByName(name)` (returns `Subject | null` — resolves the public-API `subject` field to `subjects.id` for the FK insert); used by T025 (Joi factory), T026 (Teacher create), and by US2 (GET endpoint) (per `data-model.md` §"Active subject list" + FR-019)
- [ ] T028 [US1] Create `app/api/v1.0/teachers/route.ts` — `POST` handler that: (1) calls `requireJson(req)` (returns 415 short-circuit), (2) awaits `buildCreateTeacherSchema()` and validates `await req.json()` (returns 400 on error), (3) calls `createTeacher(value)` inside a try/catch that maps `DuplicateEmailError → 409 "Email already in use"` and unhandled throws to the global 500 handler; returns `201` with the teacher JSON on success (per `contracts/teachers.yaml` POST + `research.md` §"Route-handler pipeline" + FR-022 for the `/api/v1.0/` version prefix)
- [ ] T029 [P] [US1] Create `components/FormField.tsx` — shared, feature-agnostic `<FormField label name error type required>` that wraps the Ant Design `<Form.Item>` + `<Input>` primitives and is styled with **Tailwind CSS** utility classes (per `plan.md` Project Structure + Constitution v2.3.0 Principle VIII "Reusable")
- [ ] T030 [P] [US1] Create `components/Button.tsx` — shared `<Button variant="primary|secondary" type="submit|button" disabled onClick>` that wraps the Ant Design `<Button>` primitive and is styled with **Tailwind CSS** utility classes (per `plan.md` Project Structure)
- [ ] T031 [P] [US1] Create `app/teachers/_components/TeacherForm.tsx` — client component with the four `FormField`s (Name, Subject-as-Select, Email, Contact Number), a Submit `Button`, and a `useState` for `{ name, subject, email, contactNumber, errors, submitting }`; on submit, calls `fetch("/api/v1.0/teachers", { method: "POST", ... })`; on `400`, parses the error message and surfaces it on the matching field; on `409`, surfaces a form-level error; on `201`, `router.push("/teachers")`; on `5xx` / network error, surfaces a form-level error and **preserves all input** (per spec FR-011 + quickstart Scenario 1 + FR-022 for the `/api/v1.0/` version prefix)
- [ ] T032 [US1] Create `app/teachers/add/page.tsx` — client component that fetches `GET /api/v1.0/subjects` on mount, renders the `<TeacherForm subjects={subjects} />`, and shows a loading state while the subject list is in flight (per spec FR-001 + quickstart Scenario 1 + FR-022)

**Checkpoint**: At this point, `POST /api/v1.0/teachers` works end-to-end (under the `/api/v1.0/` version prefix per FR-022, Session 2026-06-21). The Add Teacher form renders, validates, posts, and persists to MySQL. Quickstart Scenarios 1, 2, 4–9, 13 (unit), 14 (integration) pass.

---

## Phase 4: User Story 2 - Retrieve the List of Teachers (Priority: P1)

**Goal**: An administrator navigates to the Teachers screen and sees the complete list of teachers (or the empty state) with each entry showing `name`, `subject`, `email`, and `contactNumber`; the data comes from `GET /api/v1.0/teachers` and the Subject dropdown data from `GET /api/v1.0/subjects` (the `/api/v1.0/` version prefix is owned by 003-backend-api-db, per FR-022, Session 2026-06-21).

**Independent Test**: Seed N teachers (or use the result of US1), open `/teachers`, verify every teacher is listed with all four fields; verify the empty state when zero teachers exist; verify the loading and error states. The `GET /api/v1.0/teachers` endpoint must return `200` with `{ "data": [...] }` and the `GET /api/v1.0/subjects` endpoint must return `200` with the seeded list.

### Tests for User Story 2 (REQUIRED per Constitution Principle III + spec SC-004, SC-005) ⚠️

- [ ] T033 [P] [US2] Contract test: `GET /api/v1.0/teachers` empty list (200 + `{ data: [] }`), filled list (200 + array), `500`, `503` in `tests/contract/teachers-list.api.spec.ts` (covers quickstart Scenarios 3, 10)
- [ ] T034 [P] [US2] Contract test: `GET /api/v1.0/subjects` seeded list (200 + 9 entries), empty list (200 + `{ data: [] }`) in `tests/contract/subjects.api.spec.ts` (covers quickstart Scenario 10 + FR-005a)
- [ ] T035 [P] [US2] Unit test: `listTeachers()` repository — returns empty array on empty DB, returns N rows on N-row DB, ordering is unspecified in `tests/unit/teacher.repository.spec.ts`
- [ ] T036 [P] [US2] Unit test: `listActiveSubjects()` repository — returns only `active = true` rows in `tests/unit/subject.repository.spec.ts`
- [ ] T037 [P] [US2] Integration test: `GET /api/v1.0/teachers` after seeding N rows via `POST /api/v1.0/teachers` (covers quickstart Scenarios 3, 11) in `tests/integration/teachers-list.api.spec.ts`

### Implementation for User Story 2

- [ ] T038 [US1/US2] Add `listTeachers()` to `lib/db/repositories/teacher.ts` (extend T026) — `SELECT * FROM teachers` via the typeORM `Repository.find()`; return the entities as-is (no id column on `teachers` so the `toJSON` mapping is trivial) (per `data-model.md` §"teachers")
- [ ] T039 [US1/US2] Add `listActiveSubjects()` to `lib/db/repositories/subject.ts` (extend T027) — `SELECT * FROM subjects WHERE active = true`; returns `Subject[]` (per `data-model.md` §"Active subject list")
- [ ] T040 [US2] Create `app/api/v1.0/teachers/route.ts` `GET` handler (extend T028) — returns `200` with `{ data: Teacher[] }` from `listTeachers()`; wraps in try/catch for 500/503 (per `contracts/teachers.yaml` GET)
- [ ] T041 [US2] Create `app/api/v1.0/subjects/route.ts` — `GET` handler that returns `200` with `{ data: Subject[] }` from `listActiveSubjects()`; same try/catch pattern (per `contracts/subjects.yaml` GET)
- [ ] T042 [P] [US2] Create `components/StateViews.tsx` — three shared, feature-agnostic components: `<EmptyState title message action>`, `<ErrorState message onRetry>`, `<LoadingState>` (per `plan.md` Project Structure + Constitution Principle VIII "Reusable")
- [ ] T043 [P] [US2] Create `app/teachers/_components/TeacherTable.tsx` — presentational component that maps a `Teacher[]` prop to a table (or list) of `name / subject / email / contactNumber` rows; no data fetching (per spec FR-008 + quickstart Scenario 1 filled state)
- [ ] T044 [US2] Create `app/teachers/page.tsx` — client component that `useEffect` → `fetch("/api/v1.0/teachers")`; renders `<LoadingState>` while in flight, `<EmptyState>` when `data.length === 0`, `<ErrorState>` on failure (preserving the ability to retry), and `<TeacherTable data={data} />` on success; shows an entry-point link to `/teachers/add` in the empty state (per spec FR-008, FR-009, quickstart Scenarios 1, 3 + FR-022 for the `/api/v1.0/` version prefix)

**Checkpoint**: At this point, `GET /api/v1.0/teachers` + `GET /api/v1.0/subjects` work end-to-end. The Teachers list renders, the empty state appears when the DB is empty, the error state appears on failure. Quickstart Scenarios 1, 3, 10, 11 pass. US1 + US2 together cover the Stage 1 deliverable.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: README contract, configuration verification, final consistency check. Affects all user stories.

- [ ] T045 [P] Fill in the `README.md` implementation sections from T007 — concrete `docker compose -f docker/docker-compose.yml up -d --build` command (for the app container only; MySQL is user-prepared), link to `/teachers` and `/teachers/add`, document the 4 status codes per FR-010, link to the OpenAPI contract files in `specs/001-teachers/contracts/`, document the Stage 1 assumptions (no auth, no pagination, single role, ≤ 500 teachers, subjects are read-only, `/api/v1.0/` version prefix per FR-022) (per Constitution "README is a contract" + spec Assumptions)
- [ ] T046 [P] **REMOVED in Stage 1**: `npm run migration:run` is no longer in scope (per FR-016, Session 2026-06-21 — there are no typeORM migrations in Stage 1). Keep the `npm run test:unit`, `npm run test:contract`, `npm run test:integration` scripts that delegate to the matching Vitest projects (per `plan.md` Project Structure).
- [ ] T047 [P] **REMOVED in Stage 1**: `npm run migration:revert` is no longer in scope (per FR-016, Session 2026-06-21).
- [ ] T048 [P] Create `app/teachers/_components/TeacherForm.test.tsx` (optional but recommended by the spec's "UI components are testable" guidance) — a Vitest + Testing Library test that mounts the form with mocked `fetch`, fills the inputs, submits, and asserts the 201 / 400 paths render the right UI
- [ ] T049 [P] Update the `app/globals.css` so the Tailwind directives + Ant Design reset CSS load order is correct (per Constitution v2.3.0 Principle VIII "Simple" — no per-feature CSS) and verify the Add Teacher form matches the Figma's font sizes / colours at a glance
- [ ] T050 Run the full quickstart validation: `docker compose -f docker/docker-compose.yml up -d --build` → execute Scenarios 1–15 from `specs/001-teachers/quickstart.md` in order; fix any failures; mark the quickstart as "validated" with a date in the README
- [ ] T051 Run `/speckit-analyze` to verify the cross-artifact consistency across `spec.md`, `plan.md`, and this `tasks.md`; resolve every inconsistency before opening the PR (per Constitution Compliance Review + plan.md "Done When")
- [ ] T052a [P] **Audit-columns verification** (per `spec.md` FR-013 — Session 2026-06-19 audit-columns clarification; cross-references `003-backend-api-db/spec.md` FR-018 / FR-019 / FR-020 and `003-backend-api-db/tasks.md` T024a) — the upstream tasks T021, T022, T026, T027 already create `lib/db/entities/Teacher.ts`, `lib/db/entities/Subject.ts`, the user-prepared MySQL schema (audit columns, FKs, UNIQUE indexes, `ulid CHAR(26) UNIQUE` per FR-021 — no migration files per FR-016, Session 2026-06-21), and the teacher / subject repositories with the full audit-columns pattern (id PK, `subject_id` FK → `subjects.id`, six audit columns, natural-key `UNIQUE NOT NULL`, route-handler subject name → id resolution) so no entity / schema / repo updates are required by this task. **This task verifies** that the implementation produced by the upstream tasks matches `docker/mysql/init/01-schema-and-seed.sql` and `data-model.md` §5, and **adds** an integration test asserting that the Stage 1 public API responses continue to expose `ulid` and the natural-key field names (`name`, `subject`, `email`, `contactNumber`, `subjects.name` / `subjects.active`) and do NOT contain `id`, `created_at`, `created_by`, `modified_at`, `modified_by`, or `version` (per FR-020/FR-021). Extend T018 / T019 / T033 / T034 with the response-shape assertion.
- [ ] T052 [P] Verify the Constitution compliance review checklist (per Constitution Principles II, VI, VII, **VIII** + `001-teachers/plan.md` "Code-review rule"):
  - **II. TypeScript End-to-End**: `strict: true` is on in `tsconfig.json`; no `.js` source files
  - **VI. Functional-First**: no class-based service / controller code in `app/`, `lib/`, or `components/` (only the typeORM entity classes are allowed); React code is function components + hooks
  - **VII. Joi Schema Validation**: a Joi schema exists next to every typeORM entity and mirrors the columns field-for-field; every body-carrying route handler uses `requireJson` and the error envelope
  - **VIII. UI Quality — Self-Explanatory, Reusable, Simple**: every UI component composes from `antd` primitives (`Form.Item`, `Input`, `Select`, `Button`, `Table`, `Modal`); all visual presentation is expressed via Tailwind utility classes in JSX `className`; `tailwind.config.ts` and `postcss.config.mjs` exist (T012a) and `app/globals.css` has the Tailwind directives (T013); no raw hex values, no per-component CSS modules, no inline `style` objects except where antd's documented escape hatches (`ConfigProvider` token overrides) require it; the shared `FormField` / `Button` / `Select` / `StateViews` components are feature-agnostic (no `Teacher` / `Class` field names baked in)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**
- **User Stories (Phase 3 + 4)**: All depend on Foundational completion
  - US1 and US2 are both P1 and can be worked on in parallel after Phase 2
  - US2 reuses Phase 3 entities, repos, and the shared `app/api/v1.0/teachers/route.ts` (T040 extends T028; T038 extends T026; T039 extends T027) — the `/api/v1.0/` version prefix per FR-022, Session 2026-06-21
- **Polish (Phase 5)**: Depends on US1 + US2 completion

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2). Depends on T008 (config), T009 (DataSource), T010/T011 (response + content-type), T021/T022 (entities), T025/T026/T027 (validation + repos). The previous T023/T024 migration tasks are REMOVED in Stage 1 (per FR-016, Session 2026-06-21); the MySQL schema is user-prepared. Independent of US2.
- **User Story 2 (P1)**: Can start after Foundational (Phase 2). Reuses T021/T022 (entities), T026 (teacher repo — extends in T038), T027 (subject repo — extends in T039), T028 (route handler — extends in T040). Depends on T021–T027 indirectly through the shared `lib/db/*` and `app/api/v1.0/teachers/route.ts` files (the route file lives under `app/api/v1.0/` per FR-022, Session 2026-06-21). Should be implemented after US1's entities and repos are merged to avoid merge conflicts on the shared files.

### Within Each User Story

- Tests (T018/T019/T020 for US1; T033/T034/T035/T036/T037 for US2) MUST be written and FAIL before implementation
- Entities (T021/T022) before migrations (T023/T024) before validation + repos (T025/T026/T027)
- Validation + repos (T025/T026/T027) before route handlers (T028)
- Shared UI primitives (T029/T030) before feature components (T031/T043)
- Route handlers before pages (T032/T044)
- Story complete before moving to the polish phase

### Parallel Opportunities

Phase 1 — all tasks (T001–T007) can run in parallel once Setup starts.

Phase 2 — most tasks can run in parallel:
- T008 (config) before T009 (DataSource imports it)
- T009 (DataSource) before any entity / migration code
- T010 (response) and T011 (content-type) are independent
- T012 (layout) and T013 (globals.css) and T014 (home page) are independent
- T015 (Dockerfile) before T016 (docker-compose) before T017 (docker-compose.test)

Phase 3 (US1) — within the implementation block:
- T021 (Teacher entity) ∥ T022 (Subject entity) — different files
- T025 (Joi) ∥ T026 (teacher repo) ∥ T027 (subject repo) — different files
- T029 (FormField) ∥ T030 (Button) — different files
- T023 and T024 depend on T021 and T022
- T028 depends on T025, T026, T027
- T031 depends on T029, T030, T028
- T032 depends on T031

Phase 4 (US2) — within the implementation block:
- T033, T034, T035, T036, T037 (tests) all parallelisable
- T038, T039 (repo extensions) parallelisable
- T040, T041 (route handlers) parallelisable
- T042, T043 (presentational components) parallelisable
- T044 (page) depends on T040, T041, T042, T043

### Within-Phase Parallelism Example

```bash
# Once Phase 2 (Foundational) completes, launch these US1 tasks in parallel:
Task: "T021 [US1] Create Teacher entity in lib/db/entities/Teacher.ts"
Task: "T022 [US1] Create Subject entity in lib/db/entities/Subject.ts"
Task: "T025 [US1] Create lib/validation/teacher.ts"
Task: "T026 [US1] Create lib/db/repositories/teacher.ts"
Task: "T027 [US1] Create lib/db/repositories/subject.ts"
Task: "T029 [US1] Create components/FormField.tsx"
Task: "T030 [US1] Create components/Button.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only — then add US2)

1. Complete Phase 1: Setup (T001–T007)
2. Complete Phase 2: Foundational (T008–T017)
3. Complete Phase 3: User Story 1 (T018–T032)
4. **STOP and VALIDATE**: `docker compose up` (the user-prepared MySQL container is brought up first per FR-016, Session 2026-06-21 — there is no migration step on boot) → quickstart Scenarios 1, 2, 4–9 pass → `POST /api/v1.0/teachers` works end-to-end (under the `/api/v1.0/` version prefix per FR-022)
5. Deploy / demo the Add Teacher flow alone (US1 is the foundational write path)

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add US1 → test independently → **MVP** (Add Teacher works, but list is unverified)
3. Add US2 → test independently → Stage 1 deliverable (Add Teacher + Teachers list both work, `GET /api/v1.0/subjects` populates the Subject dropdown — all under the `/api/v1.0/` version prefix per FR-022, Session 2026-06-21)
4. Polish → README + quickstart validation + `/speckit-analyze`
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done, the shared files (`lib/db/entities/*`, `lib/db/repositories/*`, `app/api/v1.0/teachers/route.ts`) must be merged before US1 + US2 can be worked on in parallel (the route file lives under `app/api/v1.0/` per FR-022, Session 2026-06-21)
3. After the shared files are merged:
   - Developer A: US1 (Add Teacher form + T031, T032)
   - Developer B: US2 (Teachers list + T042, T043, T044) — touches `app/api/v1.0/teachers/route.ts` (GET branch only) and the two repos
4. Stories complete and integrate independently; the `tests/contract/*` and `tests/integration/*` suites catch any contract drift

---

## Notes

- [P] tasks = different files, no dependencies
- [US1] / [US2] labels map each task to its user story for traceability
- Each user story is independently completable and testable
- Tests fail before implementation (red-green-refactor) per Constitution Principle III
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- The 001-teachers feature is the **first feature** to land in the repo; US1 establishes the cross-cutting pattern that `002-classes` and `003-backend-api-db` will follow
- The migration set produced by T023/T024 is the **first two** of the four migrations; `002-classes` adds T023-style `InitClasses.ts` and `SeedLevels.ts` after these run
- The cross-cutting `withApiContract` wrapper from `003-backend-api-db/plan.md` is **not** in scope for 001-teachers (003 owns it); 001's route handlers (T028, T040, T041) use `requireJson` (T011) directly and let unhandled throws become 500s — this is the pre-003 baseline that 003 will consolidate
