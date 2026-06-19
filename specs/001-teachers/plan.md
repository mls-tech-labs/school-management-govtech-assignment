# Implementation Plan: Teachers

**Branch**: `001-teachers` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-teachers/spec.md`

## Summary

Build the Teachers feature (Create + Read) end-to-end: a Next.js 15 application with
two client-rendered pages (Add Teacher form, Teachers list) and three API endpoints
(`POST /api/teachers`, `GET /api/teachers`, `GET /api/subjects`), backed by a MySQL 8
database managed through typeORM entities, repositories, and a versioned migration
set. All request bodies and query parameters are validated by Joi schemas that
mirror the typeORM columns field-for-field (Principle VII). The teachers reference
the `subjects` reference list via a foreign key, and the `subjects` table is seeded
by a second migration (per `003-backend-api-db` Clarifications, Session 2026-06-18).
The whole stack (app + MySQL) runs in Docker via `docker compose up`, with the
schema rebuilt from a single repeatable command.

## Technical Context

**Language/Version**: TypeScript 5.x with `strict: true` (per Constitution Principle II). No `.js` source files.

**Runtime**: Node.js LTS (current) via a single Next.js 15 application. The UI lives under `app/`; the API lives under `app/api/` as Next.js Route Handlers. There is no separate Node HTTP service, Express/Fastify/NestJS app, or microservice in scope.

**Primary Dependencies** (latest stable as of 2026-06-19; reflects the
constitution amendment that swapped SGDS v3 for Ant Design + Tailwind CSS —
see `.specify/memory/constitution.md` v2.3.0 Sync Impact Report and the
`### Session 2026-06-19` clarification in [`spec.md`](./spec.md)):
- `next@^15` — framework (App Router, client components default)
- `react@^19` and `react-dom@^19` — UI runtime (paired with Next 15)
- `typeorm@^0.3` — data access (entities, repositories, migrations)
- `mysql2@^3` — MySQL driver for typeORM
- `joi@^17` — request validation (mirrors typeORM columns per Principle VII)
- `antd@<pinned>` — UI component library (per Constitution v2.3.0 Technical Stack Constraints; satisfies Stage 1 requirement)
- `tailwindcss@<pinned>` — utility-first CSS framework (per Constitution v2.3.0)
- `postcss@<pinned>` and `autoprefixer@<pinned>` — Tailwind CSS build pipeline
- `dotenv@^16` — runtime configuration loader

**Storage**: MySQL 8.x running in a Docker container (per Constitution + Sync Impact Report). All persistence goes through typeORM entities, repositories, and migrations. Raw SQL is permitted only inside typeORM migrations, not in business code. Two tables are in scope for this feature: `teachers` and `subjects` (the latter shared with the Classes feature; see `003-backend-api-db`).

