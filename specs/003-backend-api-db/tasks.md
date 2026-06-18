# Tasks: Backend APIs and DB Schema

**Input**: Design documents from `/specs/003-backend-api-db/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests ARE explicitly requested by `spec.md` (SC-001, SC-002, SC-004, SC-006, SC-007 require automated tests). This file generates test tasks for every user story.

**Organization**: Tasks are grouped by user story (US1, US2, US3 — all P1) to enable independent implementation and testing of each cross-cutting concern.

**Cross-cutting note**: 003 is **not** an entity feature. It owns:
1. The shared API contract (`lib/api/route.ts` wrapper, error envelope, status-code table).
2. The DB-error mapping (`lib/api/db-error.ts`) that translates typeORM errors to the status-code table.
3. The migration-set ordering discipline (no new migrations; verification that the four existing migrations from `001-teachers` and `002-classes` run in the expected order).

`001-teachers` and `002-classes` already land their entity code, Joi schemas, and per-handler routes. 003 **extends** those four `app/api/*/route.ts` files (wraps them in `withApiContract`) and adds the cross-cutting helpers + tests.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single Next.js web app**: `app/`, `lib/`, `tests/` at repository root
- `app/api/<resource>/route.ts` — Next.js App Router route handlers
- `lib/api/` — cross-cutting HTTP helpers (the 003 sweet spot)
- `lib/db/` — typeORM DataSource, entities, migrations
- `tests/{unit,contract,integration}/` — three test tiers per `plan.md`
- `docker/` — Dockerfile + docker-compose + docker-compose.test
- `specs/003-backend-api-db/contracts/` — OpenAPI contract files (single source of truth)

---

## Phase 1: Setup (Inherited from 001-teachers)

**Purpose**: Confirm that the 001-teachers project skeleton (dependencies, env, test runner, container layout) already covers 003's needs — no new setup tasks are required. 003 adds **zero new dependencies**, **zero new endpoints**, **zero new tables**.

- [ ] T001 [P] Verify `package.json`, `.env.example`, `vitest.config.ts` from `001-teachers` are sufficient for 003 — confirm next@^15, react@^19, typeorm@^0.3, mysql2@^3, joi@^17, dotenv@^16, vitest are present and no new entries are needed
- [ ] T002 [P] Verify `docker/Dockerfile` and `docker/docker-compose.yml` from `001-teachers` include a migration:run hook on first boot — amend if missing so the four typeORM migrations run before `next start`

**Checkpoint**: Project skeleton confirmed — no setup work needed for 003.

---

## Phase 2: Foundational (Cross-Cutting Helpers)

**Purpose**: Build the three cross-cutting helpers (`response.ts` refinement, `route.ts` wrapper, `db-error.ts` mapper) that every user story depends on. These MUST be complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. The `withApiContract` wrapper and the `toApiError` mapper are the single source of truth for the cross-cutting contract.

- [ ] T003 [P] Refine `lib/api/response.ts` to confirm it exposes the four helpers the cross-cutting contract needs — `errorEnvelope(message: string)`, `jsonError(status: number, message: string)`, `jsonOk<T>(data: T)`, and `jsonCreated<T>(data: T)` (pre-existing from `001-teachers`; 003 verifies the shape matches the OpenAPI `ErrorResponse` / `DataListResponseOf*` schemas in `specs/003-backend-api-db/contracts/common.yaml`)
- [ ] T004 Create `lib/api/route.ts` implementing `withApiContract<Req, Res>(handler: (req: NextRequest) => Promise<NextResponse>, opts?: { successStatus?: number }): (req: NextRequest) => Promise<NextResponse>` — the cross-cutting wrapper that enforces (a) `Content-Type: application/json` on body-carrying requests via `requireJson`, (b) the success status-code default (`201 Created` for POST, `200 OK` for GET), and (c) an unhandled-rejection → `500 Internal Server Error` guard that wraps the response in the agreed `{ "error": "..." }` envelope without leaking stack traces
- [ ] T005 Create `lib/api/db-error.ts` implementing `toApiError(err: unknown): { status: number; message: string }` — the typeORM `QueryFailedError` → status mapping. Map: `ER_DUP_ENTRY` (with the matching index name) → `409 Conflict` with a domain-specific message, `ER_NO_REFERENCED_ROW_2` against `teachers.email` (form-teacher FK) → `404 Not Found`, `ER_NO_REFERENCED_ROW_2` against `subjects.name` or `levels.name` → `400 Bad Request`, `ER_LOCK_WAIT_TIMEOUT` / `ETIMEDOUT` / `ECONNREFUSED` (driver code) → `503 Service Unavailable`, anything else → `500 Internal Server Error` with a non-leaking generic message

**Checkpoint**: Foundation ready — every user story can now be implemented by composing `withApiContract` + `toApiError` + the per-feature handlers from `001-teachers` and `002-classes`.

---

## Phase 3: User Story 1 - Persist Teachers and Classes Reliably (Priority: P1) 🎯 MVP

**Goal**: Every teacher and class created via the API is persisted to MySQL and remains retrievable, with all attributes intact, after a server restart.

**Independent Test**: Create a teacher and a class through their respective API endpoints, restart the Next.js container, call the list endpoints again, and assert both records are returned with the exact `name` / `subject` / `email` / `contactNumber` / `level` / `formTeacher.name` they were created with. (Validates SC-001.)

### Tests for User Story 1

> **NOTE**: Write this test FIRST and ensure it FAILS against the un-wrapped route handlers from `001-teachers` / `002-classes` before applying `withApiContract` (the wrapper is what normalises the success responses to the cross-cutting envelope).

- [ ] T006 [P] [US1] Integration test for SC-001 persistence-across-restart in `tests/integration/cross-cutting.spec.ts` — start the Next.js container against a clean MySQL, POST one teacher and one class, stop the container, restart it, GET both endpoints, assert both records are returned with all attributes intact (the test owns the docker-compose lifecycle for this scenario)

### Implementation for User Story 1

- [ ] T007 [P] [US1] Apply `withApiContract` to `app/api/teachers/route.ts` — wrap the existing POST + GET handlers (from `001-teachers` tasks T028 and T040); the wrapper supplies the 200/201 success status default and the unhandled-rejection guard, while the handlers keep their existing Joi validation and repository calls
- [ ] T008 [P] [US1] Apply `withApiContract` to `app/api/subjects/route.ts` — wrap the existing GET handler (from `001-teachers` task T041); no body, no 415 gate, no POST 201 default — just the 200 passthrough and the 500 guard
- [ ] T009 [P] [US1] Apply `withApiContract` to `app/api/classes/route.ts` — wrap the existing POST + GET handlers (from `002-classes` tasks T017 and T028); same wrapper shape as the teachers route
- [ ] T010 [P] [US1] Apply `withApiContract` to `app/api/levels/route.ts` — wrap the existing GET handler (from `002-classes` task T029); mirror the subjects-route treatment

**Checkpoint**: At this point, User Story 1 is fully functional and testable independently — restart-survival is proven by `T006`, the success envelope is uniform across all four endpoints (FR-011), and every error response uses `{ "error": "..." }` (FR-012). The application is ready to land the MVP.

---

## Phase 4: User Story 2 - Enforce Data Integrity Rules at the Data Layer (Priority: P1)

**Goal**: Every business invariant (`UNIQUE(teachers.email)`, `UNIQUE(classes.name)`, `UNIQUE(classes.form_teacher_email)`, and the three foreign keys) is enforced at the DB layer so direct writes that bypass the API cannot violate it. Concurrent races resolve to exactly one winner.

**Independent Test**: Attempt to violate each invariant both via the API (each violation returns the agreed status code and message) and directly against MySQL (each `INSERT` that would violate a `UNIQUE` constraint or `FOREIGN KEY` is rejected by the DB). For race-safety, fire 10 concurrent POSTs with the same form teacher and assert exactly one succeeds. (Validates SC-002, SC-003, SC-007, FR-006, FR-007, FR-008, FR-009, FR-009a.)

### Tests for User Story 2

> **NOTE**: Write these tests FIRST and ensure they FAIL (the DB-error mapping and the per-handler catches don't exist yet).

- [ ] T011 [P] [US2] Unit test for `toApiError` in `tests/unit/db-error.spec.ts` — exhaustively cover every mapped code: `ER_DUP_ENTRY` on `uq_teachers_email` → `409 "Email already in use"`, `ER_DUP_ENTRY` on `uq_classes_name` → `409 "Class name already in use"`, `ER_DUP_ENTRY` on `uq_classes_form_teacher` → `409 "Teacher is already assigned to another class"`, `ER_NO_REFERENCED_ROW_2` on the form-teacher FK → `404 "Teacher not found"`, `ER_NO_REFERENCED_ROW_2` on `subjects` FK → `400 "Invalid subject"`, `ER_NO_REFERENCED_ROW_2` on `levels` FK → `400 "Invalid level"`, `ER_LOCK_WAIT_TIMEOUT` → `503`, `ECONNREFUSED` → `503`, unknown `QueryFailedError` → `500` with a non-leaking generic message, non-`QueryFailedError` → `500` fallback
- [ ] T012 [P] [US2] Integration test for SC-002 + FR-006/FR-008/FR-009 in `tests/integration/cross-cutting.spec.ts` (extend T006 with new test blocks) — POST a teacher, POST a second teacher with the same email (assert `409 "Email already in use"`), POST a class with the first teacher, POST a second class with the same name (assert `409 "Class name already in use"`), POST a second class with the same form teacher (assert `409 "Teacher is already assigned to another class"`), then directly INSERT the same duplicate via the typeORM DataSource (assert the DB rejects with `ER_DUP_ENTRY`)
- [ ] T013 [P] [US2] Integration test for SC-007 race-safe form-teacher uniqueness in `tests/integration/cross-cutting.spec.ts` (extend T012) — pre-seed one teacher, fire 10 concurrent `POST /api/classes` requests with that teacher as the form teacher via `Promise.all`, assert exactly one returns `201` and the other nine return `409 "Teacher is already assigned to another class"`, then assert the `classes` table has exactly one row

### Implementation for User Story 2

- [ ] T014 [P] [US2] Catch `QueryFailedError` in `app/api/teachers/route.ts` POST handler — wrap the `teacherRepository.save(...)` call, pass the caught error to `toApiError`, and return the resulting `{ status, message }` via `jsonError`; only `ER_DUP_ENTRY` on `uq_teachers_email` is caught here (every other `ER_DUP_ENTRY` on this table is impossible — the table has only one unique index)
- [ ] T015 [P] [US2] Catch `QueryFailedError` in `app/api/classes/route.ts` POST handler — wrap the `classRepository.save(...)` call, pass the caught error to `toApiError`, and return the resulting `{ status, message }` via `jsonError`; both `ER_DUP_ENTRY` variants (`uq_classes_name`, `uq_classes_form_teacher`) and the `ER_NO_REFERENCED_ROW_2` on the form-teacher FK are routed through the mapper from T005
- [ ] T016 [P] [US2] Document the cross-cutting invariant table in `lib/db/migrations/README.md` (new file) — for each of the four migrations, list the constraints it creates (`UNIQUE(teachers.email)`, `UNIQUE(classes.name)`, `UNIQUE(classes.form_teacher_email)`, `FK(teachers.subject → subjects.name)`, `FK(classes.level → levels.name)`, `FK(classes.form_teacher_email → teachers.email)`) and which FR / SC each constraint satisfies; this is the migration-order and integrity-contract single source of truth that 003 owns

**Checkpoint**: At this point, User Stories 1 AND 2 are both independently testable — persistence is proven by `T006`, the four DB integrity rules are proven by `T012`, the race-safety invariant is proven by `T013`, and the API surfaces every violation with the agreed status code + message via `toApiError`.

---

## Phase 5: User Story 3 - Expose a Consistent API Contract (Priority: P1)

**Goal**: Every API endpoint follows the same conventions for content type, success response shape, error response shape, and HTTP status codes — one envelope, one status-code table, one client-side error-handling path.

**Independent Test**: Issue a representative sample of requests across all four endpoints under both success and error conditions and verify every response uses the agreed envelope, content type, and status-code mapping. Schema can be rebuilt from scratch via the migration entry point and matches the spec on a clean DB. (Validates SC-004, SC-006, FR-002, FR-003, FR-010, FR-013, FR-017.)

### Tests for User Story 3

> **NOTE**: Write these tests FIRST and ensure they FAIL (the wrapper, the response helpers, and the migration-order discipline are not yet exercised as a unit).

- [ ] T017 [P] [US3] Unit test for `lib/api/response.ts` in `tests/unit/api-error.spec.ts` — assert every status code in the cross-cutting table (`400`, `404`, `409`, `415`, `500`, `503`) produces a `Response` with the correct status and a body that JSON-parses to `{ "error": "<non-empty string>" }`; assert `jsonOk` and `jsonCreated` produce the documented shape and status
- [ ] T018 [P] [US3] Unit test for `withApiContract` in `tests/unit/route-wrapper.spec.ts` — assert: a POST with `Content-Type: text/plain` is rejected with `415` and the agreed envelope, a POST with `Content-Type: application/json` returns `201` by default, a GET (no body) skips the content-type gate and returns `200` by default, a handler that throws a generic `Error` is caught and returns `500` with a non-leaking message, a handler that throws a `QueryFailedError` with `ER_DUP_ENTRY` is caught by the inner handler's `toApiError` call (the wrapper does NOT translate — that is the handler's responsibility) and returns the agreed status
- [ ] T019 [P] [US3] Contract test for the cross-cutting contract in `tests/contract/cross-cutting.api.spec.ts` — for each of the four endpoints, probe every status code in the cross-cutting table by issuing the smallest request that produces it: `415` on non-JSON, `400` on malformed body, `409` on duplicate (after a successful seed), `404` on form-teacher-not-found (classes POST), `200` on empty list, `201` on successful create, `500` on a handler-level forced throw (only in test mode); assert each response carries `Content-Type: application/json` and the agreed envelope
- [ ] T020 [P] [US3] Integration test for SC-006 schema rebuild in `tests/integration/migration.spec.ts` — start with an empty MySQL container, run `npm run db:rebuild` (which drops all tables and re-runs the four migrations), then assert via the typeORM DataSource that the four tables (`subjects`, `teachers`, `levels`, `classes`) exist, all unique indexes are present, all three foreign keys are present, and the seed lists (9 subjects, 10 levels) are populated

### Implementation for User Story 3

- [ ] T021 [P] [US3] Document the cross-cutting status-code table in `lib/api/README.md` (new file) — single source of truth for the API contract. List every status code (`400`, `404`, `409`, `415`, `500`, `503`) with: the failure condition, the message convention, and which file produces it (handler, `toApiError`, or `requireJson`). Cross-link to `specs/003-backend-api-db/contracts/common.yaml`.
- [ ] T022 [P] [US3] Add a JSDoc header block to `lib/api/route.ts` (extending T004) — document that `withApiContract` is the **single enforcement point** for the cross-cutting contract, the two guarantees it provides (content-type gate + unhandled-rejection guard), and the one guarantee it explicitly does NOT provide (status-code translation for typed DB errors — that is the handler's responsibility via `toApiError`)
- [ ] T023 [US3] Verify `lib/api/content-type.ts` `requireJson()` returns `415 Unsupported Media Type` with the agreed envelope (pre-existing from `001-teachers` task T012; 003 verifies the shape and adds a unit test to `tests/unit/api-error.spec.ts` via T017)
- [ ] T024 [P] [US3] Update `docker/docker-compose.yml` (extending T002) — add a `migration` one-shot service that runs `npm run migration:run` against the MySQL service with `depends_on.mysql.condition: service_healthy`, and a `package.json` script `migration:run` that invokes `typeorm-ts-node-commonjs migration:run -d lib/db/data-source.ts`; the app service then `depends_on.migration.condition: service_completed_successfully` so the migrations always run before `next start`

**Checkpoint**: At this point, all three user stories are independently functional — persistence is proven by `T006`, DB integrity by `T012`/`T013`, the API contract by `T017`/`T018`/`T019`, and the migration-set ordering + seed pattern by `T020`. The cross-cutting layer is fully landed.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cross-artifact consistency, and the final compliance checks that close the SDD gate.

- [ ] T025 [P] Update root `README.md` with the 003 status-code table — link to `lib/api/README.md` from T021 and add a one-paragraph "Cross-cutting API contract" section that names `withApiContract` and `toApiError` as the two enforcement points
- [ ] T026 [P] Run `/speckit-analyze` for cross-artifact consistency — verify `spec.md` ↔ `plan.md` ↔ `tasks.md` ↔ `contracts/` agree on the status-code table, the four migrations, the four endpoints, the 5 unique/FK constraints, and the success / error response shapes
- [ ] T027 [P] Constitution compliance review (Principles II, VI, VII) — confirm `strict: true` is on in `tsconfig.json` for `lib/api/route.ts` and `lib/api/db-error.ts`; confirm no class-based code was introduced outside the typeORM entities (the helpers are pure functions); confirm the existing Joi schemas from `001-teachers` / `002-classes` are unchanged and still mirror the contract fields
- [ ] T028 [P] Run the 13 quickstart scenarios from `specs/003-backend-api-db/quickstart.md` end-to-end — error envelope, 415 gate, unknown reference, DB integrity, schema rebuild, migration idempotency, persistence, race-safety, atomic write, cross-feature consistency, reference-list response, unit tests, integration tests
- [ ] T029 [P] Verify the four typeORM migrations run in the expected order on first boot — start a clean `docker compose up`, capture the migration log, assert the order is `InitSchema` → `SeedSubjects` → `InitClasses` → `SeedLevels`; add an assertion to `tests/integration/migration.spec.ts` (extend T020) that re-runs the migrations on a populated DB and asserts the operation is a no-op (FR-016, FR-017)
- [ ] T030 [P] Add a `db:rebuild` script to `package.json` — `"db:rebuild": "typeorm-ts-node-commonjs schema:drop -d lib/db/data-source.ts && typeorm-ts-node-commonjs migration:run -d lib/db/data-source.ts"`; used by `tests/integration/migration.spec.ts` (T020) and as a developer convenience for the SC-006 quickstart scenario

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately; verifies inherited scaffolding.
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**. The three helpers (`response.ts` refinement, `route.ts` wrapper, `db-error.ts` mapper) are prerequisites for every user story.
- **User Stories (Phase 3–5)**: All depend on Foundational phase completion.
  - All three stories are P1, so they share priority. US1 is the MVP gate; US2 and US3 add cross-cutting concerns on top of US1.
  - US2 depends on US1 (US2 wraps the same four route handlers that US1 wraps) — they can proceed in parallel once US1's wrapper is in place.
  - US3 is independent of US1 / US2 once Foundational is complete — its tests exercise the helpers, not the per-handler code.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### User Story Dependencies

- **User Story 1 (P1, MVP)**: Depends on Foundational (`T003`–`T005`). No dependencies on US2 / US3.
- **User Story 2 (P1)**: Depends on Foundational (`T004`–`T005`) **and** on US1's wrappers being in place (`T007`–`T010`) so the per-handler catches can hook into the existing route handlers.
- **User Story 3 (P1)**: Depends on Foundational only. Independent of US1 / US2 once the helpers exist.

### Within Each User Story

- Tests are written FIRST and MUST FAIL before implementation lands (the spec explicitly references SC-001, SC-002, SC-004, SC-006, SC-007).
- Helpers (`T003`–`T005`) before route-handler wrappers (`T007`–`T010`) before per-handler error catches (`T014`–`T015`).
- `toApiError` (`T005`) before the per-handler catches that use it (`T014`, `T015`).
- Wrapper (`T004`) before any test that probes it (`T018`).

### Parallel Opportunities

- All Setup tasks marked `[P]` can run in parallel (different files, no dependencies).
- All Foundational tasks marked `[P]` can run in parallel — `T003` refines `response.ts`, `T004` creates `route.ts`, `T005` creates `db-error.ts`; none of them import each other.
- All wrapper applications marked `[P]` (`T007`–`T010`) can run in parallel — different files, no cross-dependencies.
- All per-handler catches marked `[P]` (`T014`–`T015`) can run in parallel — different files, same mapper.
- All US3 test tasks marked `[P]` (`T017`–`T020`) can run in parallel — different files.
- All US3 implementation tasks marked `[P]` (`T021`, `T022`, `T024`) can run in parallel — different files.
- All Polish tasks marked `[P]` (`T025`–`T030`) can run in parallel — different files (verification / documentation tasks).

---

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together (different files, no dependencies):
Task: "Unit test for toApiError in tests/unit/db-error.spec.ts"
Task: "Integration test for SC-002 four DB rules in tests/integration/cross-cutting.spec.ts"
Task: "Integration test for SC-007 race-safe form-teacher in tests/integration/cross-cutting.spec.ts"

# Launch all per-handler error catches together (different files, same mapper):
Task: "Catch QueryFailedError in app/api/teachers/route.ts (POST)"
Task: "Catch QueryFailedError in app/api/classes/route.ts (POST)"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 3 — persistence + API contract)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T005) — **CRITICAL, blocks all stories**
3. Complete Phase 3: User Story 1 (T006–T010) — persistence proven by the integration test
4. Complete Phase 5: User Story 3 helpers (T017–T022) — the cross-cutting contract is locked in
5. **STOP and VALIDATE**: run T006 (persistence) and T019 (cross-cutting contract) together — the MVP is the four endpoints persisting and conforming to the contract
6. Deploy / demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently (T006) → MVP deployable
3. Add User Story 2 → Test independently (T012 + T013) → DB integrity hardened
4. Add User Story 3 → Test independently (T017–T020) → Cross-cutting contract locked
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers (or sub-agents in `/speckit-implement`):

1. **Dev A** runs Setup + Foundational (T001–T005) — must finish before anything else starts
2. Once Foundational is done:
   - **Dev A**: User Story 1 (T006–T010) — the MVP wire-up
   - **Dev B**: User Story 3 helpers (T017, T018, T021, T022) — independent of US1
   - **Dev C**: User Story 2 tests (T011–T013) — independent of US1 (the mapper is in T005)
3. After US1 is done, **Dev B** finishes US2 (T014–T015) — the per-handler catches hook into the wrapped handlers from US1
4. All converge for Polish (Phase 6)

---

## Notes

- `[P]` tasks = different files, no dependencies — safe to parallelise.
- `[Story]` label maps each task to a specific user story for traceability. Setup, Foundational, and Polish have NO story label (they are cross-cutting).
- Each user story is independently completable and testable. US1 is the MVP gate.
- Tests are written FIRST and MUST FAIL before implementation lands — this is non-negotiable for the SDD cycle and for the spec's SC-001 / SC-002 / SC-004 / SC-006 / SC-007 success criteria.
- The four `app/api/*/route.ts` files modified by US1 / US2 already exist from `001-teachers` and `002-classes`; 003 does NOT create them — it only wraps them. If `001-teachers` or `002-classes` has not landed yet, run those `/speckit-implement` flows first.
- The cross-cutting contract is **non-negotiable**: every route handler goes through `withApiContract`; every error response uses `{ "error": "..." }`; every status code is in the table documented in `lib/api/README.md` (T021). The contract tests in `T019` are the automated guard.
- Commit after each task or logical group (per 001-teachers' commit cadence).
- Stop at any checkpoint to validate the story independently — the integration tests are designed to be runnable against a live `docker compose up` stack.
- Avoid: writing per-endpoint error envelopes outside `lib/api/` (use `jsonError` + `toApiError`); introducing new Joi schemas (the existing ones from 001 / 002 are the contract); adding new dependencies; bypassing `withApiContract` in any handler.
