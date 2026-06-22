# Data Model: Teachers & Classes — UPDATE / DELETE Mutations (006)

**Date**: 2026-06-22
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)

This document captures the persistence-model impact and the
validation-surface impact of the Stage 3 mutation feature.
The 006 feature **introduces no new entities and no new
tables**. It operates on the existing `teachers` and `classes`
tables from
[`001-teachers`](../001-teachers/data-model.md) and
[`002-classes`](../002-classes/data-model.md). The mutation
endpoints reuse the same MySQL tables, the same typeORM
entities, the same Joi schemas (extended for PUT, not for
DELETE), and the same audit columns. The form-teacher
referential integrity invariant on DELETE-Teacher relies on
the existing `UNIQUE INDEX uq_classes_form_teacher_id`
constraint on `classes.form_teacher_id` — that constraint is
the **data-layer backstop** for the Principle X.1 rule; the
explicit SELECT in the route handler is the
**application-layer** check that produces the human-readable
`409` envelope.

This document focuses on the 006-specific impact: (a) the
Joi schema changes for PUT (full-resource replacement shape
that mirrors POST), (b) the Joi schema changes for DELETE
(empty-body schema that still runs the validation step), (c)
the restoration of the Singapore `^[89]\d{7}$` contact-number
regex on the `Teacher.contactNumber` field (shared with
001), (d) the explicit form-teacher guard query, (e) the
`previousModifiedAt` field on the PUT 200 response body
(application-layer, not persistence-layer), and (f) the new
repository methods (`findByUlid`,
`findClassByFormTeacherId`). Every other table / column /
constraint is owned by `001-teachers` or `002-classes` and is
referenced here as a dependency, not re-derived.

---

## 1. No new entities, no new tables, no new migrations

The 006 feature does **not** introduce new tables. The
persistence surface is unchanged from Stages 1 + 2. The
mutation endpoints operate on the five existing tables:
`subjects` + `teachers` (from 001) + `levels` + `classes`
(from 002) + `users` (from 004). All five carry the
cross-cutting `ulid CHAR(26) UNIQUE` column (per FR-021,
owned by `003-backend-api-db`); the `created_at` / `created_by`
/ `modified_at` / `modified_by` / `version` audit columns (per
FR-018, owned by `003-backend-api-db`); and the surrogate
`id BIGINT UNSIGNED AUTO_INCREMENT` PK (per FR-019, owned by
`003-backend-api-db`). None of those columns are touched by
the 006 feature — the audit columns are bumped on every
successful PUT (a side effect of the typeORM `@UpdateDateColumn`
and `@VersionColumn` decorators), and the `ulid` column is
read-only (server-generated on insert, never updated).

The 006 feature does **not** run any new typeORM migration.
Per `003-backend-api-db/spec.md` FR-016 and the constitution
Stage Scope → Stage 1 / Stage 2 Out of Scope section, the
MySQL schema is user-prepared; the application is read/write
at runtime only. The `lib/db/migrations/` directory remains
absent from the project source (the four Stage 1 migration
files — `1700000000000-InitSchema.ts`, `…-SeedSubjects.ts`,
`…-InitClasses.ts`, `…-SeedLevels.ts` — were removed in the
2026-06-21 amendment). No migration is added back by 006.

---

## 2. Existing table impact: `teachers` (from 001-teachers)

The `teachers` table is unchanged structurally. The 006
feature operates on the existing columns:

