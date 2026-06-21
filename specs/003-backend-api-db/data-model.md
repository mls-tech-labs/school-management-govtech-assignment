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
| Teacher | `teachers` | [`001-teachers`](../001-teachers/data-model.md) | `POST /api/v1.0/teachers`, `GET /api/v1.0/teachers` | Surrogate `id` PK (per FR-018); `email` preserved as `UNIQUE NOT NULL`. |
| Class | `classes` | [`002-classes`](../002-classes/data-model.md) | `POST /api/v1.0/classes`, `GET /api/v1.0/classes` | Surrogate `id` PK (hidden from the Stage 1 response). |
| Subject | `subjects` | [`001-teachers`](../001-teachers/data-model.md) | `GET /api/v1.0/subjects` | Surrogate `id` PK (per FR-018); `name` preserved as `UNIQUE NOT NULL`. |
| Level | `levels` | [`002-classes`](../002-classes/data-model.md) | `GET /api/v1.0/levels` | Surrogate `id` PK (per FR-018); `name` preserved as `UNIQUE NOT NULL`. |

**Relationships at a glance** (per FR-019 — FKs reference `id`):

| FK | Owner table | Source column | References | Constraint name (suggested) |
|---|---|---|---|---|
| Teacher → Subject | `teachers` | `subject_id` | `subjects.id` | `fk_teachers_subject` |
| Class → Level | `classes` | `level_id` | `levels.id` | `fk_classes_level` |
| Class → Teacher | `classes` | `form_teacher_id` | `teachers.id` | `fk_classes_form_teacher` |

**Unique constraints at a glance**:

| Unique index | Table | Column(s) | Enforces |
|---|---|---|---|
| `uq_teachers_email` | `teachers` | `email` | FR-006 (teacher email unique) |
| `uq_classes_name` | `classes` | `name` | FR-009 (class name globally unique) |
| `uq_classes_form_teacher` | `classes` | `form_teacher_id` | FR-008 (at most one class per teacher) |
| `uq_subjects_name` | `subjects` | `name` | FR-009a (subject FK target — natural key preserved as UNIQUE) |
| `uq_levels_name` | `levels` | `name` | FR-009a (level FK target — natural key preserved as UNIQUE) |
| `uq_teachers_ulid` | `teachers` | `ulid` | FR-021 (ULID row handle, globally unique) |
| `uq_subjects_ulid` | `subjects` | `ulid` | FR-021 (ULID row handle, globally unique) |
| `uq_classes_ulid` | `classes` | `ulid` | FR-021 (ULID row handle, globally unique) |
| `uq_levels_ulid` | `levels` | `ulid` | FR-021 (ULID row handle, globally unique) |

**Audit columns (per FR-018 — applied to every table)**:

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | — | Surrogate PK on every table. |
| `ulid` | `CHAR(26) NOT NULL` (UNIQUE — separate `uq_*_ulid` index) | — | Per FR-021 — frontend-stable row handle, exposed in every API response. See §2.8. |
| `created_at` | `DATETIME(6) NOT NULL` | `CURRENT_TIMESTAMP(6)` | Set once at insert. |
| `created_by` | `VARCHAR(64) NOT NULL` | `'system'` | Actor identifier; set by application. |
| `modified_at` | `DATETIME(6) NOT NULL` | `CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)` | Bumped on every update. |
| `modified_by` | `VARCHAR(64) NOT NULL` | `'system'` | Actor identifier for the latest update. |
| `version` | `INT NOT NULL` | `1` | typeORM `@VersionColumn` optimistic-lock counter. |

---

## 2. Cross-cutting integrity rules

These are the rules that bind the four tables into a coherent system.
Each rule is enforced at the **data layer** (FR-006, FR-007, FR-008,
FR-009, FR-009a) so that even direct writes that bypass the API cannot
violate them.

### 2.1. Teacher email uniqueness — FR-006

- **Mechanism**: `UNIQUE KEY uq_teachers_email (email)` on the
  `teachers` table.
