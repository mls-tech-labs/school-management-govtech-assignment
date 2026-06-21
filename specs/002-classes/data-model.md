# Data Model: Classes (002-classes)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)

This document captures the persistence model and the validation surface for the
Classes feature. The Classes feature is built on top of the
[001-teachers](../001-teachers/data-model.md) data model: it adds two new tables
(`classes`, `levels`) and a single cross-feature `FOREIGN KEY` from
`classes.form_teacher_id` to `teachers.id`. Everything else (the
`subjects` reference list, the `teachers` table, the active-subjects pattern)
is owned by `001-teachers` and is referenced here as a dependency, not
re-derived.

---

## 1. `levels` table — `Level` entity (reference, read-only in Stage 1)

| Column | SQL type | Required | Unique | Validation (Joi, if accepted as input) | Notes |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | yes | PK | — | Surrogate primary key (per `003-backend-api-db/spec.md` FR-018). Not exposed in the Stage 1 API response. |
| `ulid` | `CHAR(26)` | yes | yes (`UNIQUE` via `uq_levels_ulid`) | — | 26-character Crockford Base32 ULID. Generated server-side on insert by the `ulid` npm package via `lib/ulid.ts` (per FR-021 — Session 2026-06-20 ULID clarification). The frontend-stable row handle; exposed in every Stage 1 GET response (the reference list is read-only). NOT a FK target. |
| `name` | `VARCHAR(64)` | yes | yes (`UNIQUE NOT NULL`) | `Joi.string().min(1).max(64).required()` | Display name as it appears in the Add Class dropdown (e.g., "Primary 1"). The natural-key identifier; preserved as `UNIQUE NOT NULL` (previously the PK). |
| `active` | `BOOLEAN` (default `true`) | yes (default) | no | `Joi.boolean().default(true)` | Whether the level is currently selectable. Stage 1 always reads `WHERE active = true`. |
| `created_at` | `DATETIME(6)` | yes (default) | no | — | `DEFAULT CURRENT_TIMESTAMP(6)` (per FR-018). |
| `created_by` | `VARCHAR(64)` | yes (default `'system'`) | no | — | Actor identifier (per FR-018). |
| `modified_at` | `DATETIME(6)` | yes (default) | no | — | `ON UPDATE CURRENT_TIMESTAMP(6)` (per FR-018). |
| `modified_by` | `VARCHAR(64)` | yes (default `'system'`) | no | — | Actor identifier for the most recent update (per FR-018). |
| `version` | `INT` | yes (default `1`) | no | — | typeORM `@VersionColumn` (per FR-018). |

**Constraints (DB-level)**:
- `PRIMARY KEY (id)` — surrogate PK (per FR-018).
- `UNIQUE KEY uq_levels_name (name)` — natural-key preserved as UNIQUE NOT NULL.
- `UNIQUE KEY uq_levels_ulid (ulid)` — cross-cutting ULID row-handle rule (per FR-021).

**Indexes**:
- `PRIMARY KEY (id)` — canonical PK.
- `UNIQUE KEY uq_levels_name (name)` — supports the natural-key identity and the FK from `classes.level_id`.
- `UNIQUE KEY uq_levels_ulid (ulid)` — supports the cross-cutting ULID row-handle rule (per FR-021).

**typeORM entity (sketch)**:

```ts
// lib/db/entities/Level.ts
import {
  Entity, PrimaryGeneratedColumn, Column, Index, BeforeInsert,
  CreateDateColumn, UpdateDateColumn, VersionColumn,
} from "typeorm";
import { generateUlid } from "../../ulid";

@Entity({ name: "levels" })
@Index("uq_levels_ulid", ["ulid"], { unique: true })
export class Level {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id!: string;

  @Column({ type: "char", length: 26, unique: true })
  ulid!: string; // per FR-021 — frontend-stable row handle

  @Column({ type: "varchar", length: 64, unique: true })
  name!: string;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt!: Date;

  @Column({ name: "created_by", type: "varchar", length: 64, default: "system" })
  createdBy!: string;

  @UpdateDateColumn({ name: "modified_at", type: "datetime", precision: 6 })
  modifiedAt!: Date;

  @Column({ name: "modified_by", type: "varchar", length: 64, default: "system" })
  modifiedBy!: string;

  @VersionColumn({ name: "version", type: "int", default: 1 })
  version!: number;

  @BeforeInsert()
  assignUlid(): void {
    if (!this.ulid) this.ulid = generateUlid();
  }
}
```

