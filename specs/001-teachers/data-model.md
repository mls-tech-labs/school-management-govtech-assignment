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
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | yes | PK | — | Surrogate primary key (per `003-backend-api-db/spec.md` FR-018). The Stage 1 API does not expose this column in the response. |
| `ulid` | `CHAR(26)` | yes | yes (`UNIQUE` via `uq_teachers_ulid`) | — | 26-character Crockford Base32 ULID. Generated server-side on insert by the `ulid` npm package via `lib/ulid.ts` (per FR-021 — Session 2026-06-20 ULID clarification). The frontend-stable row handle; exposed in every Stage 1 GET and POST response. NOT a FK target. |
| `name` | `VARCHAR(255)` (or longer) | yes | no | `Joi.string().trim().min(1).max(255).required()` | The teacher's full name. Free-text; no further structure. |
| `subject_id` | `BIGINT UNSIGNED` | yes | FK | `Joi.string().valid(...activeSubjectNames).required()` (mapped to subject name) | Foreign key to `subjects.id` (per FR-019). The Joi schema validates the public-API field `subject` (which carries the referenced subject's `name`), not the internal FK id. |
| `email` | `VARCHAR(254)` | yes | yes (UNIQUE NOT NULL) | `Joi.string().email({ tlds: false }).trim().lowercase().max(254).required()` | The domain-natural identifier for a teacher (was the PK; now `UNIQUE NOT NULL` per FR-018). The DB enforces the `UNIQUE` constraint; the route handler translates the typeORM unique-constraint error into `409 Conflict`. |
| `contactNumber` | `CHAR(8)` (fixed) | yes | no | `Joi.string().pattern(/^\d{8}$/).required()` | Exactly 8 digits, digits-only, no leading-digit restriction (per FR-004, Session 2026-06-21). The Joi regex `/^\d{8}$/` is the single source of truth. |
| `created_at` | `DATETIME(6)` | yes (default) | no | — | Set once at insert via `DEFAULT CURRENT_TIMESTAMP(6)` (per FR-018). typeORM `@CreateDateColumn`. |
| `created_by` | `VARCHAR(64)` | yes (default `'system'`) | no | — | The actor identifier that created the row; set by application code on every write (per FR-018). |
| `modified_at` | `DATETIME(6)` | yes (default) | no | — | Bumped automatically via `ON UPDATE CURRENT_TIMESTAMP(6)` (per FR-018). typeORM `@UpdateDateColumn`. |
| `modified_by` | `VARCHAR(64)` | yes (default `'system'`) | no | — | The actor identifier for the most recent update; set by application code on every write (per FR-018). |
| `version` | `INT` | yes (default `1`) | no | — | typeORM `@VersionColumn` optimistic-lock counter; concurrent stale-version writes surface as `OptimisticLockVersionMismatchError`, mapped to HTTP `409 Conflict` by the API layer. |

**Constraints (DB-level, not in Joi)**:
- `UNIQUE(email)` (now `UNIQUE NOT NULL`, not the PK) — race-safe enforcement of FR-005.
- `UNIQUE(ulid)` — race-safe enforcement of the cross-cutting `ulid` row-handle rule (per FR-021).
- `FOREIGN KEY (subject_id) REFERENCES subjects(id)` — referential integrity per FR-019 and `003-backend-api-db` FR-009a.

**Indexes**:
- `PRIMARY KEY (id)` — surrogate PK per FR-018.
- `UNIQUE KEY uq_teachers_email (email)` — supports the `409` race-safety and the natural-key identity.
- `UNIQUE KEY uq_teachers_ulid (ulid)` — supports the cross-cutting ULID row-handle rule (per FR-021).
- `KEY idx_teachers_subject_id (subject_id)` — supports the FK and JOINs.

**typeORM entity (sketch)**:

```ts
// lib/db/entities/Teacher.ts
import {
  Entity, PrimaryGeneratedColumn, Column, Index, BeforeInsert,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
  VersionColumn,
} from "typeorm";
import { generateUlid } from "../../ulid";
import { Subject } from "./Subject";

@Entity({ name: "teachers" })
@Index("uq_teachers_email", ["email"], { unique: true })
@Index("uq_teachers_ulid", ["ulid"], { unique: true })
export class Teacher {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id!: string; // typeORM returns BIGINT as string by default

  @Column({ type: "char", length: 26, unique: true })
  ulid!: string; // per FR-021 — frontend-stable row handle

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @ManyToOne(() => Subject, { nullable: false })
  @JoinColumn({ name: "subject_id", referencedColumnName: "id" })
  subjectRef!: Subject;

  @Column({ type: "varchar", length: 254, unique: true })
  email!: string;

  @Column({ name: "contact_number", type: "char", length: 8 })
  contactNumber!: string;

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
`subjects` rows so it stays in lockstep with the DB. The Joi schema mirrors the
**public API** surface (natural-key field names), not the persistence FK id:

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
    contactNumber: Joi.string().pattern(/^\d{8}$/).required(),
  });
}
```

### `subjects` table — `Subject` entity (reference, read-only in Stage 1)

| Column | SQL type | Required | Unique | Validation (Joi, if accepted as input) | Notes |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | yes | PK | — | Surrogate primary key (per FR-018). Not exposed in the Stage 1 API response. |
| `ulid` | `CHAR(26)` | yes | yes (`UNIQUE` via `uq_subjects_ulid`) | — | 26-character Crockford Base32 ULID. Generated server-side on insert by the `ulid` npm package via `lib/ulid.ts` (per FR-021 — Session 2026-06-20 ULID clarification). The frontend-stable row handle; exposed in every Stage 1 GET response (the reference list is read-only). NOT a FK target. |
| `name` | `VARCHAR(64)` | yes | yes (UNIQUE NOT NULL) | `Joi.string().min(1).max(64).required()` | Display name as it appears in the Add Teacher dropdown. The natural-key identifier; preserved as `UNIQUE NOT NULL` per FR-018 (previously the PK). |
| `active` | `BOOLEAN` (default `true`) | yes (default) | no | `Joi.boolean().default(true)` | Whether the subject is currently selectable. Stage 1 always reads `WHERE active = true`. |
| `created_at` | `DATETIME(6)` | yes (default) | no | — | Set once at insert via `DEFAULT CURRENT_TIMESTAMP(6)` (per FR-018). |
| `created_by` | `VARCHAR(64)` | yes (default `'system'`) | no | — | Actor identifier (per FR-018). |
| `modified_at` | `DATETIME(6)` | yes (default) | no | — | Bumped via `ON UPDATE CURRENT_TIMESTAMP(6)` (per FR-018). |
| `modified_by` | `VARCHAR(64)` | yes (default `'system'`) | no | — | Actor identifier for the most recent update (per FR-018). |
| `version` | `INT` | yes (default `1`) | no | — | typeORM `@VersionColumn` (per FR-018). |

**Constraints (DB-level)**:
- `PRIMARY KEY (id)` — surrogate PK (per FR-018).
- `UNIQUE KEY uq_subjects_name (name)` — natural-key preserved as UNIQUE NOT NULL.
- `UNIQUE KEY uq_subjects_ulid (ulid)` — cross-cutting ULID row-handle rule (per FR-021).

**Indexes**:
- `PRIMARY KEY (id)` — canonical PK.
- `UNIQUE KEY uq_subjects_name (name)` — supports the natural-key identity and the FK from `teachers.subject_id`.
- `UNIQUE KEY uq_subjects_ulid (ulid)` — supports the cross-cutting ULID row-handle rule (per FR-021).

**typeORM entity (sketch)**:

```ts
// lib/db/entities/Subject.ts
import {
  Entity, PrimaryGeneratedColumn, Column, Index, BeforeInsert,
  CreateDateColumn, UpdateDateColumn, VersionColumn,
} from "typeorm";
import { generateUlid } from "../../ulid";

@Entity({ name: "subjects" })
@Index("uq_subjects_ulid", ["ulid"], { unique: true })
export class Subject {
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
| English | true |
| Mathematics | true |
| Science | true |
| Chinese | true |
| Malay | true |
| Tamil | true |
| Art | true |
| Music | true |
| Physical Education | true |

(The exact list is inserted by the user. The list can be amended
by the user in a later stage; Stage 1 ships with this default.
There is no typeORM migration or `INSERT IGNORE` step on the
application boot — per FR-016, Session 2026-06-21.)

---

## Relationships

- **`teachers.subject_id` → `subjects.id`**: Many teachers to one subject. The
  FK is on the `teachers` side (per FR-019). The relationship is non-nullable
  (a teacher must have a subject). Deleting or deactivating a `subjects` row
  that is referenced by a teacher is blocked at the DB level (per
  `003-backend-api-db` FR-009b). The public API surface continues to expose
  `teachers.subject` (the referenced subject's `name`), resolved via the FK
  (per FR-020).
- **`teachers.id` ↔ `classes.form_teacher_id` (owned by Classes)**: The
  Classes-side schema defines `FOREIGN KEY (form_teacher_id) REFERENCES
  teachers(id)` (per FR-019) in the user-prepared MySQL container.
  In Stage 1 the API surface expresses the reference as
  `classes.formTeacherEmail` (the teacher's `email`); the
  `002-classes` feature's POST handler resolves the email to the teacher row
  before insert and stores `form_teacher_id` (per `002-classes/data-model.md`).
- **`teachers.email` and `subjects.name`** are preserved as `UNIQUE NOT NULL`
  on the persistence side (per FR-018), even though they are no longer the
  primary keys. This keeps the natural-key identity for the public API.

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

The `GET /api/v1.0/subjects` endpoint returns `subjects` rows where
`active = true`. The Joi schema for `POST /api/v1.0/teachers` is generated from
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

- No soft-delete columns. Stage 1 has no delete; add in a follow-up
  migration if soft-delete is required.
- No `id` exposure in the Stage 1 API response. The surrogate `id` is hidden
  in each route handler's `toJSON` mapping; the API surface uses natural keys
  (`email`, `name`) plus the cross-cutting `ulid` row handle (per FR-021).
- No FK on `ulid`. The column is the frontend-stable row handle
  (per FR-021), not a join target. FKs continue to reference the
  surrogate `id` (per FR-019).
- No admin authoring of `subjects` in Stage 1 (admin authoring is a
  future-stage amendment).

---

## Migration inventory (legacy — superseded by FR-016, Session 2026-06-21)

> **Stage 1 has no typeORM migration set for the `teachers` /
> `subjects` tables** (per FR-016, Session 2026-06-21). The MySQL
> schema, audit columns, ULID column, FK constraints, UNIQUE
> indexes, and the `subjects` seed list are all created by the user
> against the user-prepared MySQL container. The previous two
> typeORM migrations documented in this section
> (`1700000000000-InitSchema.ts`,
> `1700000000001-SeedSubjects.ts`) are removed from the project
> source. This section is preserved for the migration history only.

The previous two-migration set was committed to the repo; the
`typeorm-ts-node-commonjs migration:run` command (run by the app
container on `docker compose up`) brought the schema up from empty.

The previous migrations were:

1. **`1700000000000-InitSchema.ts`** — created the `subjects` and
   `teachers` tables with the full audit pattern on each (`id` PK,
   `ulid` per FR-021, `created_at`, `created_by`, `modified_at`,
   `modified_by`, `version`), the `UNIQUE` index on `subjects.name`,
   the `UNIQUE` index on `teachers.email`, the `UNIQUE` index on
   `subjects.ulid` / `teachers.ulid` (per FR-021), and the FK
   `teachers.subject_id REFERENCES subjects(id)`.
2. **`1700000000001-SeedSubjects.ts`** — `INSERT IGNORE INTO
   subjects (id, ulid, name, active) VALUES (?, ?, ?, ?), ...`
   for the Stage 1 seed list with explicit id values (1..9) and
   explicit ulid values.