**Testing**: Vitest (latest) — see [research.md §1.1](./research.md#11-unit-test-runner-vitest-vs-jest) for the Vitest-vs-Jest decision. Unit tests cover every Joi schema (happy path + each rejection constraint) and the route-handler happy / error paths. Integration tests run against a typeORM test DataSource against the real MySQL container (no in-memory mock; tests use a freshly-initialised schema and tear it down on completion). Tests are runnable without a separate MySQL process in production but the integration tier requires the MySQL container to be up.

**Target Platform**: Linux server / macOS / Windows (developer machines) via Docker Desktop. The runtime is the Docker container; the host OS only runs the Docker daemon + Compose.

**Project Type**: Single Next.js web application (frontend + API in one process). Mapped to the plan template "Option 2: Web application" but collapsed to a single Next.js codebase (not a separate backend repo) per the Constitution's "one process" rule.

**Performance Goals**: The spec defers API-level latency targets to a future stage (see `001-teachers` Clarifications, Session 2026-06-18). The end-to-end form-time target is `SC-001` ≤ 30 s, which is a hard ceiling (not a target). Practical engineering target for the route handlers, for developer feedback, is `< 200 ms` p95 on the dev laptop — informal, not testable.

**Constraints**:
- `strict: true` TypeScript, no `.js` source files (Principle II).
- No class-based service / controller / repository code (Principle VI). typeORM entity classes are the only allowed class-based code.
- Every payload that crosses a trust boundary is validated by Joi (Principle VII); Joi schemas mirror the typeORM columns field-for-field.
- The `subjects` reference list is read-only in Stage 1; no POST/PUT/DELETE endpoints for it.
- ≤ 500 teachers in Stage 1 (Clarifications, Session 2026-06-18); no pagination.

**Scale/Scope**:
- 1 application process (Next.js) + 1 database process (MySQL), both in Docker.
- 2 database tables (`teachers`, `subjects`).
- 3 API endpoints (`POST /api/teachers`, `GET /api/teachers`, `GET /api/subjects`).
- 2 client-rendered pages (`/teachers/add`, `/teachers`).
- 0 background jobs, 0 cron tasks, 0 worker processes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Spec-Driven Development | ✅ Pass | Plan is generated by `/speckit-plan` after `/speckit-specify` + 5 clarification Q&As; tasks will be generated by `/speckit-tasks`; no source code is written before this plan is approved. |
| II. TypeScript End-to-End (`strict: true`) | ✅ Pass | A single `tsconfig.json` covers the whole app; the API route handlers, the typeORM entities, the Joi schemas, the UI components, and the tests are all `.ts`; no `.js` source files. |
| III. Unit Tests Required | ✅ Pass | Vitest is the runner (decided in [research.md §1.1](./research.md#11-unit-test-runner-vitest-vs-jest)). Unit tests cover every Joi schema (happy path + each rejection path) and the route handler. Integration tests use the MySQL container. |
| IV. Single Role: Administrator | ✅ Pass | No auth, no roles, no session; the only user is the Administrator, matching the spec. |
| V. Simplicity (YAGNI) | ✅ Pass | No abstractions ahead of the spec. No DTOs, no repositories class wrappers, no service layer, no DI container. The smallest Next.js + typeORM + Joi + Ant Design + Tailwind setup that satisfies the spec. The "extra unknown fields" policy and any other low-impact decisions are deferred to the `simplify` skill if they come up at implementation time. |
| VI. Functional-First (Classes Only When Necessary) | ✅ Pass | Server code is small modules of pure functions (`lib/validation/*.ts`, `lib/api/response.ts`, `app/api/*/route.ts`). React code uses function components and hooks. The only classes are typeORM entity classes (framework-mandated). |
| VII. Joi Schema Validation | ✅ Pass | Every request body and query parameter is validated by Joi before any typeORM call. The Joi schema for `Teacher` mirrors the typeORM entity column-for-column (same required-ness, same length bounds, same regex). `Joi.string().email().required()`, `Joi.string().pattern(/^[89]\d{7}$/).required()` for contact, `Joi.string().valid(...).required()` for subject. |
| VIII. UI Quality — Self-Explanatory, Reusable, Simple | ✅ Pass | UI components are function components, named after their role (`TeacherForm`, `TeacherTable`, `FormField`, `EmptyState`, `ErrorState`, `LoadingState`), with explicit typed props. Composed from **Ant Design (`antd`)** primitives and styled with **Tailwind CSS** utility classes (per Constitution v2.3.0) — no feature-specific hard-coding. No three-layer indirection to render one button. |

**Stage Scope compliance** (per Constitution → Stage Scope):
- ✅ In scope: Teachers UI Create + Read; backend `POST` + `GET` for Teachers; data model for `teachers` and `subjects`.
- ✅ Out of scope: Update/Delete (no PUT/DELETE endpoints), authentication, additional roles, additional entities, production deployment, observability — all not in the plan.

**Constitution TODO items resolved by this plan** (per `.specify/memory/constitution.md` Sync Impact Report):
- `TODO(FEATURE_001)`: unit-test runner — **resolved**: Vitest (see [research.md §1.1](./research.md#11-unit-test-runner-vitest-vs-jest)).
- `TODO(FEATURE_001)`: container layout — **resolved**: `docker compose` with two services (`app`, `mysql`) (see [research.md §1.2](./research.md#12-container-layout-dockerfile-vs-docker-compose)).
- `TODO(SGDS_V3_PACKAGE)`: pin the `@govtechsg/sgds-react` version — **superseded** by the constitution amendment (v2.2.0 → v2.3.0): the UI library is now **Ant Design (`antd`)** and the styling solution is **Tailwind CSS** (see new `TODO(ANTD_TAILWIND_VERSION)` below and the `### Session 2026-06-19` clarification in [`spec.md`](./spec.md)). The new pin lives in `package.json` (see [research.md §1.3](./research.md#13-ui-library-and-styling-version-pin)).
- `TODO(JOI_ALIGNMENT)`: on first PR that adds a typeORM entity, verify a matching Joi schema exists — **resolved**: enforced by an architectural rule (Joi schema lives next to the entity, both are imported in the route handler; PR review checklist in `README.md`).
- `TODO(FUNCTIONAL_REVIEW)`: verify no class-based service / controller / domain-model code — **resolved**: enforced by a code-review rule (no `class` keyword in `app/`, `lib/`, or `components/`, except the `typeorm` `Entity` decorated classes).

No violations. No entries required in **Complexity Tracking**.

## Project Structure

### Documentation (this feature)

```text
specs/001-teachers/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/see /speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── teachers.yaml
│   └── subjects.yaml
├── checklists/
│   └── requirements.md  # pre-existing
└── spec.md              # pre-existing
```

### Source Code (repository root)

```text
app/
├── layout.tsx                       # Root layout, loads Ant Design reset CSS + Tailwind globals
├── page.tsx                         # Home — redirects to /teachers
├── teachers/
│   ├── page.tsx                     # Teachers list screen (client component)
│   ├── add/
│   │   └── page.tsx                 # Add Teacher form screen (client component)
│   └── _components/
│       ├── TeacherForm.tsx          # The form (Name / Subject / Email / Contact)
│       ├── TeacherTable.tsx         # The list (filled state)
│       ├── EmptyState.tsx           # "No teachers yet" + entry point
│       ├── ErrorState.tsx           # "Could not load" + retry
│       └── LoadingState.tsx         # Skeleton / spinner
├── api/
│   ├── teachers/
│   │   └── route.ts                 # GET (list) + POST (create)
│   └── subjects/
│       └── route.ts                 # GET (list of active subjects)
└── globals.css

lib/
├── db/
│   ├── data-source.ts               # typeORM DataSource (singleton)
│   ├── entities/
│   │   ├── Teacher.ts               # @Entity() Teacher class
│   │   └── Subject.ts               # @Entity() Subject class
│   └── migrations/
│       ├── 1700000000000-InitSchema.ts       # creates teachers, subjects tables
│       └── 1700000000001-SeedSubjects.ts     # INSERT IGNORE the seed list
├── validation/
│   ├── teacher.ts                   # Joi schema for POST /api/teachers body
│   └── subject.ts                   # Joi schema for GET /api/subjects query (none required)
├── api/
│   ├── response.ts                  # errorEnvelope(), jsonError(), jsonOk() pure functions
│   └── content-type.ts              # requireJson(req) → throws 415 if not application/json
└── config.ts                        # reads process.env, validates with Joi at boot

components/                          # Shared, feature-agnostic UI primitives
├── FormField.tsx                    # label + input + error slot, composed with antd Form.Item + Input
├── Button.tsx                       # wraps antd Button with our variant logic
└── StateViews.tsx                   # EmptyState, ErrorState, LoadingState (generic)

tests/
├── unit/
│   ├── teacher.validation.spec.ts   # POST /api/teachers Joi schema — happy + each rejection
│   ├── teacher.repository.spec.ts   # Teacher entity + repository (against test DataSource)
│   └── subject.repository.spec.ts   # Subject entity + repository
├── contract/
│   ├── teachers.api.spec.ts         # POST + GET /api/teachers (against test app instance)
│   └── subjects.api.spec.ts         # GET /api/subjects
└── integration/
    └── teachers.api.spec.ts         # POST + GET /api/teachers end-to-end (full DB)

docker/
├── Dockerfile                       # multi-stage build of the Next.js app
├── docker-compose.yml               # 2 services: app, mysql
├── docker-compose.test.yml          # 1 service: mysql (for integration tests)
└── mysql/
    └── init/                        # optional bootstrap SQL (empty in Stage 1)

.env.example                         # documents every env var (no secrets)
.env.local                           # gitignored; DB URL, server port (per Constitution)
.env                                 # JSON, model config only (per CLAUDE.md)
.gitignore                           # includes .env.local
package.json
tsconfig.json                        # strict: true
next.config.mjs
vitest.config.ts                     # unit + contract + integration
README.md                            # contract: how to run, assumptions, links
```

**Structure Decision**: Single Next.js application (per Constitution: "The application is one process"). The structure follows the Constitution's "UI under `app/`, API under `app/api/`" rule. `lib/` holds the cross-cutting pure-function modules (validation, API helpers, DB entities, migrations). `components/` holds feature-agnostic UI primitives that wrap **Ant Design (`antd`)** and are styled with **Tailwind CSS** utility classes. `tests/` mirrors the layered test strategy (unit, contract, integration). Docker files live in `docker/` and are referenced by the root `docker compose` invocation. The plan is silent on the placement of `.requirements/Full Stack Assignment.md` because the file is not present in the repo (a missing-asset notice is in [research.md §1.6](./research.md#16-missing-requirements-asset)).

## Complexity Tracking

> No Constitution Check violations. No entries required.
