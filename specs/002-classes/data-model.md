# Data Model: Classes (002-classes)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)

This document captures the persistence model and the validation surface for the
Classes feature. The Classes feature is built on top of the
[001-teachers](../001-teachers/data-model.md) data model: it adds two new tables
(`classes`, `levels`) and a single cross-feature `FOREIGN KEY` from
`classes.form_teacher_email` to `teachers.email`. Everything else (the
`subjects` reference list, the `teachers` table, the active-subjects pattern)
is owned by `001-teachers` and is referenced here as a dependency, not
re-derived.

---

## 1. `levels` table — `Level` entity (reference, read-only in Stage 1)

| Column | SQL type | Required | Unique | Validation (Joi, if accepted as input) | Notes |
|---|---|---|---|---|---|
| `name` | `VARCHAR(64)` | yes | yes (`PRIMARY KEY`) | `Joi.string().min(1).max(64).required()` | Display name as it appears in the Add Class dropdown (e.g., "Primary 1"). Used as the natural PK for the reference list (the table is read-only and tiny, so a surrogate id is unnecessary). |
| `active` | `BOOLEAN` (default `true`) | yes (default) | no | `Joi.boolean().default(true)` | Whether the level is currently selectable. Stage 1 always reads `WHERE active = true`. |

**Constraints (DB-level)**:
- `PRIMARY KEY (name)` — supports the FK from `classes.level` and the
  `GET /api/levels` lookup by name.

**Indexes**:
- `PRIMARY KEY (name)` — single index, both the PK and the name-uniqueness
  constraint.

**typeORM entity (sketch)**:

```ts
// lib/db/entities/Level.ts
import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity({ name: "levels" })
export class Level {
  @PrimaryColumn({ type: "varchar", length: 64 })
  name!: string;

  @Column({ type: "boolean", default: true })
  active!: boolean;
}
```

**Stage 1 seed list** (delivered by the fourth migration
`1700000000003-SeedLevels.ts`, idempotent via `INSERT IGNORE`):

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

(The exact list is `INSERT IGNORE`'d by the migration. The list can be amended
in a follow-up migration in a later stage; Stage 1 ships with this default.)

---

## 2. `classes` table — `Class` entity

| Column | SQL type | Required | Unique | Validation (Joi) | Notes |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` (auto-increment) | yes (auto) | yes (PK) | n/a (server-generated, not in request body) | Surrogate primary key. Not exposed in the Stage 1 API response (see spec Clarifications, Session 2026-06-18, Q5); the column exists so a future edit/delete endpoint can route by id without a migration. |
| `level` | `VARCHAR(64)` | yes | no (FK) | `Joi.string().valid(...activeLevelNames).required()` | Foreign key to `levels.name`. The Joi schema is generated from the active levels at startup. |
| `name` | `VARCHAR(255)` | yes | yes (`UNIQUE`) | `Joi.string().trim().min(1).max(255).required()` | Display name (e.g., "Class 1A"). Global uniqueness enforced by `UNIQUE KEY uq_classes_name` (see `FR-005c` and the spec Clarifications, Session 2026-06-18, Q3). |
| `form_teacher_email` | `VARCHAR(254)` | yes | yes (`UNIQUE`) | `Joi.string().email({ tlds: false }).trim().lowercase().max(254).required()` | Foreign key to `teachers.email`. `UNIQUE` enforces the "at most one class per teacher" invariant (`FR-005`). |
| (no `createdAt` / `updatedAt`) | — | — | — | — | Stage 1 is Create + Read only; audit columns are deferred. |

**Constraints (DB-level, not in Joi)**:
- `PRIMARY KEY (id)` — surrogate id.
- `FOREIGN KEY (level) REFERENCES levels(name)` — referential integrity for
  the `level` reference list (matches the `subject` FK pattern from
  `001-teachers`).
- `FOREIGN KEY (form_teacher_email) REFERENCES teachers(email)` —
  cross-feature referential integrity for the form teacher. The FK is the
  last line of defence behind the pre-INSERT `SELECT 1 FROM teachers WHERE
  email = ?` check (see [research.md §2.2](./research.md#22-form-teacher-lookup-in-post-apiclasses)
  and [research.md §2.3](./research.md#23-classesform_teacher_email--foreign-key-vs-application-level-reference)).
- `UNIQUE KEY uq_classes_name (name)` — race-safe enforcement of
  `FR-005c` (class name uniqueness).
- `UNIQUE KEY uq_classes_form_teacher (form_teacher_email)` — race-safe
  enforcement of `FR-005` ("at most one class per form teacher").

**Indexes**:
- `PRIMARY KEY (id)` — surrogate id PK.
- `UNIQUE KEY uq_classes_name (name)` — supports the `409 "Class name
  already in use"` path and the global name uniqueness.