- **Race-safety**: two concurrent `POST /api/v1.0/teachers` with the same
  email — at most one succeeds; the other fails with `ER_DUP_ENTRY`
  (1062). The route handler translates this to `409 Conflict` with
  `{ "error": "Email already in use" }`.
- **Source of truth**: the index. The Joi schema does *not* need a
  pre-INSERT `SELECT` — the typeORM error is enough to render the 409.
  (A pre-INSERT check would be redundant for teachers; it is required
  for classes because the route handler has to distinguish `404
  Teacher not found` from `409 Teacher already assigned`.)

### 2.2. Form-teacher referential integrity — FR-007

- **Mechanism**: `FOREIGN KEY (form_teacher_id) REFERENCES
  teachers(id)` on the `classes` table.
- **Enforcement**: a `classes` row cannot exist without a matching
  `teachers` row.
- **`ON DELETE`**: `RESTRICT` (MySQL default). Stage 1 has no
  `DELETE /api/v1.0/teachers`, so this is a future-stage decision. The
  safe default is to refuse the delete and surface an error to the
  future endpoint.
- **Application-level defence**: the `POST /api/v1.0/classes` route handler
  resolves `formTeacher.ulid` → `form_teacher_id` *before* the
  `INSERT` (via a `findTeacherByUlid` against `uq_teachers_ulid`,
  per Clarifications, Session 2026-06-20 (POST/GET reference object
  shape) and FR-005) so it can render
  `404 Teacher not found` cleanly. The FK is the second line of
  defence for the race window. The nested `formTeacher.name` field
  is a display hint and is ignored server-side.

### 2.3. Form-teacher uniqueness — FR-008

- **Mechanism**: `UNIQUE KEY uq_classes_form_teacher
  (form_teacher_id)` on the `classes` table.
- **Race-safety**: this is what `SC-007` pins down. Ten concurrent
  `POST /api/v1.0/classes` with the same `formTeacher.ulid` — at most
  one succeeds; the other nine fail with `ER_DUP_ENTRY`. The route
  handler maps the failure to `409 Teacher already assigned`.
- **Why a separate `UNIQUE` index, not just the FK**: the FK enforces
  "the form teacher exists"; the `UNIQUE` enforces "no other class
  has the same form teacher". Both are needed for FR-008.

### 2.4. Class name global uniqueness — FR-009

- **Mechanism**: `UNIQUE KEY uq_classes_name (name)` on the `classes`
  table. Class names are globally unique, not composite-unique on
  `(level, name)` (per [`002-classes/spec.md`](../002-classes/spec.md)
  Clarifications, Session 2026-06-18, Q3).
- **Race-safety**: two concurrent `POST /api/v1.0/classes` with the same
  `name` — at most one succeeds; the other fails with `ER_DUP_ENTRY`
  and renders `409 Class name already in use`.

### 2.5. Reference-list referential integrity — FR-009a

- **Mechanism**: two `FOREIGN KEY` constraints:
  - `teachers.subject_id REFERENCES subjects(id)`
  - `classes.level_id REFERENCES levels(id)`
- **Application-level defence**: the Joi schemas for `POST /api/v1.0/teachers`
  and `POST /api/v1.0/classes` are generated at boot from the active
  entries in `subjects` and `levels`, so a request that references an
  unknown or inactive `subject.ulid` / `level.ulid` is rejected at
  validation time with `400 Invalid subject` / `400 Invalid level`
  (per Clarifications, Session 2026-06-20 (POST/GET reference object
  shape) — the lookup is `ulid`-keyed, the nested `name` field is a
  display hint and is ignored). The FK is the backstop for direct
  writes that bypass the API.
- **Seed discipline**: the reference lists are populated by the user
  against the user-prepared MySQL container (per FR-016,
  Session 2026-06-21). A reference-list row that is referenced by a
  teacher or class cannot be deactivated (per FR-009b); deactivation
  is out of Stage 1 scope.

### 2.6. Surrogate-id strategy (per FR-018, FR-019)