| Column | SQL type (per typeORM) | Required | Unique | 006 Impact | Notes |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | yes | PK | None | Surrogate PK; not exposed in the Stage 3 API response. |
| `ulid` | `CHAR(26)` | yes | yes (`UNIQUE` via `uq_teachers_ulid`) | None — used as path parameter on `GET / PUT / DELETE /api/v1.0/teachers/[ulid]` | The 26-character Crockford Base32 ULID; the frontend-stable row handle. Server-generated on insert; never updated. |
| `name` | `VARCHAR(255)` | yes | no | Re-validated on PUT | Mutable field; PUT submits the new value. |
| `subject_id` | `BIGINT UNSIGNED` | yes | FK | Re-validated on PUT against `uq_subjects_ulid` (FR-005a, 001-teachers) | Mutable field; PUT submits the new value as a nested `subject.ulid`. The route resolves it server-side. |
| `email` | `VARCHAR(254)` | yes | yes (UNIQUE NOT NULL) | Re-validated on PUT with row-exclusion self-match (FR-007, 006) | Mutable field; PUT submits the new value. The route's email-uniqueness check excludes the row being updated (i.e., `WHERE email = ? AND id != <teacher.id resolved from path ulid>`). |
| `contact_number` | `CHAR(8)` (fixed) | yes | no | **Singapore regex restored**: `^[89]\d{7}$` (FR-013, 006 spec; see §6 below) | Mutable field; PUT submits the new value. The Joi regex is the single source of truth. |
| `created_at` | `DATETIME(6)` | yes (default) | no | None — set once at insert; never updated | Per FR-018. |
| `created_by` | `VARCHAR(64)` | yes (default `'system'`) | no | None — set once at insert; never updated | Per FR-018. For the SQL-seeded rows, the value is `'admin'` (per `004-user-auth`). |
| `modified_at` | `DATETIME(6)` | yes (default) | no | Bumped on every successful PUT via `ON UPDATE CURRENT_TIMESTAMP(6)` | Per FR-018; the value **before** the just-completed PUT is captured as `previousModifiedAt` in the response body (per 006 spec FR-007 — see §5 below). |
| `modified_by` | `VARCHAR(64)` | yes (default `'system'`) | no | Updated on every successful PUT to the current actor's identifier | Per FR-018. |
| `version` | `INT` | yes (default `1`) | no | Incremented by 1 on every successful PUT via typeORM `@VersionColumn` | Per FR-018. **Note**: the `version` column is bumped on every PUT but is **not** used to enforce optimistic locking in Stage 3 — the 006 spec Clarifications Session 2026-06-22 Q3 in the `/speckit-specify` pass is explicit that UPDATE is **last-write-wins** (no 409 on `version` mismatch). The concurrent-edit signal is the application-layer `previousModifiedAt` comparison (see §5). |

**Constraints (DB-level, unchanged from 001)**:
- `UNIQUE(email)` — race-safely enforces the email-uniqueness
  invariant on POST + PUT (per FR-005, 001-teachers).
- `UNIQUE(ulid)` — race-safely enforces the cross-cutting
  ULID row-handle rule (per FR-021, owned by
  `003-backend-api-db`).
- `FOREIGN KEY (subject_id) REFERENCES subjects(id)` —
  referential integrity per FR-019 and `003-backend-api-db`
  FR-009a.

**Indexes (unchanged from 001)**:
- `PRIMARY KEY (id)` — surrogate PK per FR-018.
- `UNIQUE KEY uq_teachers_email (email)` — supports the
  `409` race-safety and the natural-key identity.
- `UNIQUE KEY uq_teachers_ulid (ulid)` — supports the
  cross-cutting ULID row-handle rule.
- `KEY idx_teachers_subject_id (subject_id)` — supports the
  FK and JOINs.

