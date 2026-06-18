# Data Model: Backend APIs and DB Schema (003-backend-api-db)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)

This document captures the **system-wide persistence model** for
Stage 1. It consolidates the per-feature models from
[`001-teachers`](../001-teachers/data-model.md) and
[`002-classes`](../002-classes/data-model.md), pins the cross-feature
constraints (foreign keys, unique indexes, the surrogate-id policy),
documents the seed-list pattern, and lists the full migration set in
the order it runs on `docker compose up`.

The per-entity column tables here are **summaries**; the per-feature
data-models own the typeORM entity code, the Joi schema factories, and
the validation-surface details. Where this document disagrees with a
per-feature data-model, this document wins (it is the cross-cutting
source of truth per the [plan](./plan.md)).

---

## 1. Entities at a glance

| Entity | Table | Per-feature owner | Stage 1 API | Notes |
|---|---|---|---|---|
| Teacher | `teachers` | [`001-teachers`](../001-teachers/data-model.md) | `POST /api/teachers`, `GET /api/teachers` | Natural PK = `email`; no surrogate id. |
| Class | `classes` | [`002-classes`](../002-classes/data-model.md) | `POST /api/classes`, `GET /api/classes` | Surrogate `id` (hidden from the Stage 1 response). |
| Subject | `subjects` | [`001-teachers`](../001-teachers/data-model.md) | `GET /api/subjects` | Reference list; seeded; read-only in Stage 1. |
| Level | `levels` | [`002-classes`](../002-classes/data-model.md) | `GET /api/levels` | Reference list; seeded; read-only in Stage 1. |

**Relationships at a glance**:

| FK | Owner table | Source column | References | Constraint name (suggested) |
|---|---|---|---|---|
| Teacher → Subject | `teachers` | `subject` | `subjects.name` | `fk_teachers_subject` |
| Class → Level | `classes` | `level` | `levels.name` | `fk_classes_level` |
| Class → Teacher | `classes` | `form_teacher_email` | `teachers.email` | `fk_classes_form_teacher` |

**Unique constraints at a glance**:

| Unique index | Table | Column(s) | Enforces |
|---|---|---|---|
| `uq_teachers_email` | `teachers` | `email` | FR-006 (teacher email unique) |
| `uq_classes_name` | `classes` | `name` | FR-009 (class name globally unique) |
| `uq_classes_form_teacher` | `classes` | `form_teacher_email` | FR-008 (at most one class per teacher) |
| `PRIMARY KEY (name)` | `subjects` | `name` | FR-009a (subject FK target) |
| `PRIMARY KEY (name)` | `levels` | `name` | FR-009a (level FK target) |

---

## 2. Cross-cutting integrity rules

These are the rules that bind the four tables into a coherent system.
Each rule is enforced at the **data layer** (FR-006, FR-007, FR-008,
FR-009, FR-009a) so that even direct writes that bypass the API cannot
violate them.

### 2.1. Teacher email uniqueness — FR-006

- **Mechanism**: `UNIQUE KEY uq_teachers_email (email)` on the
  `teachers` table.
- **Race-safety**: two concurrent `POST /api/teachers` with the same
  email — at most one succeeds; the other fails with `ER_DUP_ENTRY`
  (1062). The route handler translates this to `409 Conflict` with
  `{ "error": "Email already in use" }`.
- **Source of truth**: the index. The Joi schema does *not* need a
  pre-INSERT `SELECT` — the typeORM error is enough to render the 409.
  (A pre-INSERT check would be redundant for teachers; it is required
  for classes because the route handler has to distinguish `404
  Teacher not found` from `409 Teacher already assigned`.)

### 2.2. Form-teacher referential integrity — FR-007

- **Mechanism**: `FOREIGN KEY (form_teacher_email) REFERENCES
  teachers(email)` on the `classes` table.
- **Enforcement**: a `classes` row cannot exist without a matching
  `teachers` row.
- **`ON DELETE`**: `RESTRICT` (MySQL default). Stage 1 has no
  `DELETE /api/teachers`, so this is a future-stage decision. The
  safe default is to refuse the delete and surface an error to the
  future endpoint.
