# Research: Teachers & Classes — UPDATE / DELETE Mutations (006)

**Date**: 2026-06-22
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)

This document captures the open Technical Context decisions from
`plan.md`. Most stack decisions are inherited from
[`001-teachers`](../001-teachers/research.md) and
[`002-classes`](../002-classes/research.md), and the authentication
+ hardening posture is inherited from
[`004-user-auth`](../004-user-auth/research.md) and
[`005-security-hardening`](../005-security-hardening/research.md).
This document focuses on the 006-specific decisions (single-resource
GET pivot per v2.6.0, the DELETE-Teacher 409 envelope simplification,
the form-teacher referential integrity check, the concurrent-edit
toast, the Row Actions Menu component split) and explicitly
cross-references the inherited ones.

---

## 6.1. Stack inheritance from 001 / 002 / 004 / 005

**Decision**: Reuse the locked stack from `001-teachers` and
`002-classes` as-is — same Next.js 15, same typeORM 0.3, same MySQL
8, same Joi 17, same **Ant Design (`antd`)** + **Tailwind CSS**
(per Constitution v2.3.0), same Vitest, same docker-compose
layout, plus the `ulid` npm package inherited from
`003-backend-api-db` for the cross-cutting `ulid` row-handle
column. Inherit `argon2` + `ioredis` + `ioredis-mock` from
`004-user-auth` and the CORS / CSP / CSRF / XSS posture from
`005-security-hardening`. **No new runtime dependencies, no new
devDependencies, no new tables, no new typeORM migrations, no new
design tokens** are introduced by this feature.

**Rationale**:
- The Constitution's Principle V (Simplicity) says "no dependencies
  added 'because we might need it'". The Stage 3 surface is
  satisfied by the existing stack: the new route handlers use the
  same `withApiContract` + `withAuth` + `withCsrf` middleware
  chain from Stages 1 + 2; the new RSC pages use the same
  `(authed)` route group from `004-user-auth`; the new Joi
  schemas reuse the same `buildCreateXxxSchema()` factory pattern
  from `001-teachers` and `002-classes`; the new repository
  methods reuse the same typeORM data-source from Stages 1 + 2.