- **Every table** (`subjects`, `teachers`, `levels`, `classes`) carries
  a surrogate `id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` as the
  primary key (per FR-018, Q1 of the Session 2026-06-19 audit-columns
  clarification). The `id` is the canonical join key.
- **Domain-natural identifiers are preserved as `UNIQUE NOT NULL`**:
  `teachers.email`, `subjects.name`, `levels.name`, `classes.name`.
  These are the values the Stage 1 public API exposes.
- **Foreign keys reference `id`**, not natural keys (per FR-019):
  `teachers.subject_id REFERENCES subjects(id)`,
  `classes.level_id REFERENCES levels(id)`,
  `classes.form_teacher_id REFERENCES teachers(id)`. FK column names
  follow the pattern `<referenced-table-singular>_id`.
- **`classes.id` is not exposed** in the Stage 1 API response (per
  [`002-classes/spec.md`](../002-classes/spec.md) Clarifications,
  Session 2026-06-18, Q5). The column exists so a future edit/delete
  endpoint can route by id without a migration. The other tables'
  `id` columns are internal-only as well — the API responses surface
  the natural key (`email`, `name`) instead.

### 2.7. Audit columns (per FR-018)

- Every table carries the six audit columns documented at the top of
  this data-model (`id`, `created_at`, `created_by`, `modified_at`,
  `modified_by`, `version`).
- **Concurrency**: the `version` column is the optimistic-lock
  counter managed by typeORM's `@VersionColumn`. A stale-version
  save produces `OptimisticLockVersionMismatchError`, which the API
  layer maps to HTTP `409 Conflict` (consistent with FR-013's other
  409 mappings).
- **Lifecycle / soft-delete**: still no `status`, `archived`, or
  `isDeleted` columns in Stage 1. Audit timestamps (`created_at` /
  `modified_at`) replace the `createdAt` / `updatedAt` placeholder
  pattern — they are the project's authoritative row-mutation
  timestamps.

### 2.8. ULID column (per FR-021)