**Stage 1 seed list** (inserted by the user against the
user-prepared MySQL container, per FR-016, Session 2026-06-21):

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

(The exact list is inserted by the user. The list can be amended
by the user in a later stage; Stage 1 ships with this default.
There is no typeORM migration or `INSERT IGNORE` step on the
application boot — per FR-016, Session 2026-06-21.)

---

## 2. `classes` table — `Class` entity

| Column | SQL type | Required | Unique | Validation (Joi) | Notes |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` (auto-increment) | yes (auto) | yes (PK) | n/a (server-generated, not in request body) | Surrogate primary key. Not exposed in the Stage 1 API response (see spec Clarifications, Session 2026-06-18, Q5); the column exists so a future edit/delete endpoint can route by id without a migration. |
| `ulid` | `CHAR(26)` | yes | yes (`UNIQUE` via `uq_classes_ulid`) | — | 26-character Crockford Base32 ULID. Generated server-side on insert by the `ulid` npm package via `lib/ulid.ts` (per FR-021 — Session 2026-06-20 ULID clarification). The frontend-stable row handle; exposed in every Stage 1 POST 201 body and every entry in the GET 200 list. NOT a FK target. |
| `level_id` | `BIGINT UNSIGNED` | yes | FK | `Joi.object({ ulid: Joi.string().length(26).required(), name: Joi.string().max(64).optional() }).required()` (mapped via `level.ulid`) | Foreign key to `levels.id` (per `003-backend-api-db/spec.md` FR-019). The Joi schema validates the nested `level.ulid` (the server-side lookup key, resolved against `uq_levels_ulid`); the nested `level.name` is a display hint and is ignored server-side (per Clarifications, Session 2026-06-20 (POST/GET reference object shape)). |
| `name` | `VARCHAR(255)` | yes | yes (`UNIQUE NOT NULL`) | `Joi.string().trim().min(1).max(255).required()` | Display name (e.g., "Class 1A"). Global uniqueness enforced by `UNIQUE KEY uq_classes_name` (see `FR-005c` and the spec Clarifications, Session 2026-06-18, Q3). The natural-key status is preserved even though `id` is the surrogate PK (per FR-018). |
| `form_teacher_id` | `BIGINT UNSIGNED` | yes | yes (`UNIQUE`) | `Joi.object({ ulid: Joi.string().length(26).required(), name: Joi.string().max(64).optional() }).required()` (mapped via `formTeacher.ulid`) | Foreign key to `teachers.id` (per FR-019). `UNIQUE` enforces the "at most one class per teacher" invariant (`FR-005`). The wire field is `formTeacher` (a nested `{ ulid, name }` object, per Clarifications, Session 2026-06-20 (POST/GET reference object shape)); the route handler resolves `formTeacher.ulid` to `form_teacher_id` via a `findTeacherByUlid` lookup against `uq_teachers_ulid` before insert. The nested `formTeacher.name` is a display hint and is ignored server-side. |
| `created_at` | `DATETIME(6)` | yes (default) | no | — | `DEFAULT CURRENT_TIMESTAMP(6)` (per FR-018). typeORM `@CreateDateColumn`. |
| `created_by` | `VARCHAR(64)` | yes (default `'system'`) | no | — | Actor identifier (per FR-018). |
| `modified_at` | `DATETIME(6)` | yes (default) | no | — | `ON UPDATE CURRENT_TIMESTAMP(6)` (per FR-018). typeORM `@UpdateDateColumn`. |
| `modified_by` | `VARCHAR(64)` | yes (default `'system'`) | no | — | Actor identifier for the most recent update (per FR-018). |
| `version` | `INT` | yes (default `1`) | no | — | typeORM `@VersionColumn` (per FR-018). |

**Constraints (DB-level, not in Joi)**:
- `PRIMARY KEY (id)` — surrogate id.
- `FOREIGN KEY (level_id) REFERENCES levels(id)` — referential integrity for
  the `level` reference list (matches the `subject_id` FK pattern from
  `001-teachers`).
- `FOREIGN KEY (form_teacher_id) REFERENCES teachers(id)` —
  cross-feature referential integrity for the form teacher. The FK is the
  last line of defence behind the pre-INSERT `findTeacherByUlid` lookup
  (keyed on `formTeacher.ulid` against `uq_teachers_ulid`, per
  Clarifications, Session 2026-06-20 (POST/GET reference object shape);
  see [research.md §2.2](./research.md#22-form-teacher-lookup-in-post-apiclasses)
  and [research.md §2.3](./research.md#23-classesform_teacher_id--foreign-key-vs-application-level-reference)).
- `UNIQUE KEY uq_classes_name (name)` — race-safe enforcement of
  `FR-005c` (class name uniqueness).
- `UNIQUE KEY uq_classes_form_teacher (form_teacher_id)` — race-safe
  enforcement of `FR-005` ("at most one class per form teacher").
- `UNIQUE KEY uq_classes_ulid (ulid)` — cross-cutting ULID row-handle
  rule (per FR-021).

**Indexes**:
- `PRIMARY KEY (id)` — surrogate id PK.
- `UNIQUE KEY uq_classes_name (name)` — supports the `409 "Class name
  already in use"` path and the global name uniqueness.
