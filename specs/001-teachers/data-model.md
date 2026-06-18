# Data Model: Teachers (001-teachers)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)

This document captures the persistence model and the validation surface for the
Teachers feature. The model is shared with the Classes feature via the
`subjects` reference list (and the future `classes.formTeacherEmail` →
`teachers.email` reference) — those cross-feature references are noted here
but the Classes-side implementation is owned by `002-classes` /
`003-backend-api-db`.

---

## Entities

### `teachers` table — `Teacher` entity

| Column | SQL type (per typeORM) | Required | Unique | Validation (Joi) | Notes |
|---|---|---|---|---|---|
| `name` | `VARCHAR(255)` (or longer) | yes | no | `Joi.string().trim().min(1).max(255).required()` | The teacher's full name. Free-text; no further structure. |
| `subject` | `VARCHAR(64)` | yes | no (FK) | `Joi.string().valid(...activeSubjectNames).required()` | Foreign key to `subjects.name`. The Joi schema is generated from the active subjects at startup (see "Active subject list" below). |
| `email` | `VARCHAR(254)` | yes | yes (UNIQUE) | `Joi.string().email({ tlds: false }).trim().lowercase().max(254).required()` | The unique identifier for a teacher. The DB enforces the `UNIQUE` constraint; the route handler translates the typeORM unique-constraint error into `409 Conflict`. |
| `contactNumber` | `CHAR(8)` (fixed) | yes | no | `Joi.string().pattern(/^[89]\d{7}$/).required()` | 8 digits, must start with `8` or `9` (Singapore mobile). The Joi regex `/^[89]\d{7}$/` is the single source of truth (matches `001-teachers` Clarifications, Session 2026-06-18). |
| (no surrogate id) | — | — | — | — | The spec does not require a surrogate id for teachers; `email` is the natural identifier. No `id` column in the Stage 1 `teachers` table. |

**Constraints (DB-level, not in Joi)**:
- `UNIQUE(email)` — race-safe enforcement of FR-005.
- `FOREIGN KEY (subject) REFERENCES subjects(name)` — referential integrity per
  `003-backend-api-db` Clarifications, Session 2026-06-18.

**Indexes**:
- `UNIQUE KEY uq_teachers_email (email)` — supports the `409` race-safety and
  the natural-key identity.

**typeORM entity (sketch)**:

```ts
// lib/db/entities/Teacher.ts
import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { Subject } from "./Subject";

@Entity({ name: "teachers" })
@Index("uq_teachers_email", ["email"], { unique: true })
export class Teacher {
  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 64 })
  subject!: string;

  @Column({ type: "varchar", length: 254, unique: true })
  email!: string;

  @Column({ name: "contact_number", type: "char", length: 8 })
  contactNumber!: string;

  @ManyToOne(() => Subject, { nullable: false })
  @JoinColumn({ name: "subject", referencedColumnName: "name" })
  subjectRef?: Subject;
}
```

**Joi schema (sketch)** — the schema is generated at app boot from the active
`subjects` rows so it stays in lockstep with the DB:

```ts
// lib/validation/teacher.ts
import Joi from "joi";
import { getActiveSubjectNames } from "../db/repositories/subject-repo";

export async function buildCreateTeacherSchema() {
  const subjects = await getActiveSubjectNames();
  return Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    subject: Joi.string().valid(...subjects).required(),
    email: Joi.string().email({ tlds: false }).trim().lowercase().max(254).required(),
    contactNumber: Joi.string().pattern(/^[89]\d{7}$/).required(),
  });
}
```

### `subjects` table — `Subject` entity (reference, read-only in Stage 1)

| Column | SQL type | Required | Unique | Validation (Joi, if accepted as input) | Notes |
|---|---|---|---|---|---|
| `name` | `VARCHAR(64)` | yes | yes (UNIQUE, PK) | `Joi.string().min(1).max(64).required()` | Display name as it appears in the Add Teacher dropdown. Used as the natural PK for the reference list (the table is read-only and tiny, so a surrogate id is unnecessary). |
| `active` | `BOOLEAN` (default `true`) | yes (default) | no | `Joi.boolean().default(true)` | Whether the subject is currently selectable. Stage 1 always reads `WHERE active = true`. |