- **Application-level defence**: the `POST /api/classes` route handler
  does `findTeacherByEmail(teacherEmail)` *before* the `INSERT` so it
  can render `404 Teacher not found` cleanly. The FK is the second
  line of defence for the race window.

### 2.3. Form-teacher uniqueness — FR-008

- **Mechanism**: `UNIQUE KEY uq_classes_form_teacher
  (form_teacher_email)` on the `classes` table.
- **Race-safety**: this is what `SC-007` pins down. Ten concurrent
  `POST /api/classes` with the same `teacherEmail` — at most one
  succeeds; the other nine fail with `ER_DUP_ENTRY`. The route
  handler maps the failure to `409 Teacher already assigned`.
- **Why a separate `UNIQUE` index, not just the FK**: the FK enforces
  "the form teacher exists"; the `UNIQUE` enforces "no other class
  has the same form teacher". Both are needed for FR-008.

### 2.4. Class name global uniqueness — FR-009

- **Mechanism**: `UNIQUE KEY uq_classes_name (name)` on the `classes`
  table. Class names are globally unique, not composite-unique on
  `(level, name)` (per [`002-classes/spec.md`](../002-classes/spec.md)
  Clarifications, Session 2026-06-18, Q3).
- **Race-safety**: two concurrent `POST /api/classes` with the same
  `name` — at most one succeeds; the other fails with `ER_DUP_ENTRY`
  and renders `409 Class name already in use`.

### 2.5. Reference-list referential integrity — FR-009a

- **Mechanism**: two `FOREIGN KEY` constraints:
  - `teachers.subject REFERENCES subjects.name`
  - `classes.level REFERENCES levels.name`
- **Application-level defence**: the Joi schemas for `POST /api/teachers`
  and `POST /api/classes` are generated at boot from the active
  entries in `subjects` and `levels`, so a request that references an
  unknown or inactive reference-list entry is rejected at validation
  time with `400 Invalid subject` / `400 Invalid level`. The FK is the
  backstop for direct writes that bypass the API.
- **Seed discipline**: the reference lists are populated by separate
  `-SeedSubjects` and `-SeedLevels` migrations (per FR-017). A
  reference-list row that is referenced by a teacher or class
  cannot be deactivated (per FR-009b); deactivation is out of
  Stage 1 scope.

### 2.6. Surrogate-id strategy

- **`teachers`** — no surrogate id. `email` is the natural identifier
  (per [`001-teachers/spec.md`](../001-teachers/spec.md)). The `id`
  column is **not** in the `teachers` table at all.
- **`subjects`, `levels`** — no surrogate id. `name` is the natural
  PK. The tables are read-only and tiny (≤ 50 rows each); a surrogate
  id is unnecessary.
- **`classes`** — surrogate `id BIGINT UNSIGNED AUTO_INCREMENT` as
  the PK. The `id` column **is not** exposed in the Stage 1 API
  response (per [`002-classes/spec.md`](../002-classes/spec.md)
  Clarifications, Session 2026-06-18, Q5). The column exists so a
  future edit/delete endpoint can route by id without a migration.

### 2.7. Lifecycle / soft-delete

- **No `status`, `archived`, `isDeleted`, `createdAt`, `updatedAt`,
  or `version` columns** in any of the four tables in Stage 1.