- `UNIQUE KEY uq_classes_form_teacher (form_teacher_id)` — supports the
  `409 "Teacher already assigned"` path and the form-teacher
  one-to-one invariant.
- `UNIQUE KEY uq_classes_ulid (ulid)` — supports the cross-cutting ULID
  row-handle rule (per FR-021).
- `KEY idx_classes_level_id (level_id)` — supports the FK JOIN.
- Implicit `FOREIGN KEY` indexes on `level_id` and `form_teacher_id` (MySQL
  creates the index automatically to back the FK).

**typeORM entity (sketch)**:

```ts
// lib/db/entities/Class.ts
import {
  Entity, Column, Index, ManyToOne, JoinColumn, BeforeInsert,
  PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
  VersionColumn,
} from "typeorm";
import { Teacher } from "./Teacher";
import { Level } from "./Level";
import { generateUlid } from "../../ulid";

@Entity({ name: "classes" })
@Index("uq_classes_name", ["name"], { unique: true })
@Index("uq_classes_form_teacher", ["formTeacherId"], { unique: true })
@Index("uq_classes_ulid", ["ulid"], { unique: true })
export class Class {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id!: string;

  @Column({ type: "char", length: 26, unique: true })
  ulid!: string; // per FR-021 — frontend-stable row handle

  @ManyToOne(() => Level, { nullable: false })
  @JoinColumn({ name: "level_id", referencedColumnName: "id" })
  levelRef!: Level;

  @Column({ type: "varchar", length: 255, unique: true })
  name!: string;

  @ManyToOne(() => Teacher, { nullable: false })
  @JoinColumn({ name: "form_teacher_id", referencedColumnName: "id" })
  formTeacher!: Teacher;

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt!: Date;

  @Column({ name: "created_by", type: "varchar", length: 64, default: "system" })
  createdBy!: string;

  @UpdateDateColumn({ name: "modified_at", type: "datetime", precision: 6 })
  modifiedAt!: Date;

  @Column({ name: "modified_by", type: "varchar", length: 64, default: "system" })
  modifiedBy!: string;

  @VersionColumn({ name: "version", type: "int", default: 1 })
  version!: number;

  @BeforeInsert()
  assignUlid(): void {
    if (!this.ulid) this.ulid = generateUlid();
  }
}
```

**Joi schema (sketch)** — the schema is generated at app boot from the active
`levels` and `teachers` rows so it stays in lockstep with the DB. The Joi
schema mirrors the **public API** surface (`level` and `formTeacher` nested
`{ ulid, name }` reference objects, per Clarifications, Session 2026-06-20
(POST/GET reference object shape)), not the persistence FK ids:

```ts
// lib/validation/class.ts
import Joi from "joi";
import { getActiveLevelUlids } from "../db/repositories/level-repo";
import { getActiveTeacherUlids } from "../db/repositories/teacher-repo";

export async function buildCreateClassSchema() {
  const activeLevelUlids = await getActiveLevelUlids();
  const activeTeacherUlids = await getActiveTeacherUlids();
  return Joi.object({
    // Per Clarifications, Session 2026-06-20 (POST/GET reference object shape):
    //   level.ulid is the server-side lookup key (validated against uq_levels_ulid);
    //   level.name is a display hint and is ignored server-side.
    level: Joi.object({
      ulid: Joi.string().length(26).valid(...activeLevelUlids).required(),
      name: Joi.string().min(1).max(64).optional(),
    }).required(),
    name: Joi.string().trim().min(1).max(255).required(),
    // formTeacher: same nested { ulid, name } shape; resolved server-side
    //   via findTeacherByUlid against uq_teachers_ulid.
    formTeacher: Joi.object({
      ulid: Joi.string().length(26).valid(...activeTeacherUlids).required(),
      name: Joi.string().min(1).max(64).optional(),
    }).required(),
  });
}
```