- Every table (`subjects`, `teachers`, `levels`, `classes`) carries
  a `ulid CHAR(26) NOT NULL` column, generated server-side by the
  [`ulid`](https://www.npmjs.com/package/ulid) npm package on every
  insert (per FR-021 — Session 2026-06-20 ULID clarification). The
  column is the **frontend-stable row handle**: it is exposed in
  every Stage 1 GET and POST response so the frontend can cache it
  against the row and route future edit/update operations by
  `ulid` without depending on the surrogate `id`.
- The `ulid` column is the **explicit exception to FR-020** ("audit
  columns are hidden from API responses"). Audit columns remain
  hidden; `ulid` is exposed.
- **`UNIQUE` index per table**: `uq_teachers_ulid`,
  `uq_subjects_ulid`, `uq_classes_ulid`, `uq_levels_ulid` — added
  in the same migration that creates each table. A duplicate `ulid`
  surfaces as `ER_DUP_ENTRY` and the route handler maps it to
  `409` (consistent with the other 409 cases in FR-013).
- **`ulid` is NOT a foreign-key target**. FKs continue to reference
  the surrogate `id` (per FR-019). The typeORM entity declares
  `@Column({ type: "char", length: 26, unique: true }) ulid!: string`
  — no `@ManyToOne` against `ulid`.
- **Wire shape**: `ulid` is the **first property** in every entity's
  response shape, ahead of the natural-key fields, so it is the
  property a frontend cache key is built around. Reference fields
  are nested `{ ulid, name }` objects on both POST and GET (per
  Clarifications, Session 2026-06-20 (POST/GET reference object
  shape)).
  Example `POST /api/v1.0/teachers` 201 body:
  ```json
  {
    "ulid": "01HZX8K2D5Y3J8QF8W9B3N5P7T",
    "name": "Alice Tan",
    "subject": {
      "ulid": "01H000000000000000000000A1",
      "name": "Mathematics"
    },
    "email": "alice@example.com",
    "contactNumber": "91234567"
  }
  ```
  Example `POST /api/v1.0/classes` 201 body:
  ```json
  {
    "ulid": "01HZX8K2D5Y3J8QF8W9B3N5PA0",
    "level": {
      "ulid": "01H000000000000000000000B1",
      "name": "Primary 1"
    },
    "name": "Class 1A",
    "formTeacher": {
      "ulid": "01HZX8K2D5Y3J8QF8W9B3N5P7R",
      "name": "Alice Tan"
    }
  }
  ```
- **Generation site**: a thin `lib/ulid.ts` wrapper exports
  `generateUlid()`; the entity `@BeforeInsert()` hook (or the
  repository helper) calls it once and assigns the value to the
  `ulid` property. The cross-cutting wrapper lives in 003; the
  per-entity hook lives in 001 / 002.

---

## 3. Reference-list seed pattern (FR-016, Session 2026-06-21)

Both `subjects` and `levels` are populated by the **user's own SQL**
against the user-prepared MySQL container. There is no typeORM
migration runner, no `npm run seed` step, no boot-time seeder, and
no `lib/db/migrations/` directory in Stage 1 (per FR-016). The
application is read/write at runtime only.

### 3.1. `subjects` seed list

Owned by [`001-teachers`](../001-teachers/data-model.md); inserted by
the user against the user-prepared MySQL container (Stage 1 default):

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

Owned by [`002-classes`](../002-classes/data-model.md); inserted by the
user against the user-prepared MySQL container (Stage 1 default):

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

### 3.3. Schema-preparation contract

- The MySQL container is prepared by the user with the full Stage 1
  schema: `subjects` (9 rows), `teachers`, `levels` (10 rows),
  `classes` tables; the `id` surrogate PK, the six audit columns,
  the `ulid CHAR(26) UNIQUE` column (per FR-021), the FK constraints
  (`fk_teachers_subject`, `fk_classes_level`,
  `fk_classes_form_teacher`), the `UNIQUE` indexes
  (`uq_teachers_email`, `uq_teachers_ulid`, `uq_subjects_name`,
  `uq_subjects_ulid`, `uq_levels_name`, `uq_levels_ulid`,
  `uq_classes_name`, `uq_classes_form_teacher`, `uq_classes_ulid`).
- The `docker compose up` boot sequence MUST NOT run a
  `typeorm-ts-node-commonjs migration:run` step or any equivalent
  schema-creation / seed / bootstrap step. The application is
  read/write at runtime only.
- This is the property the Constitution's Principle V (Simplicity)
  leans on — no separate `npm run seed` step, no boot-time seeder,
  no manual SQL file run by the application. The schema and seed
  data are entirely under user control outside the app boot.

---

## 4. Migration history (legacy — superseded by FR-016, Session 2026-06-21)

> **The four typeORM migrations previously documented in this section
> (`InitSchema`, `SeedSubjects`, `InitClasses`, `SeedLevels`) are
> removed from the project source in Stage 1** (per FR-016 and the
> Session 2026-06-21 operational-rules clarification). The MySQL
> schema, audit columns, ULID column, FK constraints, UNIQUE
> indexes, and the `subjects` / `levels` reference-list seed data
> are all created by the user against the user-prepared MySQL
> container. This §4 is preserved for the migration history only.

The previous four-migration set ran in timestamp order on
`docker compose up`. The timestamp prefix in the file name was
what determined the run order; there was no application-level
orchestration. Each schema migration created its tables with the
full audit pattern (`id` PK, `ulid CHAR(26) UNIQUE` per FR-021,
`created_at`, `created_by`, `modified_at`, `modified_by`,
`version`); FK columns followed the
`<referenced-table-singular>_id` pattern and referenced `id` (per
FR-019, FR-018).

| # | Timestamp | File | Owner | Purpose |
|---|---|---|---|---|
| 1 | 1700000000000 | `InitSchema.ts` | `001-teachers` | Creates `subjects (id PK, ulid UNIQUE, name UNIQUE NOT NULL, active, +audit)` and `teachers (id PK, ulid UNIQUE, name, subject_id FK → subjects.id, email UNIQUE NOT NULL, contact_number, +audit)`. |
| 2 | 1700000000001 | `SeedSubjects.ts` | `001-teachers` | `INSERT IGNORE` the Stage 1 subjects seed list (with explicit id and ulid values). |
| 3 | 1700000000002 | `InitClasses.ts` | `002-classes` | Creates `levels (id PK, ulid UNIQUE, name UNIQUE NOT NULL, active, +audit)` and `classes (id PK, ulid UNIQUE, level_id FK → levels.id, name UNIQUE, form_teacher_id UNIQUE FK → teachers.id, +audit)`. |
| 4 | 1700000000003 | `SeedLevels.ts` | `002-classes` | `INSERT IGNORE` the Stage 1 levels seed list (with explicit id and ulid values). |

**Why 003 didn't add its own migration**: 003 had no schema change
of its own. The cross-cutting constraints (FKs, unique indexes,
audit columns) lived in the 001 and 002 schema migrations because
that was where the referencing tables were created. The
cross-cutting **rule** (e.g., "form-teacher uniqueness", "audit
columns on every table") is documented in this data-model and in
[research.md §3.5](./research.md#35-cross-feature-referential-integrity-fr-007-fr-009a-fr-009b);
the cross-cutting **mechanism** lived in the per-feature migration
that created the referencing column.

> **Note**: This section supersedes the older "natural-key FK" wording
> (e.g., `FK(teachers.subject → subjects.name)`) — that wording
> predates the Session 2026-06-19 audit-columns clarification and is
> preserved here only for the migration history.

**The 003 plan previously owned the *order* and the *idempotency
contract*** — the verification that running the set on a clean MySQL
container produced the expected schema, and that re-running it on
a populated container was a no-op. That verification lived in the
integration test suite (`tests/integration/migration.spec.ts`),
which is removed in Stage 1.

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
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | `PRIMARY KEY` (per FR-018) | [`001-teachers`](../001-teachers/data-model.md) |
| `ulid` | `CHAR(26)` | required, `UNIQUE` (`uq_teachers_ulid`, per FR-021) | [`001-teachers`](../001-teachers/data-model.md) |
| `name` | `VARCHAR(255)` | required | [`001-teachers`](../001-teachers/data-model.md) |
| `subject_id` | `BIGINT UNSIGNED` | required, `FK → subjects.id` | [`001-teachers`](../001-teachers/data-model.md) |
| `email` | `VARCHAR(254)` | required, `UNIQUE NOT NULL` (preserved natural key) | [`001-teachers`](../001-teachers/data-model.md) |
| `contact_number` | `CHAR(8)` | required, regex `/^\d{8}$/` (no leading-digit restriction — per FR-004, Session 2026-06-21) | [`001-teachers`](../001-teachers/data-model.md) |
| `created_at` | `DATETIME(6)` | `DEFAULT CURRENT_TIMESTAMP(6)` (per FR-018) | [`001-teachers`](../001-teachers/data-model.md) |
| `created_by` | `VARCHAR(64)` | `DEFAULT 'system'` (per FR-018) | [`001-teachers`](../001-teachers/data-model.md) |
| `modified_at` | `DATETIME(6)` | `DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)` | [`001-teachers`](../001-teachers/data-model.md) |
| `modified_by` | `VARCHAR(64)` | `DEFAULT 'system'` (per FR-018) | [`001-teachers`](../001-teachers/data-model.md) |
| `version` | `INT` | `DEFAULT 1` (typeORM `@VersionColumn`) | [`001-teachers`](../001-teachers/data-model.md) |

### 5.2. `classes`

| Column | Type | Constraint | Owner |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | `PRIMARY KEY` (hidden from Stage 1 API response) | [`002-classes`](../002-classes/data-model.md) |
| `ulid` | `CHAR(26)` | required, `UNIQUE` (`uq_classes_ulid`, per FR-021) | [`002-classes`](../002-classes/data-model.md) |
| `level_id` | `BIGINT UNSIGNED` | required, `FK → levels.id` (per FR-019) | [`002-classes`](../002-classes/data-model.md) |
| `name` | `VARCHAR(255)` | required, `UNIQUE` (global) | [`002-classes`](../002-classes/data-model.md) |
| `form_teacher_id` | `BIGINT UNSIGNED` | required, `UNIQUE`, `FK → teachers.id` (per FR-019) | [`002-classes`](../002-classes/data-model.md) |
| `created_at` | `DATETIME(6)` | `DEFAULT CURRENT_TIMESTAMP(6)` (per FR-018) | [`002-classes`](../002-classes/data-model.md) |
| `created_by` | `VARCHAR(64)` | `DEFAULT 'system'` (per FR-018) | [`002-classes`](../002-classes/data-model.md) |
| `modified_at` | `DATETIME(6)` | `DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)` | [`002-classes`](../002-classes/data-model.md) |
| `modified_by` | `VARCHAR(64)` | `DEFAULT 'system'` (per FR-018) | [`002-classes`](../002-classes/data-model.md) |
| `version` | `INT` | `DEFAULT 1` (typeORM `@VersionColumn`) | [`002-classes`](../002-classes/data-model.md) |

### 5.3. `subjects`

| Column | Type | Constraint | Owner |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | `PRIMARY KEY` (per FR-018) | [`001-teachers`](../001-teachers/data-model.md) |
| `ulid` | `CHAR(26)` | required, `UNIQUE` (`uq_subjects_ulid`, per FR-021) | [`001-teachers`](../001-teachers/data-model.md) |
| `name` | `VARCHAR(64)` | required, `UNIQUE NOT NULL` (preserved natural key) | [`001-teachers`](../001-teachers/data-model.md) |
| `active` | `BOOLEAN` default `true` | required | [`001-teachers`](../001-teachers/data-model.md) |
| `created_at` | `DATETIME(6)` | `DEFAULT CURRENT_TIMESTAMP(6)` (per FR-018) | [`001-teachers`](../001-teachers/data-model.md) |
| `created_by` | `VARCHAR(64)` | `DEFAULT 'system'` (per FR-018) | [`001-teachers`](../001-teachers/data-model.md) |
| `modified_at` | `DATETIME(6)` | `DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)` | [`001-teachers`](../001-teachers/data-model.md) |
| `modified_by` | `VARCHAR(64)` | `DEFAULT 'system'` (per FR-018) | [`001-teachers`](../001-teachers/data-model.md) |
| `version` | `INT` | `DEFAULT 1` (typeORM `@VersionColumn`) | [`001-teachers`](../001-teachers/data-model.md) |

### 5.4. `levels`

| Column | Type | Constraint | Owner |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | `PRIMARY KEY` (per FR-018) | [`002-classes`](../002-classes/data-model.md) |
| `ulid` | `CHAR(26)` | required, `UNIQUE` (`uq_levels_ulid`, per FR-021) | [`002-classes`](../002-classes/data-model.md) |
| `name` | `VARCHAR(64)` | required, `UNIQUE NOT NULL` (preserved natural key) | [`002-classes`](../002-classes/data-model.md) |
| `active` | `BOOLEAN` default `true` | required | [`002-classes`](../002-classes/data-model.md) |
| `created_at` | `DATETIME(6)` | `DEFAULT CURRENT_TIMESTAMP(6)` (per FR-018) | [`002-classes`](../002-classes/data-model.md) |
| `created_by` | `VARCHAR(64)` | `DEFAULT 'system'` (per FR-018) | [`002-classes`](../002-classes/data-model.md) |
| `modified_at` | `DATETIME(6)` | `DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)` | [`002-classes`](../002-classes/data-model.md) |
| `modified_by` | `VARCHAR(64)` | `DEFAULT 'system'` (per FR-018) | [`002-classes`](../002-classes/data-model.md) |
| `version` | `INT` | `DEFAULT 1` (typeORM `@VersionColumn`) | [`002-classes`](../002-classes/data-model.md) |

---

## 6. Volume / scale assumptions

Inherited from the per-feature specs:

- ≤ 500 teachers (per [`001-teachers/spec.md`](../001-teachers/spec.md)
  Clarifications, Session 2026-06-18).
- ≤ 500 classes (per [`002-classes/spec.md`](../002-classes/spec.md)
  Clarifications, Session 2026-06-18).
- ≤ 50 entries in each reference list (`subjects`, `levels`).
- No pagination. No batch endpoints. No soft-delete. No audit log.
- The `GET /api/v1.0/classes` JOIN against `teachers` is O(M log N) for
  M classes and N teachers; at the Stage 1 upper bound it is well
  under 5 ms on a dev laptop.

---

## 7. What is *not* in this data model

- No PUT / PATCH / DELETE endpoints. Stage 1 is Create + Read only
  (per the Constitution's Stage Scope).
- No soft-delete columns. Stage 1 has no delete; add in a follow-up
  migration if soft-delete is required.
- No composite `(level, name)` uniqueness on `classes`. Uniqueness
  is **global** on `name` (per the 002 spec Clarifications, Q3).
- No `id` exposure in any Stage 1 API response. The surrogate id is
  hidden in each route handler's `toJSON` mapping; the API surface
  continues to use natural keys (`email`, `name`) plus the new
  `ulid` row handle (per FR-021).
- No admin authoring of `subjects` / `levels`. Both are read-only in
  Stage 1. Admin authoring is a future-stage amendment.
- No FK on `ulid`. The column is the frontend-stable row handle
  (per FR-021), not a join target. FKs continue to reference the
  surrogate `id` (per FR-019).

---

## 8. Migration inventory (legacy — superseded by FR-016, Session 2026-06-21)

> **Stage 1 has no migration set.** The four typeORM migrations
> previously documented in this section (`InitSchema`, `SeedSubjects`,
> `InitClasses`, `SeedLevels`) are removed from the project source
> per FR-016 and the Session 2026-06-21 operational-rules
> clarification. The MySQL schema, audit columns (per FR-018),
> `ulid` column (per FR-021), FK constraints, UNIQUE indexes, and
> the `subjects` / `levels` reference-list seed data are all
> created by the user against the user-prepared MySQL container.
> This §8 is preserved for the migration history only.

The previous four-step migration set was run by the app container on
`docker compose up`. The audit columns (per FR-018) and the `ulid`
column (per FR-021) were created in each schema migration alongside
the table itself — there was no separate "add audit columns" /
"add ulid column" migration because Stage 1's DB had not yet been
seeded with live data.

| # | Timestamp | File | Creates / Inserts |
|---|---|---|---|
| 1 | 1700000000000 | `InitSchema.ts` | `subjects (id PK, ulid UNIQUE, name UNIQUE NOT NULL, active, +audit)`, `teachers (id PK, ulid UNIQUE, name, subject_id FK → subjects.id, email UNIQUE NOT NULL, contact_number, +audit)` |
| 2 | 1700000000001 | `SeedSubjects.ts` | 9 rows into `subjects` (English, Mathematics, Science, Chinese, Malay, Tamil, Art, Music, Physical Education) with explicit id and ulid values |
| 3 | 1700000000002 | `InitClasses.ts` | `levels (id PK, ulid UNIQUE, name UNIQUE NOT NULL, active, +audit)`, `classes (id PK, ulid UNIQUE, level_id FK → levels.id, name UNIQUE, form_teacher_id UNIQUE FK → teachers.id, +audit)` |
| 4 | 1700000000003 | `SeedLevels.ts` | 10 rows into `levels` (Primary 1–6, Secondary 1–4) with explicit id and ulid values |

Re-running the set on a populated MySQL container was a no-op
(`CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE`). The verification
that this property held was the `tests/integration/migration.spec.ts`
test, which is removed in Stage 1.
