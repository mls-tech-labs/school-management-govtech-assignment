# Implementation Plan: Backend APIs and DB Schema

**Branch**: `003-backend-api-db` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-backend-api-db/spec.md`

## Summary

Build the **cross-cutting** backend layer that the Teachers and
Classes features depend on. This feature owns:

1. **The shared API contract** — the error envelope `{ "error": "..." }`,
   the status-code table (`400 / 404 / 409 / 415 / 500 / 503`), the
   `Content-Type: application/json` gate, and the `withApiContract`
   route-handler wrapper that enforces all three.
2. **The cross-cutting data-integrity rules** at the data layer —
   `UNIQUE(teachers.email)`, `UNIQUE(classes.name)`,
   `UNIQUE(classes.form_teacher_id)`, the cross-feature
   `FOREIGN KEY(classes.form_teacher_id → teachers.id)`,
   the `FOREIGN KEY(teachers.subject_id → subjects.id)`, and the
   `FOREIGN KEY(classes.level_id → levels.id)`. Each rule is
   enforced by the DB so even direct writes that bypass the API
   cannot violate it. The 2026-06-19 audit-columns clarification
   added a uniform six-column audit pattern (`id` surrogate PK,
   `created_at`, `created_by`, `modified_at`, `modified_by`,
   `version`) to every table — see `spec.md` Session 2026-06-19
   (audit columns) and `data-model.md` §2.6–§2.7. The
   2026-06-20 ULID clarification added a seventh cross-cutting
   column (`ulid CHAR(26) NOT NULL UNIQUE`) to every table,
   exposed in every Stage 1 GET and POST response as the
   frontend-stable row handle (see `spec.md` Session 2026-06-20
   (ULID column), FR-021, and `data-model.md` §2.8).
3. **No migrations in Stage 1** — the MySQL schema, audit columns,
   ULID column, FK constraints, `UNIQUE` indexes, and the
   `subjects` / `levels` reference-list seed data are all created
   by the user against the user-prepared MySQL container (per
   FR-016 and the Session 2026-06-21 operational-rules clarification).
   The `docker compose up` boot sequence MUST NOT run any
   `typeorm-ts-node-commonjs migration:run` step. The
   `lib/db/migrations/` directory is out of Stage 1 scope.
4. **The reference-list seed pattern** — `subjects` and `levels` are
   populated by the user's own SQL against the user-prepared MySQL
   container, not by a boot-time seeder, an `npm run seed` step, or
   a typeORM migration.

The plan inherits the stack, container layout, and the per-entity
typeORM / Joi code from
[`001-teachers`](./../001-teachers/plan.md) and
[`002-classes`](./../002-classes/plan.md). 003 adds **one new
runtime dependency** (the [`ulid`](https://www.npmjs.com/package/ulid)
npm package, used to generate the new `ulid` column on every row
— see [research.md §3.11](./research.md#311-ulid-column-fr-021)),
**zero new endpoints**, and **zero new tables**. Its deliverables
are the cross-cutting helpers, the ULID generation helper, and the
OpenAPI contract files in `./contracts/`. Stage 1 endpoints are
all exposed under the version prefix `/api/v1.0/` (per FR-022,
owned by `003-backend-api-db`; see
[research.md §3.12](./research.md#312-api-version-prefix-fr-022)).

The 2026-06-20 (POST/GET reference object shape) clarification
folded the previously-flat `subject` / `level` / `formTeacher`
reference fields into nested `{ ulid, name }` objects on the public
API surface (see `spec.md` Clarifications,
Session 2026-06-20 (POST/GET reference object shape); FR-004, FR-005,
FR-020). The cross-cutting plan absorbs this by replacing the
`findTeacherByEmail` pre-INSERT check that 002 previously used with
a `findTeacherByUlid` lookup against `uq_teachers_ulid`; the same
`ulid`-keyed lookup pattern is applied to `subject.ulid` (`uq_subjects_ulid`)
and `level.ulid` (`uq_levels_ulid`). The `name` field on each
nested reference object is a display hint and is ignored
server-side.

## Technical Context

**Language/Version**: TypeScript 5.x with `strict: true` (per Constitution Principle II). No `.js` source files.

**Runtime**: Node.js LTS via the **same single Next.js 15 application**
as `001-teachers` and `002-classes`. The 003 code lives inside the
existing `app/api/` route handlers (as the `withApiContract` wrapper)
and inside `lib/api/` (the error-envelope and DB-error helpers).

**Primary Dependencies**: same as `001-teachers` and `002-classes` (see
[research.md §3.8](./research.md#38-cross-cutting-dependency-on-001-teachers-and-002-classes)),
plus **one new runtime dependency**: the
[`ulid`](https://www.npmjs.com/package/ulid) npm package — used by
the 001 and 002 entities to generate the new `ulid` column on every
insert (per FR-021 — Session 2026-06-20 ULID clarification; see
[research.md §3.11](./research.md#311-ulid-column-fr-021)). The full
set — including the `antd`, `tailwindcss`, `postcss`, and
`autoprefixer` packages added by `001-teachers/T001` per the
constitution v2.3.0 amendment (SGDS v3 → Ant Design + Tailwind CSS)
— is enumerated in
[`001-teachers/plan.md` Primary Dependencies](../001-teachers/plan.md#technical-context).
The `ulid` package is the only addition the 003 feature owns.

**Storage**: same MySQL 8 container as `001-teachers`. The 003 feature
adds **no new tables**; it owns the *cross-cutting* constraints. The
MySQL schema, audit columns, ULID column, FK constraints, UNIQUE
indexes, and the `subjects` / `levels` reference-list seed data are
all created by the user against the user-prepared MySQL container
(per FR-016, Session 2026-06-21). There is **no migration set** in
Stage 1; the previous migration inventory in
[legacy-data-model.md §4](./data-model.md#4-the-full-migration-set)
is preserved for the migration history but the migrations themselves
are removed from the project source.

**Testing**: Vitest (inherited from `001-teachers`). Three tiers per
[research.md §3.7](./research.md#37-test-strategy--three-tiers):
1. **Unit (`tests/unit/`)** — pure-function helpers. No DB, no
   network. New: `api-error.spec.ts`, `route-wrapper.spec.ts`,
   `db-error.spec.ts`, `ulid.spec.ts`.
2. **Contract (`tests/contract/`)** — exercise the Next.js server
   in isolation. New: `cross-cutting.api.spec.ts` (probes every
   status code in the cross-cutting table across all four endpoints
   under the `/api/v1.0/` prefix).
3. **Integration (`tests/integration/`)** — real MySQL container.
   New: `cross-cutting.spec.ts` (SC-007 race test, 10 concurrent
   POSTs).

**Target Platform**: same as `001-teachers` — Docker Desktop, Linux /
macOS / Windows host, Docker Compose v2.

**Project Type**: same as `001-teachers` and `002-classes` — single
Next.js web application. 003 adds new `lib/api/*` modules and new
tests; no new project, no new process, no new container.

**Performance Goals**: same as `001-teachers` — end-to-end form-time
≤ 30 s (`SC-001`), no API-level latency target in Stage 1. The
`withApiContract` wrapper is a thin synchronous shim (one header
check + a try/catch); the typeORM error-mapping helpers are a
single `switch` on the error code. The hot-path overhead is
negligible.

**Constraints**:
- All `001-teachers` and `002-classes` constraints apply (TS strict,
  no class-based code outside typeORM entities, Joi mirroring, etc.).
- The cross-cutting contract is **non-negotiable**: every route
  handler goes through `withApiContract`; every error response uses
  `{ "error": "..." }`; every status code is in the cross-cutting
  table; every endpoint uses the `/api/v1.0/` version prefix (per
  FR-022).
- There are **no migrations** in Stage 1 (per FR-016,
  Session 2026-06-21). The `docker compose up` boot sequence MUST
  NOT run a migration step. The MySQL schema is user-prepared.
- The four data-integrity rules (FR-006, FR-007, FR-008, FR-009,
  FR-009a) are enforced at the **DB layer** so direct writes that
  bypass the API are still rejected.
- The teacher `contactNumber` Joi pattern is `^\d{8}$` (exactly 8
  digits, no leading-digit restriction — per FR-004 in
  `001-teachers/spec.md`, Session 2026-06-21).
- ≤ 500 teachers, ≤ 500 classes (inherited Stage 1 upper bounds);
  no pagination.

**Scale/Scope**:
- 1 application process (Next.js, same as `001-teachers`) + 1
  database process (MySQL, same as `001-teachers`).
- 4 DB tables total (same as after `001` + `002`): `subjects`,
  `teachers`, `levels`, `classes`. All four are user-prepared.
- 0 new API endpoints (the four endpoints are owned by `001` and
  `002`; 003 owns the *contract* they conform to).
- 0 new client-rendered pages.
- 3 new `lib/api/*` modules (`route.ts` for the wrapper, `response.ts`
  for the envelope helpers, `db-error.ts` for the typeORM error
  mapping — the `response.ts` and `content-type.ts` modules already
  exist from `001`; 003 refines them and adds `db-error.ts`).
- 1 new `lib/ulid.ts` helper (`generateUlid()` thin wrapper around
  the `ulid` npm package, used by the 001 + 002 entities on insert
  per FR-021 — see [research.md §3.11](./research.md#311-ulid-column-fr-021)).
- 0 typeORM migrations (Stage 1 has no migration set; the
  user-prepared MySQL replaces the migration runner per FR-016).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Spec-Driven Development | ✅ Pass | Plan is generated by `/speckit-plan` after `/speckit-specify` + 5 clarification Q&As; tasks will be generated by `/speckit-tasks`; no source code is written before this plan is approved. |
| II. TypeScript End-to-End (`strict: true`) | ✅ Pass | Same single `tsconfig.json` as `001-teachers` covers the whole app; the new `lib/api/route.ts` wrapper and the `lib/api/db-error.ts` error-mapping helpers are pure-function `.ts` modules; the test suites are `.spec.ts`. |
| III. Unit Tests Required | ✅ Pass | Same Vitest setup as `001-teachers` / `002-classes`. The new `lib/api/*` helpers get unit tests (`api-error.spec.ts`, `route-wrapper.spec.ts`, `db-error.spec.ts`) covering every status code in the cross-cutting table and every typeORM error code in the mapping. The integration tier covers SC-007 (race) and SC-006 (migration rebuild). |
| IV. Single Role: Administrator | ✅ Pass | No auth, no roles; only the Administrator. The 003 plan adds no auth surface. |
| V. Simplicity (YAGNI) | ✅ Pass | No abstractions ahead of the spec. The cross-cutting helpers are 3 small modules of pure functions (`route.ts`, `response.ts`, `db-error.ts`). The `withApiContract` wrapper is ~15 lines. The DB-error mapper is a single `switch`. The contract files are 5 YAML files. No DTOs, no class-based service layers, no DI container. |
| VI. Functional-First (Classes Only When Necessary) | ✅ Pass | Same rule as `001-teachers` / `002-classes`: the new route-handler wrapper is a pure function; the new helpers are pure functions; the only classes are the typeORM entity classes (already present from `001` / `002`). 003 introduces zero new class-based code. |
| VII. Joi Schema Validation | ✅ Pass | The 003 plan does not introduce new request shapes. The existing Joi schemas from `001-teachers` (`teacher.ts`) and `002-classes` (`class.ts`) continue to enforce FR-004 / FR-005 / FR-006 / FR-007. The `withApiContract` wrapper does NOT bypass Joi — it only adds the content-type gate and the unhandled-rejection guard. |
| VIII. UI Quality — Self-Explanatory, Reusable, Simple | ✅ Pass | 003 introduces no new UI. The 001 and 002 UI components are now composed from `antd` primitives and styled with Tailwind CSS utility classes per the constitution v2.3.0 amendment (see [`001-teachers/plan.md` Principle VIII row](../001-teachers/plan.md#constitution-check) and [`002-classes/plan.md` Principle VIII row](../002-classes/plan.md#constitution-check) for the per-feature translation; the Session 2026-06-19 clarifications in each `spec.md` are the audit trail). |

**Stage Scope compliance** (per Constitution → Stage Scope):
- ✅ In scope: Backend APIs (`POST` + `GET` for Teachers, Classes; `GET` for Subjects, Levels); data model for `teachers`, `classes`, `subjects`, `levels` (the data-model is already created by `001` / `002` — 003 owns the cross-cutting view).
- ✅ Out of scope: Update/Delete, authentication, additional roles, additional entities, production deployment, observability — all not in the plan.

**Constitution TODO items status**:
- All `TODO(FEATURE_001)` items were resolved in the `001-teachers` plan (Vitest, docker-compose, `TODO(ANTD_TAILWIND_VERSION)` replacing the prior `TODO(SGDS_V3_PACKAGE)` per the constitution v2.3.0 amendment, Joi-alignment, functional-review). No new TODO items are introduced by this plan.
- New item introduced by this plan: `TODO(FEATURE_003)` — formalise the contract test suite (every status code in the cross-cutting table is exercised by an automated contract test). Tracked in `tasks.md`.
- New item introduced by the 2026-06-20 ULID clarification: `TODO(FEATURE_003_ULID)` — add the `ulid` npm package to `package.json` and ship the `lib/ulid.ts` generator wrapper; verify on `npm install` that the new dep resolves and the entity insert paths produce a 26-character Crockford Base32 string per row (per FR-021). Tracked in `tasks.md`.

No violations. No entries required in **Complexity Tracking**.

## Project Structure

### Documentation (this feature)

```text
specs/003-backend-api-db/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command) — owns the unified API contract
│   ├── common.yaml      # the cross-cutting error envelope + status-code responses (single source of truth)
│   ├── teachers.yaml    # POST/GET /api/v1.0/teachers
│   ├── classes.yaml     # POST/GET /api/v1.0/classes
│   ├── subjects.yaml    # GET /api/v1.0/subjects
│   └── levels.yaml      # GET /api/v1.0/levels
└── spec.md              # pre-existing
```

### Source Code (repository root)

The 003 feature extends the same Next.js codebase as `001-teachers`
and `002-classes`. New files are marked `(+)`; pre-existing files are
unmarked for clarity.

```text
app/                                                          # Next.js App Router
├── layout.tsx                                                # (pre-existing)
├── page.tsx                                                  # (pre-existing) Home
├── (pre-existing from 001-teachers and 002-classes)
└── (no new app/ files for 003)

lib/
├── api/                                                      # (003 refines; some files pre-existing from 001)
│   ├── response.ts                                           # (pre-existing) errorEnvelope(), jsonError(), jsonOk(), jsonCreated()
│   ├── content-type.ts                                       # (pre-existing) requireJson()
│   ├── route.ts                                              # (+) withApiContract(handler) — the cross-cutting wrapper; enforces the `/api/v1.0/` prefix and the Stage 1 status-code table
│   └── db-error.ts                                           # (+) typeORM QueryFailedError → status + message mapping
├── ulid.ts                                                   # (+) generateUlid() — thin wrapper over the `ulid` npm package (per FR-021)
├── db/
│   ├── data-source.ts                                        # (pre-existing; no `migrations` runner — the schema is user-prepared per FR-016)
│   └── entities/                                             # (pre-existing; +ulid column on each entity per FR-021)
└── config.ts                                                 # (pre-existing)

tests/
├── unit/
│   ├── (pre-existing from 001-teachers and 002-classes)
│   ├── api-error.spec.ts                                     # (+) every status code in the cross-cutting table
│   ├── route-wrapper.spec.ts                                 # (+) withApiContract — 415, 500, happy-path passthrough
│   ├── db-error.spec.ts                                      # (+) every typeORM error code in the mapping
│   └── ulid.spec.ts                                          # (+) generateUlid() — 26-char Crockford Base32, monotonicity toggleable, no collision over 10k calls
├── contract/
│   ├── (pre-existing from 001-teachers and 002-classes)
│   └── cross-cutting.api.spec.ts                             # (+) probes every status code across all four endpoints (includes `ulid` in every response shape)
└── integration/
    ├── (pre-existing from 001-teachers and 002-classes)
    └── cross-cutting.spec.ts                                 # (+) SC-007 race test (10 concurrent POSTs); asserts every response body carries `ulid`; asserts every endpoint lives under `/api/v1.0/`

docker/                                                       # (pre-existing from 001-teachers)
├── Dockerfile
├── docker-compose.yml
└── docker-compose.test.yml

.env.example                                                  # (pre-existing)
.env.local                                                    # (pre-existing, gitignored)
.env                                                          # (pre-existing, JSON, model config only)
.gitignore                                                    # (pre-existing)
package.json                                                  # (pre-existing, no new deps)
tsconfig.json                                                 # (pre-existing, strict: true)
next.config.mjs                                               # (pre-existing)
vitest.config.ts                                              # (pre-existing)
README.md                                                     # (pre-existing, contract for how to run)
```

**Structure Decision**: 003 adds **zero** new directories at the
project root. The cross-cutting helpers live in `lib/api/` alongside
the existing `response.ts` and `content-type.ts` modules; the new
test files live in `tests/unit/`, `tests/contract/`, and
`tests/integration/`. The contract files live in
`specs/003-backend-api-db/contracts/` (separate from the
per-feature contract files in `001-teachers/contracts/` and
`002-classes/contracts/`) so 003 owns the *unified* contract
independently of the per-feature implementation references.

## Complexity Tracking

> No Constitution Check violations. No entries required.