**Constraints (DB-level)**:
- `PRIMARY KEY (name)` (or `UNIQUE KEY uq_subjects_name (name)` — both work; the
  plan uses `PRIMARY KEY (name)` for simplicity since the table is read-only and
  has no surrogate id).
- `CHECK (active IN (true, false))` is implicit in MySQL BOOLEAN.

**Indexes**:
- `PRIMARY KEY (name)` — supports the FK from `teachers.subject` and the
  `GET /api/subjects` lookup by name.

**typeORM entity (sketch)**:

```ts
// lib/db/entities/Subject.ts
import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity({ name: "subjects" })
export class Subject {
  @PrimaryColumn({ type: "varchar", length: 64 })
  name!: string;

  @Column({ type: "boolean", default: true })
  active!: boolean;
}
```

**Stage 1 seed list** (delivered by the second migration
`1700000000001-SeedSubjects.ts`, idempotent via `INSERT IGNORE`):

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

(The exact list is `INSERT IGNORE`'d by the migration. The list can be amended
in a follow-up migration in a later stage; Stage 1 ships with this default.)

---

## Relationships

- **`teachers.subject` → `subjects.name`**: Many teachers to one subject. The
  FK is on the `teachers` side. The relationship is non-nullable (a teacher
  must have a subject). Deleting or deactivating a `subjects` row that is
  referenced by a teacher is blocked at the DB level (per
  `003-backend-api-db` FR-009b).
- **`teachers.email` ↔ `classes.formTeacherEmail` (future, owned by Classes)**:
  No DB-level FK in Stage 1 (the Classes feature may add one when it
  implements the form-teacher relationship; the spec currently says the
  reference is enforced at the Classes feature level, see
  `002-classes/spec.md`).

---

## State / Lifecycle

- Teachers have no `status` / `archived` / `soft-deleted` field in Stage 1.
- Stage 1 is Create + Read only; no Update / Delete (per the Constitution's
  Stage Scope).
- A "deleted" teacher would orphan any class whose `formTeacherEmail` points
  at them; this scenario is explicitly out of scope for Stage 1 (see
  `001-teachers/spec.md` Assumptions and `002-classes/spec.md` Edge Cases
  §4).

---

## Active subject list (runtime)

The `GET /api/subjects` endpoint returns `subjects` rows where
`active = true`. The Joi schema for `POST /api/teachers` is generated from
this same list at app boot, so the request validator can never accept a
subject that's not in the dropdown.

This is a single source of truth across the UI (dropdown), the API
validation (Joi), and the DB constraint (FK). The pattern is reused by
`002-classes` for the `levels` list.

---

## Volume / scale assumptions

- ≤ 500 teachers (per `001-teachers/spec.md` Clarifications, Session 2026-06-18).
- The `subjects` list has ≤ 50 rows (the Stage 1 seed has 9; admin-authored
  growth in later stages is bounded by the school catalog).
- No pagination. No batch endpoints. No soft-delete. No audit log.

---

## What is *not* in this data model

- No surrogate `id` on `teachers` (the spec says email is the natural key).
- No surrogate `id` on `subjects` (the table is read-only and tiny; `name` is
  the PK).
- No `createdAt` / `updatedAt` columns in Stage 1 (the spec doesn't require
  them; can be added in a future stage if audit becomes necessary).
- No soft-delete columns.
- No `version` column (no optimistic locking needed; Stage 1 is Create + Read).

---

## Migration inventory

Two migrations, both idempotent:

1. **`1700000000000-InitSchema.ts`** — creates the `subjects` and `teachers`
   tables, the `UNIQUE` index on `teachers.email`, and the FK from
   `teachers.subject` to `subjects.name`. `up` creates; `down` drops.
2. **`1700000000001-SeedSubjects.ts`** — `INSERT IGNORE INTO subjects (name,
   active) VALUES (?, ?), (?, ?), ...` for the Stage 1 seed list. `up`
   inserts; `down` deletes the seeded rows.

The migration set is committed to the repo; the `typeorm-ts-node-commonjs
migration:run` command (run by the app container on `docker compose up`)
brings the schema up from empty.