- `UNIQUE KEY uq_classes_form_teacher (form_teacher_email)` — supports the
  `409 "Teacher already assigned"` path and the form-teacher
  one-to-one invariant.
- Implicit `FOREIGN KEY` indexes on `level` and `form_teacher_email` (MySQL
  creates the index automatically to back the FK).

**typeORM entity (sketch)**:

```ts
// lib/db/entities/Class.ts
import { Entity, Column, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from "typeorm";
import { Teacher } from "./Teacher";
import { Level } from "./Level";

@Entity({ name: "classes" })
@Index("uq_classes_name", ["name"], { unique: true })
@Index("uq_classes_form_teacher", ["formTeacherEmail"], { unique: true })
export class Class {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string; // typeORM returns BIGINT as string by default

  @Column({ type: "varchar", length: 64 })
  level!: string;

  @Column({ type: "varchar", length: 255, unique: true })
  name!: string;

  @Column({ name: "form_teacher_email", type: "varchar", length: 254 })
  formTeacherEmail!: string;

  @ManyToOne(() => Teacher, { nullable: false })
  @JoinColumn({ name: "form_teacher_email", referencedColumnName: "email" })
  formTeacher?: Teacher;

  @ManyToOne(() => Level, { nullable: false })
  @JoinColumn({ name: "level", referencedColumnName: "name" })
  levelRef?: Level;
}
```

**Joi schema (sketch)** — the schema is generated at app boot from the active
`levels` rows so it stays in lockstep with the DB:

```ts
// lib/validation/class.ts
import Joi from "joi";
import { getActiveLevelNames } from "../db/repositories/level-repo";

export async function buildCreateClassSchema() {
  const levels = await getActiveLevelNames();
  return Joi.object({
    level: Joi.string().valid(...levels).required(),
    name: Joi.string().trim().min(1).max(255).required(),
    teacherEmail: Joi.string().email({ tlds: false }).trim().lowercase().max(254).required(),
  });
}
```

---

## 3. Relationships

