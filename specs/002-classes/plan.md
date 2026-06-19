# Implementation Plan: Classes

**Branch**: `002-classes` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-classes/spec.md`

## Summary

Build the Classes feature (Create + Read) end-to-end: two new client-rendered
pages (Add Class form, Classes list) and three new API endpoints
(`POST /api/v1.0/classes`, `GET /api/v1.0/classes`, `GET /api/v1.0/levels`),
backed by two new MySQL 8 tables (`classes`, `levels`) managed through
typeORM entities and repositories. The form-teacher relationship is
enforced at the data layer by a foreign key from `classes.form_teacher_id`
to `teachers.id` plus a `UNIQUE` index on `classes.form_teacher_id` (so
the "at most one form teacher per teacher" invariant is race-safe by
construction). The route handler resolves the wire-format `teacherEmail`
(the referenced teacher's `email`) to `form_teacher_id` via a
`findTeacherByEmail` lookup before insert; the FK and the `UNIQUE` index
are the backstops for direct writes that bypass the API (per
`003-backend-api-db/spec.md` FR-019 and `002-classes/spec.md` FR-013 —
Session 2026-06-19 audit-columns clarification). The `levels` reference
list is inserted by the user against the user-prepared MySQL container
(per FR-016, Session 2026-06-21 — there is no typeORM migration set, no
`npm run seed` step, and no boot-time seeder in Stage 1). All request
bodies and query parameters are validated by Joi schemas that mirror
the typeORM columns field-for-field (Principle VII). The whole stack
(app + MySQL) runs in Docker via `docker compose up`, with the schema
prepared by the user separately. All Stage 1 endpoints are exposed
under the version prefix `/api/v1.0/` (per FR-022, Session 2026-06-21).

This plan inherits the stack, container layout, and cross-cutting API contract
from [`001-teachers`](./../001-teachers/plan.md); the only feature-specific
work is the new tables, the new endpoints, the new client pages, and the
form-teacher lookup logic.

## Technical Context

**Language/Version**: TypeScript 5.x with `strict: true` (per Constitution Principle II). No `.js` source files.

**Runtime**: Node.js LTS (current) via the **same single Next.js 15 application** as `001-teachers` — the Constitution's "one process" rule means the API and UI for both features live in the same Next.js codebase. The Classes feature is a new set of routes and pages inside the existing `app/` tree, not a separate application.

**Primary Dependencies**: same as `001-teachers` (see [research.md §2.1](./research.md#21-stack-inheritance-from-001-teachers)); reflects the constitution v2.3.0 amendment that swapped SGDS v3 for **Ant Design (`antd`)** + **Tailwind CSS** (see the `### Session 2026-06-19` clarification in [`spec.md`](./spec.md) and the v2.3.0 Sync Impact Report). Adds **one runtime dependency** inherited from 001-teachers for the cross-cutting `ulid` row-handle column (per `003-backend-api-db/spec.md` FR-021):
- `next@^15`, `react@^19`, `react-dom@^19`
- `typeorm@^0.3`, `mysql2@^3`
- `joi@^17`
- `antd@<pinned>` (replaces `@govtechsg/sgds-react@^3`)
- `tailwindcss@<pinned>`, `postcss@<pinned>`, `autoprefixer@<pinned>`
- `dotenv@^16`
- `ulid@<pinned>` — generator for the `ulid` column on `classes` and `levels` (per FR-021 — owned by `003-backend-api-db`; see [`../003-backend-api-db/research.md` §3.11](../003-backend-api-db/research.md#311-ulid-column-fr-021--cross-cutting-row-handle))
- `vitest` (dev)

**Storage**: same MySQL 8 container as `001-teachers`. New tables added by this feature:
- `levels` (reference list, inserted by the user against the user-prepared MySQL container per FR-016, Session 2026-06-21) — see [data-model.md §1](./data-model.md#1-levels-table--level-entity)
- `classes` (the new entity) — see [data-model.md §2](./data-model.md#2-classes-table--class-entity)

**There are no typeORM migrations in Stage 1** (per FR-016,
Session 2026-06-21 — the MySQL schema is user-prepared). The previous
two-migration design (`InitClasses`, `SeedLevels`) is removed from
the project source; the migration history is preserved in the
per-feature data-model for reference only.

The form-teacher relationship adds a `FOREIGN KEY` from `classes.form_teacher_id` → `teachers.id` (in the user-prepared MySQL container, per `003-backend-api-db/spec.md` FR-019). This FK enforces FR-004 (teacher must exist) and FR-012 (form teacher is always an existing teacher) at the data layer. The `UNIQUE` constraint on `classes.form_teacher_id` enforces the "at most one form teacher per teacher" invariant (per FR-005).

**Testing**: same Vitest setup as `001-teachers`. New unit tests:
- `lib/validation/class.spec.ts` — `POST /api/v1.0/classes` Joi schema (happy path + each rejection path)
- `lib/db/repositories/class.repository.spec.ts` — `Class` entity + repository (insert, find, uniqueness, FK behavior against the test MySQL)
- `lib/db/repositories/level.repository.spec.ts` — `Level` entity + repository

New contract tests:
- `tests/contract/classes.api.spec.ts` — POST + GET /api/v1.0/classes (against a test app instance)

New integration tests:
- `tests/integration/classes.api.spec.ts` — POST + GET /api/v1.0/classes end-to-end (full DB), including the 404 (teacher not found) and 409 (teacher already assigned) and 409 (duplicate name) paths.

**Target Platform**: same as `001-teachers` — Docker Desktop, Linux / macOS / Windows host, Docker Compose v2.

**Project Type**: same as `001-teachers` — single Next.js web application. This plan adds new routes / pages / entities to the same Next.js codebase; no new project, no new migrations (per FR-016, Session 2026-06-21).

**Performance Goals**: same as `001-teachers` — end-to-end form-time ≤ 30 s (`SC-001`), no API-level latency target in Stage 1. The Classes endpoint adds one `JOIN` to the teachers table for the list response; the dev-laptop informal target stays `< 200 ms` p95.

**Constraints**:
- All `001-teachers` constraints apply (TS strict, no class-based code outside typeORM entities, Joi mirroring, etc.).
- The form-teacher FK (`fk_classes_form_teacher`) and the `UNIQUE` constraint on `classes.form_teacher_id` are the single source of truth for FR-005 (one form teacher per teacher) and FR-004 (form teacher must exist). The wire-format `teacherEmail` is resolved to `form_teacher_id` by the route handler before insert; the FK + UNIQUE are the backstops for direct writes that bypass the API (per `003-backend-api-db/spec.md` FR-019 and FR-007).
- ≤ 500 classes in Stage 1 (Clarifications, Session 2026-06-18); no pagination.
- The `levels` reference list is read-only in Stage 1; no POST / PUT / DELETE for it.
- The Classes feature consumes `GET /api/v1.0/teachers` (the Form Teacher dropdown). If `001-teachers` is not yet implemented, the integration tests need a teacher fixture.

**Scale/Scope**:
- 1 application process (Next.js, same as `001-teachers`) + 1 database process (MySQL, same as `001-teachers`).
- 4 DB tables total in the schema: `subjects` + `teachers` (from `001-teachers`) + `levels` + `classes` (added by this feature); all four carry the cross-cutting `ulid CHAR(26) UNIQUE` column (per FR-021).
- 3 new API endpoints: `POST /api/v1.0/classes`, `GET /api/v1.0/classes`, `GET /api/v1.0/levels`. (Plus the 3 from `001-teachers`, all under the `/api/v1.0/` prefix per FR-022.)
- 2 new client-rendered pages: `/classes/add`, `/classes`.
- 0 background jobs, 0 cron tasks, 0 worker processes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Spec-Driven Development | ✅ Pass | Plan is generated by `/speckit-plan` after `/speckit-specify` + 5 clarification Q&As; tasks will be generated by `/speckit-tasks`; no source code is written before this plan is approved. |
| II. TypeScript End-to-End (`strict: true`) | ✅ Pass | Same single `tsconfig.json` as `001-teachers` covers the whole app; the new entities, Joi schemas, route handlers, and components are all `.ts`/`.tsx`; no `.js` source files. |
| III. Unit Tests Required | ✅ Pass | Same Vitest setup as `001-teachers`. The new Joi schemas get unit tests (happy + each rejection path); the new entities get repository tests; the new endpoints get contract + integration tests. |
| IV. Single Role: Administrator | ✅ Pass | No auth, no roles; only the Administrator. |
| V. Simplicity (YAGNI) | ✅ Pass | No abstractions ahead of the spec. No DTOs, no class-based service layers, no DI container. The Classes feature reuses the same `FormField`, `Button`, `EmptyState`, `ErrorState`, `LoadingState` components from `001-teachers`. |
| VI. Functional-First (Classes Only When Necessary) | ✅ Pass | Same rule as `001-teachers`: the new route handlers are small modules of pure functions; the new React components are function components with hooks; the only new classes are the typeORM entity classes (`Class`, `Level`). |
| VII. Joi Schema Validation | ✅ Pass | Every request body and query parameter is validated by Joi before any typeORM call. The Joi schema for `Class` mirrors the typeORM entity column-for-column. The form-teacher email format uses the same `Joi.string().email({ tlds: false })` pattern as `001-teachers`. The `ulid` column is server-generated (per FR-021) and is NOT part of any request body schema — it is never accepted from the client. |
| VIII. UI Quality — Self-Explanatory, Reusable, Simple | ✅ Pass | The new components (`ClassForm`, `ClassTable`) are function components with explicit typed props. The shared `FormField`, `Button`, `StateViews` from `001-teachers` are reused — no feature-specific hard-coding. The Form Teacher control is a `Select` composed from the shared `FormField` and the existing **Ant Design (`antd`)** `Select` primitive, styled with **Tailwind CSS** utility classes (per Constitution v2.3.0). The `ulid` field (per FR-021) is displayed as a monospace string in any UI surface that needs the row handle (e.g., the row key for the Ant Design `Table`). |

**Stage Scope compliance** (per Constitution → Stage Scope):
- ✅ In scope: Classes UI Create + Read; backend `POST` + `GET` for Classes; `GET /api/v1.0/levels` for the dropdown; data model for `classes` and `levels`.
- ✅ Out of scope: Update/Delete on Classes, authentication, additional roles, additional entities, production deployment, observability — all not in the plan.

**Constitution TODO items status**:
- All `TODO(FEATURE_001)` items were resolved in the `001-teachers` plan (Vitest, docker-compose, Joi-alignment, functional-review).
- The previous `TODO(SGDS_V3_PACKAGE)` is **superseded** by the constitution v2.3.0 amendment (SGDS v3 → Ant Design + Tailwind CSS). The new pin lives in `001-teachers/plan.md` Technical Context and is inherited by this feature (no new task needed here). The matching `TODO(ANTD_TAILWIND_VERSION)` is resolved at the project level by `001-teachers/T001` + `001-teachers/T012a`.
- New item introduced by this plan: `TODO(FEATURE_002)` — confirm the `GET /api/v1.0/classes` join performance against a real schema with N teachers and M classes (informal, dev-only). Documented in the quickstart as a manual check.

No violations. No entries required in **Complexity Tracking**.

## Project Structure

### Documentation (this feature)

```text
specs/002-classes/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── classes.yaml
│   └── levels.yaml
├── checklists/
│   └── requirements.md  # pre-existing
└── spec.md              # pre-existing
```

### Source Code (repository root)

The Classes feature extends the same Next.js codebase as `001-teachers`. New
files are marked `(+)`; pre-existing files are unmarked for clarity.

```text
app/                                                 # Next.js App Router
├── layout.tsx                                       # (pre-existing)
├── page.tsx                                         # (pre-existing) Home
├── classes/                                         # (+) Classes routes
│   ├── page.tsx                                     # (+) Classes list screen (client component)
│   ├── add/
│   │   └── page.tsx                                 # (+) Add Class form screen (client component)
│   └── _components/
│       ├── ClassForm.tsx                            # (+) The form (Level / Name / Form Teacher)
│       ├── ClassTable.tsx                           # (+) The list (filled state)
│       ├── FormTeacherSelect.tsx                    # (+) The searchable dropdown of teachers
│       ├── LevelSelect.tsx                          # (+) The Level dropdown
│       ├── EmptyState.tsx                           # (+) "No classes yet" + entry point
│       ├── ErrorState.tsx                           # (+) "Could not load" + retry
│       └── LoadingState.tsx                         # (+) Skeleton / spinner
├── api/                                             # (pre-existing app/api/ from 001-teachers)
│   └── v1.0/                                        # (+) version-prefix route folder (per FR-022)
│       ├── teachers/                                # (pre-existing)
│       │   └── route.ts                             # (pre-existing)
│       ├── subjects/                                # (pre-existing)
│       │   └── route.ts                             # (pre-existing)
│       ├── classes/                                 # (+)
│       │   └── route.ts                             # (+) GET (list) + POST (create) — under /api/v1.0/ per FR-022
│       └── levels/                                  # (+)
│           └── route.ts                             # (+) GET (list of active levels) — under /api/v1.0/ per FR-022
└── globals.css

lib/
├── db/
│   ├── data-source.ts                               # (pre-existing; no `migrations` runner — the schema is user-prepared per FR-016)
│   └── entities/
│       ├── Teacher.ts                               # (pre-existing, + ulid CHAR(26) UNIQUE per FR-021)
│       ├── Subject.ts                               # (pre-existing, + ulid CHAR(26) UNIQUE per FR-021)
│       ├── Class.ts                                 # (+) @Entity() Class class (+ ulid CHAR(26) UNIQUE per FR-021; @BeforeInsert hook calls generateUlid())
│       └── Level.ts                                 # (+) @Entity() Level class (+ ulid CHAR(26) UNIQUE per FR-021; @BeforeInsert hook calls generateUlid())
├── validation/
│   ├── teacher.ts                                   # (pre-existing)
│   ├── subject.ts                                   # (pre-existing)
│   └── class.ts                                     # (+) buildCreateClassSchema() — Joi factory using active levels
├── api/
│   ├── response.ts                                  # (pre-existing) error envelope helpers
│   ├── content-type.ts                              # (pre-existing) requireJson()
│   ├── route.ts                                     # (pre-existing from 003) withApiContract(handler) — cross-cutting wrapper (per FR-022)
│   └── db-error.ts                                  # (pre-existing from 003) typeORM QueryFailedError → status + message mapping
├── ulid.ts                                          # (pre-existing from 003-backend-api-db) generateUlid() — thin wrapper over the `ulid` npm package (per FR-021)
├── db/repositories/                                 # (+) pure-function helpers around the typeORM Repository
│   ├── teacher.ts                                   # (+) getActiveSubjectNames, findTeacherByEmail, listTeachers
│   ├── subject.ts                                   # (+) listActiveSubjects
│   ├── class.ts                                     # (+) createClass, listClassesWithFormTeacher, findClassByName
│   └── level.ts                                     # (+) getActiveLevelNames, listActiveLevels
└── config.ts                                        # (pre-existing)

components/                                          # (pre-existing from 001-teachers)
├── FormField.tsx                                    # (pre-existing) label + input + error slot (antd Form.Item + Input, Tailwind styled)
├── Button.tsx                                       # (pre-existing) (antd Button, Tailwind styled)
├── Select.tsx                                       # (+) wraps antd Select with our variant logic (Tailwind styled)
└── StateViews.tsx                                   # (pre-existing)

tests/
├── unit/
│   ├── (pre-existing from 001-teachers)
│   ├── class.validation.spec.ts                     # (+) POST /api/v1.0/classes Joi — happy + each rejection
│   ├── class.repository.spec.ts                     # (+) Class entity + repository
│   └── level.repository.spec.ts                     # (+) Level entity + repository
├── contract/
│   ├── (pre-existing from 001-teachers)
│   ├── classes.api.spec.ts                          # (+) POST + GET /api/v1.0/classes
│   └── levels.api.spec.ts                           # (+) GET /api/v1.0/levels
└── integration/
    ├── (pre-existing from 001-teachers)
    └── classes.api.spec.ts                          # (+) POST + GET /api/v1.0/classes end-to-end (full DB)

docker/                                              # (pre-existing from 001-teachers)
├── Dockerfile
├── docker-compose.yml                               # (no migration step on boot — per FR-016)
└── docker-compose.test.yml

.env.example                                         # (pre-existing)
.env.local                                           # (pre-existing, gitignored)
.env                                                 # (pre-existing, JSON, model config only)
.gitignore                                           # (pre-existing)
package.json                                         # (pre-existing, no new deps — reuses 001's set)
tsconfig.json                                        # (pre-existing, strict: true)
next.config.mjs                                      # (pre-existing)
vitest.config.ts                                     # (pre-existing)
README.md                                            # (pre-existing)
```

**Structure Decision**: New files only — no new directories at the project
root. The `app/classes/*` routes are siblings to the `app/teachers/*` routes;
the `app/api/v1.0/classes/*` and `app/api/v1.0/levels/*` routes are
siblings to the `app/api/v1.0/teachers/*` and `app/api/v1.0/subjects/*`
routes (all under the `/api/v1.0/` version prefix per FR-022). The new
typeORM entities (`Class`, `Level`) and the new Joi schema (`class.ts`)
sit alongside their 001-teachers counterparts. The previous
`lib/db/migrations/` directory is removed in Stage 1 (per FR-016,
Session 2026-06-21); the schema is user-prepared.

## Complexity Tracking

> No Constitution Check violations. No entries required.