**typeORM entity (sketch, unchanged from 001)** — the
existing `Teacher` entity in `lib/db/entities/Teacher.ts`
already covers all the columns; the 006 feature does **not**
modify the entity. See
[`001-teachers/data-model.md` §"typeORM entity (sketch)"](../001-teachers/data-model.md#1-teachers-table--teacher-entity)
for the full sketch.

**Joi schema for PUT-Teacher (new, owned by 006)**:

```ts
// lib/validation/teacher.ts (additions for 006)
import { SINGAPORE_CONTACT_NUMBER_REGEX } from "./contact-number";

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
  }).options({ stripUnknown: true });
}

export const deleteTeacherSchema = Joi.object({}).min(0).max(0);
```

The PUT-Teacher schema is the **mirror** of the POST-Teacher
schema (full-resource replacement, every mutable field
required, no partial updates). The DELETE-Teacher schema is
an empty-body schema that still runs the validation step (per
Principle VII); the route handler's `request.json()` call
returns `undefined` on an empty body, and the schema's
`.min(0).max(0)` allows the empty body and rejects any
non-empty body with a schema-level error.

**Joi schema for GET-Teacher (new, owned by 006)** — there
is no body schema for GET (the path parameter is the only
input); the path parameter is validated by the
`validateUlidPathParam` helper from `001-teachers` (a
`Joi.string().length(26).pattern(/^[0-9A-HJKMNP-TV-Z]{26}$/).required()`).
The response shape is a single `Teacher` entry (same shape
as one entry in the `GET /api/v1.0/teachers` response, per
the 006 spec Clarifications Session 2026-06-22 Q2 re-answer).

---

## 3. Existing table impact: `classes` (from 002-classes)

The `classes` table is unchanged structurally. The 006
feature operates on the existing columns:

| Column | SQL type (per typeORM) | Required | Unique | 006 Impact | Notes |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | yes | PK | None | Surrogate PK; not exposed in the Stage 3 API response. |
| `ulid` | `CHAR(26)` | yes | yes (`UNIQUE` via `uq_classes_ulid`) | None — used as path parameter on `GET / PUT / DELETE /api/v1.0/classes/[ulid]` | The 26-character Crockford Base32 ULID; the frontend-stable row handle. |
| `name` | `VARCHAR(255)` | yes | yes (`UNIQUE NOT NULL`) | Re-validated on PUT with row-exclusion self-match (FR-008, 006) | Mutable field; PUT submits the new value. The route's class-name-uniqueness check excludes the row being updated. |
| `level_id` | `BIGINT UNSIGNED` | yes | FK | Re-validated on PUT against `uq_levels_ulid` (FR-005a, 002-classes) | Mutable field; PUT submits the new value as a nested `level.ulid`. |
| `form_teacher_id` | `BIGINT UNSIGNED` | yes | yes (`UNIQUE` via `uq_classes_form_teacher_id`) | Re-validated on PUT with row-exclusion self-match (FR-008, 006); also the form-teacher guard for DELETE-Teacher (FR-009, 006; see §4) | Mutable field; PUT submits the new value as a nested `formTeacher.ulid`. The `UNIQUE` index is the data-layer backstop for Principle X.1. |
| `created_at` | `DATETIME(6)` | yes (default) | no | None — set once at insert | Per FR-018. |
| `created_by` | `VARCHAR(64)` | yes (default `'system'`) | no | None — set once at insert | Per FR-018. |
| `modified_at` | `DATETIME(6)` | yes (default) | no | Bumped on every successful PUT via `ON UPDATE CURRENT_TIMESTAMP(6)` | Per FR-018; the value **before** the just-completed PUT is captured as `previousModifiedAt` in the response body. |
| `modified_by` | `VARCHAR(64)` | yes (default `'system'`) | no | Updated on every successful PUT to the current actor's identifier | Per FR-018. |
| `version` | `INT` | yes (default `1`) | no | Incremented by 1 on every successful PUT | Per FR-018. **Same note as Teacher**: the `version` column is bumped on every PUT but is **not** used to enforce optimistic locking in Stage 3 — UPDATE is last-write-wins. |

**Constraints (DB-level, unchanged from 002)**:
- `UNIQUE(name)` — race-safely enforces the
  class-name-uniqueness invariant on POST + PUT.
- `UNIQUE(form_teacher_id)` — **the data-layer backstop for
  Principle X.1** — the form-teacher referential integrity
  check on DELETE-Teacher. Direct writes that bypass the API
  cannot leave a class with a form teacher that is
  simultaneously the form teacher of a different class. The
  constraint guarantees at most one class can reference a
  given teacher as form teacher; the N (number of affected
  classes) is always 0 or 1 at the database layer.
- `UNIQUE(ulid)` — cross-cutting ULID row-handle rule.
- `FOREIGN KEY (level_id) REFERENCES levels(id)` —
  referential integrity per FR-019 and `003-backend-api-db`
  FR-009a.
- `FOREIGN KEY (form_teacher_id) REFERENCES teachers(id)` —
  referential integrity per FR-019 and `003-backend-api-db`
  FR-009a (the form-teacher must reference a registered
  teacher).

**Indexes (unchanged from 002)**:
- `PRIMARY KEY (id)` — surrogate PK.
- `UNIQUE KEY uq_classes_name (name)` — supports the
  class-name-uniqueness check.
- `UNIQUE KEY uq_classes_form_teacher_id (form_teacher_id)` —
  **supports the form-teacher guard on DELETE-Teacher**
  (`O(log n)` indexed lookup) and the form-teacher-uniqueness
  check on POST + PUT.
- `UNIQUE KEY uq_classes_ulid (ulid)` — supports the
  cross-cutting ULID row-handle rule.
- `KEY idx_classes_level_id (level_id)` — supports the FK
  and JOINs.

**typeORM entity (sketch, unchanged from 002)** — the
existing `Class` entity in `lib/db/entities/Class.ts` already
covers all the columns; the 006 feature does **not** modify
the entity. See
[`002-classes/data-model.md` §"typeORM entity (sketch)"](../002-classes/data-model.md#2-classes-table--class-entity)
for the full sketch.

**Joi schema for PUT-Class (new, owned by 006)**:

```ts
// lib/validation/class.ts (additions for 006)
export async function buildPutClassSchema() {
  const activeLevelUlids = await getActiveLevelUlids();
  return Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    level: Joi.object({
      ulid: Joi.string().length(26).valid(...activeLevelUlids).required(),
      name: Joi.string().max(64).optional(),
    }).required(),
    formTeacher: Joi.object({
      ulid: Joi.string().length(26).required(),
      name: Joi.string().max(255).optional(),
    }).required(),
  }).options({ stripUnknown: true });
}

export const deleteClassSchema = Joi.object({}).min(0).max(0);
```

The PUT-Class schema is the **mirror** of the POST-Class
schema (full-resource replacement, every mutable field
required, no partial updates). The DELETE-Class schema is
an empty-body schema that still runs the validation step
(per Principle VII).

**Joi schema for GET-Class (new, owned by 006)** — there is
no body schema for GET; the path parameter is validated by
the `validateUlidPathParam` helper from `002-classes`. The
response shape is a single `Class` entry (same shape as one
entry in the `GET /api/v1.0/classes` response, per the 006
spec Clarifications Session 2026-06-22 Q2 re-answer).

---

## 4. The form-teacher guard (DELETE-Teacher, FR-009)

The DELETE-Teacher 409 path is implemented as a single
indexed query against the `classes` table, run in the route
handler **before** the row removal. The query is owned by
006 (it is the application-layer check that produces the
human-readable 409 envelope; the `UNIQUE` constraint on
`classes.form_teacher_id` is the data-layer backstop, owned
by 002).

**Repository method (new, owned by 006)**:

```ts
// lib/api/classes/repository.ts (addition for 006)
export async function findClassByFormTeacherId(
  formTeacherId: string,
): Promise<{ id: string; ulid: string; name: string } | null> {
  const row = await dataSource
    .getRepository(Class)
    .createQueryBuilder("class")
    .select(["class.id", "class.ulid", "class.name"])
    .where("class.form_teacher_id = :formTeacherId", { formTeacherId })
    .getOne();
  return row ? { id: row.id, ulid: row.ulid, name: row.name } : null;
}
```

**Route-handler excerpt (new, owned by 006)**:

```ts
// app/api/v1.0/teachers/[ulid]/route.ts (DELETE handler excerpt)
const teacher = await findTeacherByUlid(ulid);
if (!teacher) return errorResponse(404, "Teacher not found");

const blockingClass = await findClassByFormTeacherId(teacher.id);
if (blockingClass) {
  return errorResponse(409, {
    error: `Teacher is assigned as form teacher of class "${blockingClass.name}". Reassign or delete that class first.`,
    details: {
      classUlid: blockingClass.ulid,
      className: blockingClass.name,
    },
  });
}

await dataSource.getRepository(Teacher).delete({ id: teacher.id });
return NextResponse.json({ ulid: teacher.ulid });
```

The `UNIQUE INDEX uq_classes_form_teacher_id` is the index
that makes the `WHERE form_teacher_id = ?` query an
`O(log n)` lookup; the constraint also guarantees at most
one row is returned. No `LEFT JOIN`, no full-table scan, no
ORM eager-loading of related rows.

---

## 5. The `previousModifiedAt` field on the PUT 200 response

The PUT 200 response body on both `PUT /api/v1.0/teachers/[ulid]`
and `PUT /api/v1.0/classes/[ulid]` includes a sibling field
named `previousModifiedAt` (per 006 spec FR-007 / FR-016). The
value is the row's `modified_at` **immediately before** the
just-completed PUT write — i.e., the value the row had when
the request was received by the route handler.

**Repository method (new, owned by 006)**:

```ts
// lib/api/teachers/repository.ts (addition for 006)
export async function updateTeacherAndReturnPreviousModifiedAt(
  id: string,
  changes: TeacherUpdate,
): Promise<{ teacher: Teacher; previousModifiedAt: Date }> {
  return dataSource.transaction(async (tx) => {
    const repo = tx.getRepository(Teacher);
    const row = await repo.findOneOrFail({ where: { id } });
    const previousModifiedAt = row.modifiedAt;
    Object.assign(row, changes);
    const updated = await repo.save(row);
    return { teacher: updated, previousModifiedAt };
  });
}
```

**Route-handler excerpt (new, owned by 006)**:

```ts
// app/api/v1.0/teachers/[ulid]/route.ts (PUT handler excerpt)
const body = await validatePutRequest(request, putTeacherSchema);
const teacherUlid = (await params).ulid;
const existing = await findTeacherByUlid(teacherUlid);
if (!existing) return errorResponse(404, "Teacher not found");

// ...re-run POST-side invariants: subject-active, email-unique, contactNumber regex...

const { teacher, previousModifiedAt } = await updateTeacherAndReturnPreviousModifiedAt(
  existing.id,
  { name: body.name, subjectId: subject.id, email: body.email, contactNumber: body.contactNumber },
);
return NextResponse.json({
  ...teacher.toDto(), // { ulid, name, subject, email, contactNumber }
  previousModifiedAt: previousModifiedAt.toISOString(),
});
```

The `previousModifiedAt` field is an **application-layer**
extension to the standard `Teacher` / `Class` response shape;
it is not a persistence-layer column. The `modified_at` column
in the database is read inside the transaction **before** the
write, captured as `previousModifiedAt`, and returned to the
client alongside the just-completed write's new row. The
client-side `use-edit-submit` hook captures the form-load
`modifiedAt` value (from the GET-by-`ulid` response) and
compares it to the `previousModifiedAt` value in the PUT 200
response — if they differ, the concurrent-edit toast fires
(per 006 spec FR-016).

---

## 6. Singapore `^[89]\d{7}$` contact-number regex (shared with 001)

The Singapore contact-number rule is **restored** to
`^[89]\d{7}$` (exactly 8 digits, must start with `8` or `9`)
per 006 spec Clarifications Session 2026-06-22 (contact-number
rule restoration) and FR-013. The rule is shared between 001
(POST, Add Teacher) and 006 (PUT, Edit Teacher) via a new
shared module `lib/validation/contact-number.ts`.

**Shared module (new, owned by 006 + 001)**:

```ts
// lib/validation/contact-number.ts (new, shared by 001 + 006)
import Joi from "joi";

export const SINGAPORE_CONTACT_NUMBER_REGEX = /^[89]\d{7}$/;

export const SINGAPORE_CONTACT_NUMBER_MESSAGE =
  "Contact number must start with 8 or 9 and be 8 digits.";

export const singaporeContactNumberSchema = Joi.string()
  .pattern(SINGAPORE_CONTACT_NUMBER_REGEX)
  .required()
  .messages({
    "string.pattern.base": SINGAPORE_CONTACT_NUMBER_MESSAGE,
  });
```

**Migration from `001-teachers`**: the existing
`lib/validation/teacher.ts` from 001 is updated to import the
shared module and use `singaporeContactNumberSchema` in place
of the previous inline `Joi.string().pattern(/^\d{8}$/)` (the
relaxed pattern from 001-teachers Clarifications Session
2026-06-21). The unit tests in
`lib/validation/teacher.spec.ts` are updated to cover the
leading-digit rejection path (values starting with `0`–`7`
and `10`–`99` are rejected with `400 Bad Request` and a
field-level `contactNumber` error reading
`"Contact number must start with 8 or 9 and be 8 digits."`).

**Coverage in 006 unit tests**: the
`tests/unit/teachers/mutations.spec.ts` test file (new, added
by 006) re-uses the `singaporeContactNumberSchema` from the
shared module to verify the leading-digit rejection path on
the PUT-Teacher schema (the same coverage as the
POST-Teacher schema; both paths consume the same shared
module).

---

## 7. New repository methods (summary)

The 006 feature adds **three** new repository methods to the
existing `lib/api/teachers/repository.ts` and
`lib/api/classes/repository.ts` modules. No new repository
modules are introduced; no new typeORM repositories are
created.

| Method | Module | Used by | Notes |
|---|---|---|---|
| `findTeacherByUlid(ulid)` (extended — add public visibility for 006 callers) | `lib/api/teachers/repository.ts` | `GET /api/v1.0/teachers/[ulid]`, the Edit Teacher RSC page, the route handlers' pre-PUT and pre-DELETE lookups | Returns the teacher row in the same wire shape as one entry in the `GET /api/v1.0/teachers` list endpoint, or `null` if no row matches. |
| `updateTeacherAndReturnPreviousModifiedAt(id, changes)` | `lib/api/teachers/repository.ts` | `PUT /api/v1.0/teachers/[ulid]` | Wraps the row update in a transaction; captures the pre-update `modified_at` value; returns `{ teacher, previousModifiedAt }`. |
| `findClassByFormTeacherId(formTeacherId)` | `lib/api/classes/repository.ts` | `DELETE /api/v1.0/teachers/[ulid]` (the form-teacher guard) | Returns the blocking class row's `{ id, ulid, name }` or `null`. The `UNIQUE INDEX uq_classes_form_teacher_id` is the index. |
| `findClassByUlid(ulid)` (extended — add public visibility for 006 callers) | `lib/api/classes/repository.ts` | `GET /api/v1.0/classes/[ulid]`, the Edit Class RSC page, the route handlers' pre-PUT and pre-DELETE lookups | Returns the class row in the same wire shape as one entry in the `GET /api/v1.0/classes` list endpoint, or `null` if no row matches. |
| `updateClassAndReturnPreviousModifiedAt(id, changes)` | `lib/api/classes/repository.ts` | `PUT /api/v1.0/classes/[ulid]` | Wraps the row update in a transaction; captures the pre-update `modified_at` value; returns `{ class, previousModifiedAt }`. |

All five methods are pure-function modules (no class-based
code outside the existing typeORM entity classes, per
Constitution Principle VI). All five methods are unit-tested
in `tests/unit/teachers/mutations.spec.ts` and
`tests/unit/classes/mutations.spec.ts` (new files, added by
006).

---

## 8. Cross-cutting references

The following cross-cutting items are owned by
`003-backend-api-db/spec.md` and are referenced by the 006
data model but are not modified by 006:

- **ULID column (FR-021)**: `ulid CHAR(26) UNIQUE NOT NULL`
  on every persisted table. Generated server-side by the
  `ulid` npm package via `lib/ulid.ts` in a typeORM
  `@BeforeInsert()` hook. Exposed as the first property in
  every Stage 1 / Stage 2 / Stage 3 GET 200 body and every
  entry in the GET 200 list. NOT a FK target. Indexed as
  `uq_<table>_ulid`. Clients never set `ulid`; it is
  server-generated.
- **Audit columns (FR-018)**: `created_at`, `created_by`,
  `modified_at`, `modified_by`, `version` on every persisted
  table. Audit columns are hidden from the Stage 1 / Stage 2
  / Stage 3 API response (FR-020). For `users`,
  `created_by` is set to `'admin'` for SQL-seeded rows; the
  FK migration of `created_by` / `modified_by` to `users.id`
  on `teachers` / `classes` / `subjects` / `levels` is OUT
  of Stage 2 + Stage 3 scope (Principle V — YAGNI).
- **Surrogate id (FR-019)**: every persisted table has a
  surrogate `id BIGINT UNSIGNED AUTO_INCREMENT` PK; FKs
  reference `id`. The Stage 1 / Stage 2 / Stage 3 API
  responses do NOT expose `id` for `classes`, `teachers`, or
  `users` (hidden to keep the wire shape stable).
- **API version prefix (FR-022)**: all Stage 1 / Stage 2 /
  Stage 3 endpoints are exposed under the literal prefix
  `/api/v1.0/`. The 006 feature adds six new endpoints under
  this prefix (two single-resource GETs, two PUTs, two
  DELETEs).
- **Migrations out of Stage 1 / Stage 2 / Stage 3 (FR-016)**:
  the MySQL schema, audit columns, ULID column, FK
  constraints, UNIQUE indexes, and the `subjects` / `levels`
  reference-list seed data are all created by the user
  against the user-prepared MySQL container. The application
  is read/write at runtime only — `docker compose up` MUST
  NOT run a typeORM migration or any equivalent
  schema-creation step. The `lib/db/migrations/` directory
  remains absent from the project source.
- **Contact number rule (per 006 FR-013 + the contact-number
  rule restoration)**: teacher `contactNumber` MUST match
  the Singapore regex `^[89]\d{7}$` (exactly 8 digits, must
  start with `8` or `9`). The rule is enforced by Joi on
  both POST (001) and PUT (006) via the shared
  `lib/validation/contact-number.ts` module.
- **Authentication boundary (Principle IV)**: every
  `/api/v1.0/*` endpoint except `POST /api/v1.0/login` and
  `GET /api/v1.0/me` requires a valid session cookie. The
  auth middleware is the single source of truth for the
  boundary; route handlers MUST NOT do their own session
  lookup. The 006 endpoints are all protected by the
  `withAuth` middleware.
- **CSRF protection (Principle IX.3)**: every state-changing
  request (`POST`, `PUT`, `PATCH`, `DELETE` under
  `/api/v1.0/*`) MUST be protected against CSRF. The
  double-submit-cookie middleware is owned by
  `005-security-hardening/middleware.ts`. The 006 PUT and
  DELETE endpoints require the `X-CSRF-Token` header; the
  GET endpoints are CSRF-exempt (GET is exempt per Principle
  IX.3).
- **`details` extension on the error envelope (NEW, owned by
  006)**: the standard `{ "error": "..." }` envelope from
  `003-backend-api-db/spec.md` is extended with an optional
  `details` field that carries structured information about
  the failure. The only Stage 3 use case is DELETE-Teacher
  (409), where `details` carries
  `{ "classUlid": "<classUlid>", "className": "<className>" }`
  (singular). The extension is additive and
  forward-compatible; existing clients that only read the
  `error` field are unaffected.