- Stage 1 is Create + Read only (per the Constitution's Stage Scope).
- The `id` on `classes` is monotonic auto-increment; the spec does
  not commit to a starting value or step. The only guarantee is
  "uniqueness over the lifetime of the table".

---

## 3. Reference-list seed pattern (FR-017)

Both `subjects` and `levels` are populated by **separate migrations**
that follow the schema migration that creates each table. The seed
migrations use `INSERT IGNORE` so re-running them is a no-op.

### 3.1. `subjects` seed list

Owned by [`001-teachers`](../001-teachers/data-model.md); delivered by
migration `1700000000001-SeedSubjects.ts`:

| `name` | `active` |
|---|---|
| English | true |
| Mathematics | true |
| Science | true |
| Chinese | true |
| Malay | true |
| Tamil | true |
| Art | true |
| Music | true |
| Physical Education | true |

### 3.2. `levels` seed list

Owned by [`002-classes`](../002-classes/data-model.md); delivered by
migration `1700000000003-SeedLevels.ts`:

| `name` | `active` |
|---|---|
| Primary 1 | true |
| Primary 2 | true |
| Primary 3 | true |
| Primary 4 | true |
| Primary 5 | true |
| Primary 6 | true |
| Secondary 1 | true |
| Secondary 2 | true |
| Secondary 3 | true |
| Secondary 4 | true |

### 3.3. Idempotency contract

- **Schema migrations (`InitSchema`, `InitClasses`)**: use `CREATE
  TABLE IF NOT EXISTS` so re-running on a populated DB is a no-op.
- **Seed migrations (`SeedSubjects`, `SeedLevels`)**: use `INSERT
  IGNORE` so re-running on a populated DB is a no-op. `INSERT
  IGNORE` skips rows that violate the primary-key `UNIQUE` constraint
  but applies the rest.
- **`docker compose up` runs every migration in timestamp order on
  every boot.** This is the property the Constitution's Principle V
  (Simplicity) leans on — no separate `npm run seed` step, no
  boot-time seeder, no manual SQL file. The README contract is
  satisfied by a single command.

---

## 4. The full migration set

The four typeORM migrations run in this order on `docker compose up`.
The timestamp prefix in the file name is what determines the run
order; there is no application-level orchestration.

| # | Timestamp | File | Owner | Purpose |
|---|---|---|---|---|
| 1 | 1700000000000 | `InitSchema.ts` | `001-teachers` | Creates `subjects`, `teachers`. Adds `UNIQUE(teachers.email)`, `FK(teachers.subject → subjects.name)`. |
| 2 | 1700000000001 | `SeedSubjects.ts` | `001-teachers` | `INSERT IGNORE` the Stage 1 subjects seed list. |
| 3 | 1700000000002 | `InitClasses.ts` | `002-classes` | Creates `levels`, `classes`. Adds `UNIQUE(classes.name)`, `UNIQUE(classes.form_teacher_email)`, `FK(classes.level → levels.name)`, `FK(classes.form_teacher_email → teachers.email)`. |
| 4 | 1700000000003 | `SeedLevels.ts` | `002-classes` | `INSERT IGNORE` the Stage 1 levels seed list. |

**Why 003 doesn't add its own migration**: 003 has no schema change of
its own. The cross-cutting constraints (FKs, unique indexes) live in
the 001 and 002 schema migrations because that is where the
referencing tables are created. The cross-cutting **rule** (e.g.,
"form-teacher email is unique") is documented in this data-model and
in [research.md §3.5](./research.md#35-cross-feature-referential-integrity-fr-007-fr-009a-fr-009b);
the cross-cutting **mechanism** lives in the per-feature migration
that creates the referencing column.

**The 003 plan does, however, own the *order* and the *idempotency
contract*** — the verification that running the set on a clean MySQL
container produces the expected schema, and that re-running it on a
populated container is a no-op. That verification lives in the
integration test suite (`tests/integration/migration.spec.ts`).

---

## 5. Per-table column summary

Full per-column tables, typeORM entity code, and Joi schema factories
are in the per-feature data-models:

- `teachers`, `subjects` — [`001-teachers/data-model.md`](../001-teachers/data-model.md)
- `classes`, `levels` — [`002-classes/data-model.md`](../002-classes/data-model.md)

The summary below is the cross-cutting index — it lists the column
type and the per-feature data-model section for each column. Use it
to confirm the four tables fit together; use the per-feature
data-models for the entity code and the Joi schema.

### 5.1. `teachers`

| Column | Type | Constraint | Owner |
|---|---|---|---|
| `name` | `VARCHAR(255)` | required | [`001-teachers`](../001-teachers/data-model.md) |
| `subject` | `VARCHAR(64)` | required, `FK → subjects.name` | [`001-teachers`](../001-teachers/data-model.md) |
| `email` | `VARCHAR(254)` | required, `UNIQUE` | [`001-teachers`](../001-teachers/data-model.md) |
| `contact_number` | `CHAR(8)` | required, regex `/^[89]\d{7}$/` | [`001-teachers`](../001-teachers/data-model.md) |

### 5.2. `classes`

| Column | Type | Constraint | Owner |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | `PRIMARY KEY` (hidden from Stage 1 API response) | [`002-classes`](../002-classes/data-model.md) |
| `level` | `VARCHAR(64)` | required, `FK → levels.name` | [`002-classes`](../002-classes/data-model.md) |
| `name` | `VARCHAR(255)` | required, `UNIQUE` (global) | [`002-classes`](../002-classes/data-model.md) |
| `form_teacher_email` | `VARCHAR(254)` | required, `UNIQUE`, `FK → teachers.email` | [`002-classes`](../002-classes/data-model.md) |

### 5.3. `subjects`

| Column | Type | Constraint | Owner |
|---|---|---|---|
| `name` | `VARCHAR(64)` | `PRIMARY KEY` (natural PK for the reference list) | [`001-teachers`](../001-teachers/data-model.md) |
| `active` | `BOOLEAN` default `true` | required | [`001-teachers`](../001-teachers/data-model.md) |

### 5.4. `levels`

| Column | Type | Constraint | Owner |
|---|---|---|---|
| `name` | `VARCHAR(64)` | `PRIMARY KEY` (natural PK for the reference list) | [`002-classes`](../002-classes/data-model.md) |
| `active` | `BOOLEAN` default `true` | required | [`002-classes`](../002-classes/data-model.md) |

---

## 6. Volume / scale assumptions

Inherited from the per-feature specs:

- ≤ 500 teachers (per [`001-teachers/spec.md`](../001-teachers/spec.md)
  Clarifications, Session 2026-06-18).
- ≤ 500 classes (per [`002-classes/spec.md`](../002-classes/spec.md)
  Clarifications, Session 2026-06-18).
- ≤ 50 entries in each reference list (`subjects`, `levels`).
- No pagination. No batch endpoints. No soft-delete. No audit log.
- The `GET /api/classes` JOIN against `teachers` is O(M log N) for
  M classes and N teachers; at the Stage 1 upper bound it is well
  under 5 ms on a dev laptop.

---

## 7. What is *not* in this data model

- No PUT / PATCH / DELETE endpoints. Stage 1 is Create + Read only
  (per the Constitution's Stage Scope).
- No `createdAt` / `updatedAt` audit columns. Stage 1 doesn't need
  them; add in a follow-up migration if audit becomes necessary.
- No soft-delete columns. Stage 1 has no delete; add in a follow-up
  migration if soft-delete is required.
- No optimistic locking (`version` column). Stage 1 is Create + Read;
  no update path to race on.
- No composite `(level, name)` uniqueness on `classes`. Uniqueness
  is **global** on `name` (per the 002 spec Clarifications, Q3).
- No `id` exposure in the Stage 1 `classes` API response. The
  surrogate id is hidden in the route handler's `toJSON` mapping.
- No admin authoring of `subjects` / `levels`. Both are read-only in
  Stage 1. Admin authoring is a future-stage amendment.

---

## 8. Migration inventory (one-pager)

The full four-step migration set, run by the app container on
`docker compose up`:

| # | Timestamp | File | Creates / Inserts |
|---|---|---|---|
| 1 | 1700000000000 | `InitSchema.ts` | `subjects (name PK, active)`, `teachers (name, subject FK, email UNIQUE, contact_number)` |
| 2 | 1700000000001 | `SeedSubjects.ts` | 9 rows into `subjects` (English, Mathematics, Science, Chinese, Malay, Tamil, Art, Music, Physical Education) |
| 3 | 1700000000002 | `InitClasses.ts` | `levels (name PK, active)`, `classes (id PK, level FK, name UNIQUE, form_teacher_email UNIQUE FK → teachers.email)` |
| 4 | 1700000000003 | `SeedLevels.ts` | 10 rows into `levels` (Primary 1–6, Secondary 1–4) |

Re-running the set on a populated MySQL container is a no-op
(`CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE`). The verification
that this property holds is the `tests/integration/migration.spec.ts`
test.