- **`classes.form_teacher_email` → `teachers.email`** (cross-feature FK,
  owned by 002-classes). Many classes to one teacher, but the
  `UNIQUE(classes.form_teacher_email)` collapses this to a one-to-one. The
  relationship is non-nullable (every class has a form teacher). The
  `ON DELETE` behaviour is `RESTRICT` (the default), matching the
  Constitution's Principle V (Simplicity) and the spec's Edge Case §4
  ("a teacher is deleted after a class was created with that teacher as
  the form teacher — out of scope for v1; the class keeps the form teacher
  reference as it was at creation time"). See
  [research.md §2.3](./research.md#23-classesform_teacher_email--foreign-key-vs-application-level-reference).
- **`classes.level` → `levels.name`**. Many classes to one level. The
  relationship is non-nullable (every class has a level). Deleting or
  deactivating a `levels` row that is referenced by a class is blocked at
  the DB level (mirrors the `subjects` ↔ `teachers` relationship from
  `001-teachers`).
- **`classes.id` ↔ `classes.form_teacher_email`**: orthogonal. The
  surrogate `id` is the natural PK for typeORM; the form-teacher email is
  the natural identifier of the related `teachers` row. Both are
  intentionally exposed in the codebase — `id` is the route-handler target
  for future endpoints, `form_teacher_email` is the user-facing identifier
  on the wire.

---

## 4. State / Lifecycle

- Classes have no `status` / `archived` / `soft-deleted` field in Stage 1.
- Stage 1 is Create + Read only; no Update / Delete (per the Constitution's
  Stage Scope and the spec Assumptions).
- The `id` is a monotonic auto-increment, but the spec does not commit to a
  specific starting value or step. The only guarantee is "uniqueness over
  the lifetime of the table".
- A "deleted" teacher would orphan the `classes.form_teacher_email` →
  `teachers.email` FK; this scenario is explicitly out of scope for
  Stage 1 (see the spec Edge Case §4 and
  [research.md §2.3](./research.md#23-classesform_teacher_email--foreign-key-vs-application-level-reference)
  for the "RESTRICT" caveat).

---

## 5. Active level list (runtime)

The `GET /api/levels` endpoint returns `levels` rows where
`active = true`. The Joi schema for `POST /api/classes` is generated from
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
- The `GET /api/classes` JOIN against `teachers` is O(M log N) for M
  classes and N teachers; at the Stage 1 upper bound (≤ 500 × ≤ 500) it
  is well under 5 ms on a dev laptop. See
  [research.md §2.6](./research.md#26-get-apiclasses-join-strategy).

---

## 7. What is *not* in this data model

- No `id` exposure in the Stage 1 API response — the surrogate id is
  hidden in `toJSON` (per the spec Clarifications, Session 2026-06-18,
  Q5). The DB column exists for future use; the wire shape remains
  `{ "level", "name", "formTeacher": { "name" } }`.
- No `createdAt` / `updatedAt` columns in Stage 1 (the spec doesn't
  require them; can be added in a future stage if audit becomes
  necessary).
- No soft-delete columns.
- No `version` column (no optimistic locking needed; Stage 1 is
  Create + Read).
- No composite `(level, name)` uniqueness — uniqueness is **global** on
  `name`, not composite (per the spec Clarifications, Session 2026-06-18,
  Q3).

---

## 8. Migration inventory

Two new migrations, both idempotent, both owned by `002-classes`. They run
**after** the two 001-teachers migrations (the typeORM timestamp prefix
orders them; see [research.md §2.5](./research.md#25-migration-strategy--separate-002-migration-vs-001-owned-migration)).

1. **`1700000000002-InitClasses.ts`** — creates the `levels` and
   `classes` tables; creates the `UNIQUE` indexes on
   `classes.name` and `classes.form_teacher_email`; creates the
   `FOREIGN KEY (level) REFERENCES levels(name)`; creates the
   cross-feature `FOREIGN KEY (form_teacher_email) REFERENCES
   teachers(email)`. `up` creates; `down` drops.
2. **`1700000000003-SeedLevels.ts`** — `INSERT IGNORE INTO levels (name,
   active) VALUES (?, ?), (?, ?), ...` for the Stage 1 seed list
   (Primary 1 … Secondary 4). `up` inserts; `down` deletes the seeded
   rows.

**Full migration set (after both 001 and 002 plans run)**:

| Timestamp | File | Owner | Purpose |
|---|---|---|---|
| 1700000000000 | `InitSchema.ts` | 001-teachers | `subjects`, `teachers`; `UNIQUE(teachers.email)`; `FK(teachers.subject → subjects.name)` |
| 1700000000001 | `SeedSubjects.ts` | 001-teachers | Seed `subjects` rows (idempotent) |
| 1700000000002 | `InitClasses.ts` | 002-classes | `levels`, `classes`; `UNIQUE(classes.name)`; `UNIQUE(classes.form_teacher_email)`; `FK(classes.level → levels.name)`; `FK(classes.form_teacher_email → teachers.email)` |
| 1700000000003 | `SeedLevels.ts` | 002-classes | Seed `levels` rows (idempotent) |

The migration set is committed to the repo; the
`typeorm-ts-node-commonjs migration:run` command (run by the app container
on `docker compose up`) brings the schema up from empty. A re-run is a
no-op (the `IF NOT EXISTS` and `INSERT IGNORE` patterns make every
migration idempotent on `up`).