- The same Next.js codebase hosts all five features (per the
  Constitution's "one process" rule). The new routes and pages
  are siblings to the existing `app/api/v1.0/teachers/*` and
  `app/(authed)/teachers/*` trees.
- The Singapore `^[89]\d{7}$` contact-number rule is a **one-line
  regex change** in the Joi schema (per FR-013 of 006 spec); the
  corresponding unit tests are updated to cover the leading-digit
  rejection path. No new validation library, no new dependency.

**Cross-references** (decisions made in the 001/002/004/005 plans
and inherited here without re-deriving):
- Unit-test runner: Vitest (per [`001-teachers/research.md §1.1`](../001-teachers/research.md#11-unit-test-runner-vitest-vs-jest))
- Container layout: docker-compose with 3 services (per `001-teachers` + `004-user-auth`) — `app`, `mysql`, `redis` — unchanged by 006
- UI library and styling version pin: Ant Design + Tailwind CSS (per `001-teachers/research.md §1.3` + Constitution v2.3.0)
- typeORM 0.3 + mysql2 (per `001-teachers/research.md §1.4`)
- Joi 17 (per `001-teachers/research.md §1.5`)
- Next.js 15 + React 19 + App Router (per `001-teachers/research.md §1.7` + `004-user-auth/research.md`)
- Session store: Redis 7 (per `004-user-auth/research.md §2`)
- Authentication middleware: `withAuth` (per `004-user-auth/research.md §3`)
- CSRF middleware: double-submit cookie (per `005-security-hardening/research.md §3`)
- CORS / CSP / XSS posture: inherited from `005-security-hardening/plan.md` and the constitution Principle IX

**Alternatives considered**:
- **Re-derive the stack** — wasteful and risks subtle drift between
  the five features. Rejected.
- **Split the codebase** — explicitly forbidden by the
  Constitution's "one process" rule. Rejected.
- **Introduce a new form library / validation library / UI
  library** — would be a YAGNI violation (Principle V). Rejected.

---

## 6.2. Single-resource GET endpoints (v2.6.0 amendment)

**Decision**: The 006 feature ships two new single-resource GET
endpoints — `GET /api/v1.0/teachers/[ulid]` and
`GET /api/v1.0/classes/[ulid]` — owned by this feature
implementation but **defined in the spec of the parent feature**
(`001-teachers/spec.md` FR-007b for Teachers,
`002-classes/spec.md` FR-007b for Classes, per Constitution
v2.6.0). The endpoints return the row in the same shape as a
single entry in the corresponding list endpoint (per the
`003-backend-api-db/spec.md` Clarifications Session 2026-06-20
(POST/GET reference object shape) — i.e., the `subject` / `level`
/ `formTeacher` fields are nested `{ ulid, name }` objects).
Both endpoints are authenticated (Principle IV — `401` without a
valid session cookie, inherited from `003-backend-api-db/spec.md`
FR-013) and CSRF-exempt (GET is exempt per Principle IX.3). A
`404 Not Found` is returned on an unknown `ulid` (per the
constitution v2.6.0 amendment to the Stage 3 In Scope block).

**Rationale**:
- The constitution v2.6.0 amendment authorises these endpoints in
  Stage 3 In Scope. The 006 spec's Q2 (re-answer per constitution
  v2.6.0) pivots the Edit page's data source from the previous
  RSC + typeORM fallback (Option C in the prior session) to the
  new dedicated GET endpoints (Option B). The new endpoints are
  the only Stage 3 data source for the Edit pages; the RSC +
  typeORM fallback is superseded.
- The 006 implementation owns the route handlers (this is the
  feature that ships the Edit pages), but the per-spec FR-007b
  additions in `001-teachers/spec.md` / `002-classes/spec.md`
  are the canonical references for the wire shape. The
  implementation here is the actual route handler code; the spec
  in 001 / 002 is the contract.
- Returning the row in the same shape as a list entry means the
  Edit form's "edit mode" is a pure prop-driven render of the
  same form component the Add form uses — no new wire format, no
  new shape, no new client-side adapter. The existing
  `TeacherForm.tsx` and `ClassForm.tsx` gain an `initialValues`
  prop (pre-populated when in edit mode) without any other
  change.

**Alternatives considered**:
- **RSC + typeORM (Option C in the prior 006 Q2 session)** —
  would have introduced a server-side data layer that bypasses
  the cross-cutting `/api/v1.0/*` contract and the authentication
  middleware. The 006 Edit pages would have needed their own
  DB-connection handling, their own error envelope, their own
  auth check (or a separate "RSC can read directly from the DB
  on behalf of an authenticated admin" carve-out in the
  authentication boundary). The constitution v2.6.0 amendment
  superseded this option in favor of the dedicated GET endpoints.
  Rejected.
- **Client-side fetch on mount (Option A in the prior 006 Q2
  session)** — would have meant a client-side blank / loading
  state during the data population step. The constitution v2.6.0
  amendment authorises the new endpoints precisely so the Edit
  page can render with a populated form on first paint (per 006
  spec FR-002 / FR-003 "The page MUST render with a populated
  form on first paint (no client-side blank state during data
  population)"). Rejected.

---

## 6.3. DELETE-Teacher 409 envelope simplification (one-to-one)

**Decision**: The DELETE-Teacher 409 envelope is the **singular
object** shape per Clarifications Session 2026-06-22 (DELETE-Teacher
409 envelope — one-to-one simplification):

```json
{
  "error": "Teacher is assigned as form teacher of class \"<className>\". Reassign or delete that class first.",
  "details": {
    "classUlid": "<classUlid>",
    "className": "<className>"
  }
}
```

The previous array envelope (`details.classUlids[]` /
`details.classNames[]`) and the N > 5 truncation logic (per the
prior Q3 / Q5 answers) are superseded.

**Rationale**:
- The DB's `UNIQUE INDEX uq_classes_form_teacher_id` on
  `classes.form_teacher_id` guarantees at most one class can
  reference a given teacher as form teacher. The N (number of
  affected classes) is always 0 or 1 at the database layer; the
  array envelope and the N > 5 truncation logic were over-spec'd
  defensive code for a many-to-one relaxation that the schema
  forbids.
- The singular envelope is **simpler** (one shape, not an array
  shape with a truncation rule), **more testable** (one example
  value, not a range), and **more honest** (matches the actual
  cardinality of the failure mode).
- The `details.classUlid` is preserved in the wire envelope for
  programmatic consumers that want to deep-link the admin to
  `/classes/[ulid]/edit` (per 006 spec FR-005 / FR-009). The
  Option C "drop the `details` field entirely and embed the
  class name in the `error` string" alternative was rejected
  because the structured `classUlid` is useful for the
  deep-link UX.

**Alternatives considered**:
- **Keep the array envelope (Option A in the Q6 question)** —
  defensive for a future many-to-one relaxation. Rejected
  because the schema forbids many-to-one (UNIQUE constraint); a
  future relaxation would require a schema change and a
  per-spec amendment to the spec, and would re-open the
  truncation question at that time. The current schema's
  invariant is the source of truth.
- **Drop the `details` field entirely (Option C in the Q6
  question)** — simpler wire format, no `details` extension
  for downstream consumers. Rejected because the structured
  `classUlid` is useful for deep-linking to
  `/classes/[ulid]/edit` (per 006 spec FR-005). The
  `details` extension is additive (per 006 spec Assumption
  "The `details` extension on the error envelope is additive
  — existing clients that only read the `error` field are
  unaffected") and forward-compatible (future endpoints MAY
  use the `details` block).

---

## 6.4. Test strategy: Vitest three tiers

**Decision**: The 006 feature follows the same three-tier Vitest
test strategy as `004-user-auth` and `005-security-hardening`:

| Tier | Path | Coverage |
|---|---|---|
| **Unit** | `tests/unit/teachers/mutations.spec.ts`, `tests/unit/classes/mutations.spec.ts` + additions to `lib/validation/teacher.spec.ts` and `lib/validation/class.spec.ts` | PUT + DELETE Joi schemas (happy + each rejection path, including the leading-digit contact-number rejection and the same-form-teacher-on-same-class allowance); repository methods (`findByUlid`, `findClassByFormTeacherId`); the form-teacher guard query. Pure functions, no DB, no network, no auth. |
| **Contract** | `tests/contract/teachers-mutations.api.spec.ts`, `tests/contract/classes-mutations.api.spec.ts` | Full GET / PUT / DELETE lifecycle against a test Next.js server with `ioredis-mock` + an in-memory MySQL stub. Verifies the 200 / 400 / 401 / 403 / 404 / 409 / 415 status matrix per `003-backend-api-db/spec.md` FR-013 (the Stage 3 amendment). |
| **Integration** | `tests/integration/teachers-mutations.api.spec.ts`, `tests/integration/classes-mutations.api.spec.ts` | Real MySQL + real Redis containers; SC-001..SC-008 end-to-end. The DELETE-Teacher 409 path is tested with a real `classes` row pointing at the teacher under test; the form-teacher collision on PUT-Class is tested with two pre-seeded classes sharing the same form teacher. |

**Rationale**:
- The three tiers are the project's established test convention
  (per `004-user-auth/plan.md` Test Strategy section and
  `005-security-hardening/plan.md` Test Strategy section). The
  same runner, the same coverage model, the same `*.spec.ts`
  naming convention.
- The unit tier is runnable without a network call or a live
  MySQL / Redis connection (per Constitution Principle III);
  the contract tier uses `ioredis-mock` and an in-memory MySQL
  stub so it is also runnable without live containers; the
  integration tier requires the real containers.
- The Stage 1 / Stage 2 test files for Teachers / Classes are
  NOT replaced; the new unit tests are added to the existing
  `lib/validation/*.spec.ts` files (per 006 spec Assumption
  "Stage 3 unit tests reuse the existing per-feature test
  fixtures from Stage 1 / Stage 2; the new test cases are
  added to the existing `*.test.ts` files rather than a new
  test file"). The contract and integration tiers add new
  files because the new endpoints are a new surface.

**Alternatives considered**:
- **Single-tier integration tests** — would couple domain logic
  tests to live MySQL / Redis containers, slowing the inner
  dev loop. Rejected (Constitution Principle III says tests
  MUST be runnable without a live MySQL / Redis connection).
- **Jest** — would require transformer config to play nicely
  with Next 15's ESM + App Router. Rejected (per
  `001-teachers/research.md §1.1`).

---

## 6.5. Reusable Row Actions Menu

**Decision**: The per-row `...` button + Dropdown component is
implemented as a single shared client component
(`app/(authed)/teachers/_components/RowActionsMenu.tsx` — note
the path; the component lives under the Teachers folder by
historical convention because 001-teachers shipped the first
list, but it is reused by both lists via cross-folder import)
and is reused by both the Teachers list and the Classes list.
The component takes a `ulid`, `name`, `resource` ('teacher' |
'class'), and an `onDeleted` callback as typed props; the
per-row edit / delete wiring is the caller's responsibility.

**Rationale**:
- The per-row `...` menu has **identical behavior** on both
  lists (open a Dropdown with Edit + Delete items; Edit
  navigates to `/[resource]/[ulid]/edit`; Delete opens
  `Modal.confirm` and issues `DELETE /api/v1.0/[resource]/[ulid]`).
  Two copies of the same component would be a YAGNI violation
  (Constitution Principle V) and a maintenance hazard (any
  change to the menu would have to be made in two places).
- The component lives under the Teachers folder by path
  convention but is logically a shared primitive; the
  `lib/components/` tree would be a more accurate home, but
  the project has historically colocated components with
  their feature folder (per `001-teachers/_components/`,
  `002-classes/_components/`). A cross-folder import is the
  smallest change that satisfies both "feature-folder
  convention" and "single source of truth" — the alternative
  is to move the component to `lib/components/`, which is a
  larger refactor outside Stage 3 scope.
- The component uses the `antd` `Dropdown` primitive (per
  Constitution v2.3.0 UI library requirement) and Tailwind
  utility classes (per Constitution v2.3.0 styling
  requirement); the destructive `Delete` button uses the
  project's existing Tailwind destructive-action token (per
  006 spec FR-004). No new design tokens, no new UI
  primitives.

**Alternatives considered**:
- **Two separate components** (one per list) — would violate
  DRY without justification. Rejected.
- **A `lib/components/RowActionsMenu.tsx` extraction** — would
  be the architecturally purest home, but the project has not
  adopted a `lib/components/` convention. A future-stage
  amendment can extract the component as part of a broader
  shared-primitives refactor (Principle V — YAGNI for now).
  Deferred.

---

## 6.6. Concurrent-edit toast (PUT `previousModifiedAt`)

**Decision**: The PUT 200 response body includes the row's
**pre-update** `modified_at` value as a sibling field named
`previousModifiedAt` (per 006 spec FR-007). The client-side
`use-edit-submit` hook captures the row's `modifiedAt` value
when the form mounts (from the GET-by-`ulid` response) and
compares it to the `previousModifiedAt` value in the PUT 200
response. If the two differ, the form was modified by another
writer between form-load and form-submit, and the UI shows a
non-blocking antd warning notification reading
`"Note: this record was edited by another administrator at HH:MM:SS — your changes are saved, but please verify."`
(per 006 spec FR-016). The toast auto-dismisses after 8
seconds or when the admin closes it manually (whichever comes
first).

**Rationale**:
- The constitution v2.5.0 strict-PUT last-write-wins semantics
  (no 409 on `version` mismatch; per Principle X.3 and the
  006 spec Clarifications Session 2026-06-22 Q4 in the
  `/speckit-specify` pass) mean the second writer's update
  succeeds without a conflict signal. The
  `previousModifiedAt` field is the **opt-in concurrent-edit
  signal** an admin needs to spot a clobber without breaking
  the last-write-wins contract.
- Capturing `modifiedAt` on form-mount (rather than on
  form-submit) means the comparison is "did anyone write to
  this row in the window between me loading the form and me
  submitting it" — the right window for the toast. The
  `previousModifiedAt` value is the `modified_at`
  immediately before the just-completed PUT write; if it
  matches the form-load value, no other writer raced.
- The toast is **informational only** — the update has already
  been saved; the admin can dismiss it or act on it (e.g.,
  re-open the record and verify nothing critical was lost).
  The notification does NOT block navigation, MUST NOT
  trigger a re-fetch, and MUST auto-dismiss after 8 seconds
  (per 006 spec FR-016). This preserves the strict-PUT
  semantics while providing the opt-in signal.

**Alternatives considered**:
- **Reject the second update with 409 on `version` mismatch
  (Option C in the Q3 question)** — would have been the
  strictest concurrent-edit signal, but would have broken
  the last-write-wins contract and required the admin to
  merge manually. Rejected per the constitution v2.5.0
  strict-PUT semantics and the 006 spec Clarifications Q3
  answer.
- **Silently accept the update (Option A in the Q3 question)** —
  would have been the simplest behavior, but would have
  hidden the clobber from the admin. Rejected per the 006
  spec Clarifications Q3 answer.

---

## 6.7. Singapore contact-number rule restoration

**Decision**: The Teacher `contactNumber` field's Joi schema
regex is restored from `^\d{8}$` (the relaxed pattern in
`001-teachers/spec.md` Clarifications Session 2026-06-21) to
`^[89]\d{7}$` (the Singapore-context pattern: exactly 8 digits,
must start with `8` or `9`) per 006 spec Clarifications Session
2026-06-22 (contact-number rule restoration) and FR-013. The
rule is shared between 001 (POST, Add Teacher) and 006 (PUT,
Edit Teacher) via a new shared module
`lib/validation/contact-number.ts` that exports the regex and
the Joi extension. The corresponding unit tests are updated to
cover the leading-digit rejection path (values starting with
`0`–`7` and `10`–`99` are rejected with `400 Bad Request` and
a field-level `contactNumber` error reading
`"Contact number must start with 8 or 9 and be 8 digits."`).

**Rationale**:
- The Singapore mobile-phone leading-digit assumption
  (`8` or `9` as the first of 8 digits) is the project
  convention per the original `001-teachers/spec.md` FR-004
  and the `001-teachers` contact-number rule documented in
  CLAUDE.md. The 2026-06-21 relaxation to `^\d{8}$` was a
  per-spec amendment; the Stage 3 amendment restores the
  original convention.
- A shared module (`lib/validation/contact-number.ts`) means
  the regex and the Joi extension have a single source of
  truth; the 001 POST path and the 006 PUT path both consume
  the same helper. The unit tests for both paths cover the
  leading-digit rejection cases.

**Alternatives considered**:
- **Duplicate the regex inline in both paths** — would risk
  drift between the 001 and 006 paths (the very failure mode
  the project is meant to demonstrate how to avoid). Rejected.
- **Move the rule to a different layer (e.g., a typeORM column
  constraint)** — typeORM does not natively support regex
  constraints on VARCHAR columns; the constraint is
  application-layer only. The Joi schema is the single source
  of truth (per Constitution Principle VII).

---

## 6.8. Form-teacher referential integrity check (DELETE-Teacher)

**Decision**: The DELETE-Teacher route handler runs a single
indexed query against the `classes` table before the row
removal:

```ts
const blockingClass = await classRepository
  .createQueryBuilder("class")
  .select(["class.id", "class.ulid", "class.name"])
  .where("class.form_teacher_id = :teacherId", { teacherId: teacher.id })
  .getOne();
```

The `UNIQUE INDEX uq_classes_form_teacher_id` on
`classes.form_teacher_id` is the index; the query is `O(log n)`
against the index; the constraint guarantees at most one row
is returned. The returned row's `ulid` and `name` are used as
`details.classUlid` and the embedded class name in the `error`
string per FR-009.

**Rationale**:
- The check is **explicit in the route handler** (not relying
  on the typeORM unique-constraint error) so the 409 envelope
  is human-readable
  (`"Teacher is assigned as form teacher of class \"<className>\". Reassign or delete that class first."`)
  rather than a raw typeORM unique-constraint error string.
- The `UNIQUE` constraint on `classes.form_teacher_id` is the
  **data-layer backstop** — direct writes that bypass the API
  cannot leave a class with a dangling `form_teacher_id`
  (the FK + UNIQUE together enforce the invariant at the
  schema level too).
- The query selects `id`, `ulid`, `name` only — no
  full-table scan, no `LEFT JOIN`, no other columns. The
  `id` column is not used externally (the API response only
  carries the `ulid`); selecting it is a no-op cost on the
  typeORM `SELECT *` default but explicit for clarity.

**Alternatives considered**:
- **Rely on the typeORM unique-constraint error** — would
  surface a raw database error string to the client. Rejected
  (Constitution Principle VII: "Validation errors MUST NOT
  leak internal messages, stack traces, or database column
  names" — the same principle applies to the form-teacher
  guard).
- **LEFT JOIN to classes in the DELETE-Teacher query** —
  would have been wasteful (`O(n)` scan of the classes
  table) and would have surfaced multiple rows even though
  the schema forbids it. Rejected (the `UNIQUE` index is the
  right tool; the query is `O(log n)`).

---

## 6.9. Edit page RSC → GET pivot

**Decision**: The Edit Teacher and Edit Class pages
(`app/(authed)/teachers/[ulid]/edit/page.tsx` and
`app/(authed)/classes/[ulid]/edit/page.tsx`) are **React
Server Components** (the default in Next.js 15 App Router)
that call the new single-resource GET endpoints from the RSC
shell, not from the client component. The `page.tsx` function:

1. Receives `{ params: { ulid: string } }` as a prop.
2. Calls `GET /api/v1.0/teachers/[ulid]` (or `classes`) via
   the project's `lib/api/http.ts → authenticatedFetch()`
   helper (inherited from `004-user-auth`).
3. On `200`, passes the resolved record to the existing
   `TeacherForm` (or `ClassForm`) component in edit mode,
   pre-populated with the row's current values.
4. On `404`, calls Next.js `redirect("/teachers")` (or
   `redirect("/classes")`) with a flash message rendered as
   an antd warning notification on the list page (per
  `useSearchParams` + the existing flash-message pattern
  from `004-user-auth`).

**Rationale**:
- The RSC pattern means the Edit page renders with a populated
  form on first paint — no client-side blank / loading state
  during the data population step (per 006 spec FR-002 /
  FR-003 "The page MUST render with a populated form on first
  paint (no client-side blank state during data population)").
- The RSC shell calls the same `/api/v1.0/*` contract that
  the client-side fetch path uses; the route handler is the
  single source of truth for the wire shape, the
  authentication boundary, the CSRF exemption, the
  content-type handling, and the error envelope. No
  carve-out in the authentication boundary for RSC direct DB
  access.
- The `404` redirect with a flash message is the same
  pattern used by the `001-teachers` / `002-classes` Add
  form when a `subjects` / `levels` reference is missing
  (a redirect-with-flash is a built-in Next.js 15 App
  Router feature, not a custom mechanism).

**Alternatives considered**:
- **Client-side fetch on mount** — would have meant a
  client-side blank / loading state during the data
  population step. Rejected (per 006 spec FR-002 / FR-003).
- **RSC + typeORM direct DB access** — would have introduced
  a server-side data layer that bypasses the cross-cutting
  `/api/v1.0/*` contract and the authentication middleware.
  The constitution v2.6.0 amendment superseded this option
  in favor of the dedicated GET endpoints. Rejected.

---

## 6.10. PUT Joi schema shape (full-resource replacement)

**Decision**: The Joi schemas for PUT mirror the POST shape
exactly — full-resource replacement, every mutable field
required, no `PATCH` semantics, no partial updates. The
schemas are generated by the same `buildCreateXxxSchema()`
factory pattern used for POST, with the same constraints
mirror-for-mirror:

```ts
// lib/validation/teacher.ts (excerpt)
export async function buildPutTeacherSchema() {
  const activeSubjectUlids = await getActiveSubjectUlids();
  return Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    subject: Joi.object({
      ulid: Joi.string().length(26).valid(...activeSubjectUlids).required(),
      name: Joi.string().max(64).optional(),
    }).required(),
    email: Joi.string().email({ tlds: false }).trim().lowercase().max(254).required(),
    contactNumber: Joi.string().pattern(SINGAPORE_CONTACT_NUMBER_REGEX).required()
      .messages({
        "string.pattern.base": "Contact number must start with 8 or 9 and be 8 digits.",
      }),
  }).options({ stripUnknown: true }); // 006 FR: additional top-level fields are ignored
}
```

The DELETE Joi schemas are empty-body schemas that still run
the validation step (per Constitution Principle VII "Joi MUST
validate every payload that crosses a trust boundary"; the
empty body is the boundary):

```ts
// lib/validation/teacher.ts (excerpt)
export const deleteTeacherSchema = Joi.object({}).min(0).max(0);
```

**Rationale**:
- Full-resource `PUT` is the Stage 3 decision per
  Constitution Stage 3 In Scope block ("Stage 3 ships
  full-resource `PUT` only — no `PATCH`; see Stage 3 Out of
  Scope"). PATCH is explicitly out of scope.
- Mirroring the POST shape means the route handler can
  reuse the same `Subject` / `Level` / `Teacher` validation
  pipeline (the `activeSubjectUlids` lookup, the
  `findTeacherByUlid` lookup, etc.) with no new validation
  logic.
- The DELETE empty-body schema is a "do nothing" schema that
  still runs the validation step (per Principle VII). The
  route handler's `request.json()` call returns `undefined`
  on an empty body; the schema's `.min(0).max(0)` allows
  the empty body and rejects any non-empty body with a
  schema-level error.

**Alternatives considered**:
- **PATCH semantics** — would have allowed partial updates
  (e.g., updating only the email). Rejected per Stage 3 Out
  of Scope.
- **Different schemas for POST and PUT** — would have risked
  drift between the two paths (the very failure mode the
  project is meant to demonstrate how to avoid). Rejected
  (the POST and PUT bodies are the same shape; the schemas
  are the same shape).

---

## 6.11. Conclusion: no new research required

All 006 Technical Context decisions are resolved by the spec
clarifications, the constitution v2.5.0 / v2.6.0 amendments,
or the inherited decisions from 001 / 002 / 004 / 005. No
"NEEDS CLARIFICATION" remains. The plan, data model, contracts,
and quickstart can be produced directly from this research
document and the spec.