---

## 3. Relationships

- **`classes.form_teacher_id` → `teachers.id`** (cross-feature FK,
  owned by 002-classes). Many classes to one teacher, but the
  `UNIQUE(classes.form_teacher_id)` collapses this to a one-to-one. The
  relationship is non-nullable (every class has a form teacher). The
  `ON DELETE` behaviour is `RESTRICT` (the default), matching the
  Constitution's Principle V (Simplicity) and the spec's Edge Case §4
  ("a teacher is deleted after a class was created with that teacher as
  the form teacher — out of scope for v1; the class keeps the form teacher
  reference as it was at creation time"). See
  [research.md §2.3](./research.md#23-classesform_teacher_id--foreign-key-vs-application-level-reference).
  The public API surface exposes `classes.formTeacher` as a nested
  `{ ulid, name }` object (per Clarifications, Session 2026-06-20
  (POST/GET reference object shape) and FR-020); `formTeacher.ulid` is
  the server-side lookup key resolved via `findTeacherByUlid` against
  `uq_teachers_ulid`, and `formTeacher.name` echoes the referenced
  teacher's authoritative `name`.
- **`classes.level_id` → `levels.id`**. Many classes to one level. The
  relationship is non-nullable (every class has a level). Deleting or
  deactivating a `levels` row that is referenced by a class is blocked at
  the DB level (mirrors the `subjects` ↔ `teachers` relationship from
  `001-teachers`). The public API surface exposes `classes.level` as a
  nested `{ ulid, name }` object (per Clarifications, Session 2026-06-20
  (POST/GET reference object shape) and FR-020); `level.ulid` is the
  server-side lookup key resolved via `findLevelByUlid` against
  `uq_levels_ulid`, and `level.name` echoes the referenced level's
  authoritative `name`.
- **`classes.id` ↔ `classes.form_teacher_id`**: orthogonal. The
  surrogate `id` is the PK for typeORM; the form-teacher reference is
  the FK to the related `teachers` row. `id` is the route-handler target
  for future endpoints, `formTeacher` (a nested `{ ulid, name }` object,
  per Clarifications, Session 2026-06-20 (POST/GET reference object shape);
  `formTeacher.ulid` is the server-side lookup key resolved via
  `findTeacherByUlid` against `uq_teachers_ulid`) is the user-facing
  identifier on the wire.
- **`classes.ulid`** (per FR-021): the cross-cutting frontend-stable row
  handle. NOT a FK target — every table has its own `ulid` column with
  `UNIQUE` enforcement, generated server-side by `lib/ulid.ts`. The
  public API surface exposes `ulid` as the first property of every
  Stage 1 POST 201 body and every entry in the GET 200 list (matching
  the `001-teachers` and `003-backend-api-db` wire shapes).

---

## 4. State / Lifecycle

- Classes have no `status` / `archived` / `soft-deleted` field in Stage 1.
- Stage 1 is Create + Read only; no Update / Delete (per the Constitution's
  Stage Scope and the spec Assumptions).
- The `id` is a monotonic auto-increment, but the spec does not commit to a
  specific starting value or step. The only guarantee is "uniqueness over
  the lifetime of the table".
- A "deleted" teacher would orphan the `classes.form_teacher_id` →
  `teachers.id` FK; this scenario is explicitly out of scope for
  Stage 1 (see the spec Edge Case §4 and
  [research.md §2.3](./research.md#23-classesform_teacher_id--foreign-key-vs-application-level-reference)
  for the "RESTRICT" caveat).

---

## 5. Active level list (runtime)

The `GET /api/v1.0/levels` endpoint returns `levels` rows where
`active = true`. The Joi schema for `POST /api/v1.0/classes` is generated from
this same list at app boot, so the request validator can never accept a
level that's not in the dropdown.

This is the same single-source-of-truth pattern as the active-subjects
list in [001-teachers data-model.md §"Active subject list"](../001-teachers/data-model.md#active-subject-list-runtime):
the same UI dropdown, the same API validation, the same DB constraint all
read from the same `WHERE active = true` query.

---

## 6. Volume / scale assumptions

- ≤ 500 classes (per spec Clarifications, Session 2026-06-18, Q4 and
  Assumptions).
- The `levels` list has ≤ 50 rows (the Stage 1 seed has 10; admin-authored
  growth in later stages is bounded by the school catalog).
- No pagination. No batch endpoints. No soft-delete. No audit log.
- The `GET /api/v1.0/classes` JOIN against `teachers` is O(M log N) for M
  classes and N teachers; at the Stage 1 upper bound (≤ 500 × ≤ 500) it
  is well under 5 ms on a dev laptop. See
  [research.md §2.6](./research.md#26-get-apiv10classes-join-strategy).

---

## 7. What is *not* in this data model

- No `id` exposure in the Stage 1 API response — the surrogate id is
  hidden in `toJSON` (per the spec Clarifications, Session 2026-06-18,
  Q5). The DB column exists for future use; the wire shape remains
  `{ "ulid", "level": { "ulid", "name" }, "name", "formTeacher": { "ulid", "name" } }`
  (per Clarifications, Session 2026-06-20 (POST/GET reference object
  shape) and FR-021 — the `ulid` row handle is exposed as the first
  property of every entry).
- No `ulid` acceptance from the client — the `ulid` column is
  server-generated by the `ulid` npm package via `lib/ulid.ts`. The Joi
  request body schema does not include a `ulid` field; clients receive
  it on the response but cannot set it.
- No soft-delete columns.
- No composite `(level, name)` uniqueness — uniqueness is **global** on
  `name`, not composite (per the spec Clarifications, Session 2026-06-18,
  Q3).

---

## 8. Migration inventory (legacy — superseded by FR-016, Session 2026-06-21)

> **Stage 1 has no typeORM migration set for the `classes` /
> `levels` tables** (per FR-016, Session 2026-06-21). The MySQL
> schema, audit columns, ULID column, FK constraints, UNIQUE
> indexes, and the `levels` seed list are all created by the user
> against the user-prepared MySQL container. The previous two
> typeORM migrations documented in this section
> (`1700000000002-InitClasses.ts`,
> `1700000000003-SeedLevels.ts`) are removed from the project
> source. This section is preserved for the migration history only.

The previous two new migrations were both idempotent, both owned
by `002-classes`. They were designed to run **after** the two
001-teachers migrations (the typeORM timestamp prefix orders them).

1. **`1700000000002-InitClasses.ts`** — created the `levels` and
   `classes` tables with the full six-column audit pattern on each
   (`id` PK, `ulid`, `created_at`, `created_by`, `modified_at`,
   `modified_by`, `version`); created the `UNIQUE` indexes on
   `levels.name`, `classes.name`, `classes.form_teacher_id`,
   `levels.ulid`, and `classes.ulid`; created the FK
   `classes.level_id REFERENCES levels(id)`; created the cross-feature
   FK `classes.form_teacher_id REFERENCES teachers(id)`.
2. **`1700000000003-SeedLevels.ts`** — `INSERT IGNORE INTO levels (id,
   ulid, name, active) VALUES (?, ?, ?, ?), ...` for the Stage 1 seed
   list (Primary 1 … Secondary 4) with explicit `id` values (1..10);
   the `ulid` values were also explicit so re-runs were idempotent.

**Previous full migration set (after both 001 and 002 plans ran)**:

| Timestamp | File | Owner | Purpose |
|---|---|---|---|
| 1700000000000 | `InitSchema.ts` | 001-teachers | `subjects`, `teachers` with `ulid` + six-column audit pattern; `UNIQUE(subjects.name)`, `UNIQUE(teachers.email)`, `UNIQUE(subjects.ulid)`, `UNIQUE(teachers.ulid)`; `FK(teachers.subject_id → subjects.id)` |
| 1700000000001 | `SeedSubjects.ts` | 001-teachers | Seed `subjects` rows (idempotent, explicit ulid values) |
| 1700000000002 | `InitClasses.ts` | 002-classes | `levels`, `classes` with `ulid` + six-column audit pattern; `UNIQUE(levels.name)`, `UNIQUE(classes.name)`, `UNIQUE(classes.form_teacher_id)`, `UNIQUE(levels.ulid)`, `UNIQUE(classes.ulid)`; `FK(classes.level_id → levels.id)`; `FK(classes.form_teacher_id → teachers.id)` |
| 1700000000003 | `SeedLevels.ts` | 002-classes | Seed `levels` rows (idempotent, explicit ulid values) |

The previous migration set was committed to the repo; the
`typeorm-ts-node-commonjs migration:run` command (run by the app
container on `docker compose up`) brought the schema up from empty.
A re-run was a no-op (the `IF NOT EXISTS` and `INSERT IGNORE`
patterns made every migration idempotent on `up`).
