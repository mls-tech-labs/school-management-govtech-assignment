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
   `UNIQUE(classes.form_teacher_email)`, the cross-feature
   `FOREIGN KEY(classes.form_teacher_email → teachers.email)`,
   the `FOREIGN KEY(teachers.subject → subjects.name)`, and the
   `FOREIGN KEY(classes.level → levels.name)`. Each rule is
   enforced by the DB so even direct writes that bypass the API
   cannot violate it.
3. **The migration-set ordering discipline** — the four typeORM
   migrations (`InitSchema`, `SeedSubjects`, `InitClasses`,
   `SeedLevels`) run in timestamp order on `docker compose up` and
   are idempotent on re-run (per FR-016, FR-017).
4. **The reference-list seed pattern** — `subjects` and `levels` are
   populated by separate seed migrations (`INSERT IGNORE`), not by a
   boot-time seeder, an `npm run seed` step, or a manual SQL file.

The plan inherits the stack, container layout, and the per-entity
typeORM / Joi code from
[`001-teachers`](./../001-teachers/plan.md) and
[`002-classes`](./../002-classes/plan.md). 003 adds **zero new
dependencies**, **zero new endpoints**, and **zero new tables**. Its
deliverables are the cross-cutting helpers, the migration-order
verification, and the OpenAPI contract files in `./contracts/`.

## Technical Context

**Language/Version**: TypeScript 5.x with `strict: true` (per Constitution Principle II). No `.js` source files.

**Runtime**: Node.js LTS via the **same single Next.js 15 application**
as `001-teachers` and `002-classes`. The 003 code lives inside the
existing `app/api/` route handlers (as the `withApiContract` wrapper)
and inside `lib/api/` (the error-envelope and DB-error helpers).

**Primary Dependencies**: same as `001-teachers` and `002-classes` (see
[research.md §3.8](./research.md#38-cross-cutting-dependency-on-001-teachers-and-002-classes)).
No new dependencies. Specifically:
- `next@^15`, `react@^19`, `react-dom@^19`
- `typeorm@^0.3`, `mysql2@^3`
- `joi@^17`
- `dotenv@^16`
- `vitest` (dev)

**Storage**: same MySQL 8 container as `001-teachers`. The 003 feature
adds **no new tables**; it owns the *cross-cutting* constraints and
the *migration-set ordering*. Per [data-model.md §4](./data-model.md#4-the-full-migration-set),
the four typeORM migrations run in this order:

| # | File | Owner |
|---|---|---|
| 1 | `InitSchema.ts` (creates `subjects`, `teachers`) | 001-teachers |
| 2 | `SeedSubjects.ts` (seeds 9 subjects) | 001-teachers |
| 3 | `InitClasses.ts` (creates `levels`, `classes`) | 002-classes |
| 4 | `SeedLevels.ts` (seeds 10 levels) | 002-classes |

**Testing**: Vitest (inherited from `001-teachers`). Three tiers per
[research.md §3.7](./research.md#37-test-strategy--three-tiers):
1. **Unit (`tests/unit/`)** — pure-function helpers. No DB, no
   network. New: `api-error.spec.ts`, `route-wrapper.spec.ts`,
   `db-error.spec.ts`.
2. **Contract (`tests/contract/`)** — exercise the Next.js server
   in isolation. New: `cross-cutting.api.spec.ts` (probes every
   status code in the cross-cutting table across all four endpoints).
3. **Integration (`tests/integration/`)** — real MySQL container.
   New: `cross-cutting.spec.ts` (SC-007 race test, 10 concurrent
   POSTs), `migration.spec.ts` (FR-016 / SC-006 schema rebuild from
   scratch).

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
  table.
- The migration set is **ordered** and **idempotent**. Re-running the
  set on a populated MySQL is a no-op.
- The four data-integrity rules (FR-006, FR-007, FR-008, FR-009,
  FR-009a) are enforced at the **DB layer** so direct writes that
  bypass the API are still rejected.
- ≤ 500 teachers, ≤ 500 classes (inherited Stage 1 upper bounds);
  no pagination.

**Scale/Scope**:
- 1 application process (Next.js, same as `001-teachers`) + 1
  database process (MySQL, same as `001-teachers`).
- 4 DB tables total (same as after `001` + `002`): `subjects`,
  `teachers`, `levels`, `classes`.
- 0 new API endpoints (the four endpoints are owned by `001` and
  `002`; 003 owns the *contract* they conform to).
- 0 new client-rendered pages.
- 3 new `lib/api/*` modules (`route.ts` for the wrapper, `response.ts`
  for the envelope helpers, `db-error.ts` for the typeORM error
  mapping — the `response.ts` and `content-type.ts` modules already
  exist from `001`; 003 refines them and adds `db-error.ts`).
- 4 typeORM migrations total (1 from `001`, 1 from `001` seed, 1
  from `002`, 1 from `002` seed); 003 adds **0** migrations but
  owns the *ordering* and the *idempotency contract*.

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
| VIII. UI Quality — Self-Explanatory, Reusable, Simple | ✅ Pass | 003 introduces no new UI. The 001 and 002 UI components are unaffected. |

**Stage Scope compliance** (per Constitution → Stage Scope):
- ✅ In scope: Backend APIs (`POST` + `GET` for Teachers, Classes; `GET` for Subjects, Levels); data model for `teachers`, `classes`, `subjects`, `levels` (the data-model is already created by `001` / `002` — 003 owns the cross-cutting view).
- ✅ Out of scope: Update/Delete, authentication, additional roles, additional entities, production deployment, observability — all not in the plan.

**Constitution TODO items status**:
- All `TODO(FEATURE_001)` items were resolved in the `001-teachers` plan (Vitest, docker-compose, SGDS v3 pin, Joi-alignment, functional-review). No new TODO items are introduced by this plan.
- New item introduced by this plan: `TODO(FEATURE_003)` — formalise the contract test suite (every status code in the cross-cutting table is exercised by an automated contract test). Tracked in `tasks.md`.

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
│   ├── teachers.yaml    # POST/GET /api/teachers
│   ├── classes.yaml     # POST/GET /api/classes
│   ├── subjects.yaml    # GET /api/subjects
│   └── levels.yaml      # GET /api/levels
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
│   ├── route.ts                                              # (+) withApiContract(handler) — the cross-cutting wrapper
│   └── db-error.ts                                           # (+) typeORM QueryFailedError → status + message mapping
├── db/
│   ├── data-source.ts                                        # (pre-existing)
│   ├── entities/                                             # (pre-existing)
│   └── migrations/                                           # (4 migrations, all pre-existing from 001 + 002; 003 owns the order)
└── config.ts                                                 # (pre-existing)

tests/
├── unit/
│   ├── (pre-existing from 001-teachers and 002-classes)
│   ├── api-error.spec.ts                                     # (+) every status code in the cross-cutting table
│   ├── route-wrapper.spec.ts                                 # (+) withApiContract — 415, 500, happy-path passthrough
│   └── db-error.spec.ts                                      # (+) every typeORM error code in the mapping
├── contract/
│   ├── (pre-existing from 001-teachers and 002-classes)
│   └── cross-cutting.api.spec.ts                             # (+) probes every status code across all four endpoints
└── integration/
    ├── (pre-existing from 001-teachers and 002-classes)
    ├── cross-cutting.spec.ts                                 # (+) SC-007 race test (10 concurrent POSTs)
    └── migration.spec.ts                                     # (+) SC-006 schema rebuild from migrations alone

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
