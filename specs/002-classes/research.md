# Research: Classes (002-classes)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)

This document captures the open Technical Context decisions from `plan.md`.
Most stack decisions are inherited from the
[001-teachers plan/research](../001-teachers/research.md) — the same
Next.js + typeORM + Joi + SGDS v3 + Vitest + docker-compose stack runs both
features. This document focuses on the 002-classes-specific decisions
(join strategy, FK design, migration placement, surrogate id) and explicitly
cross-references the inherited ones.

---

## 2.1. Stack inheritance from 001-teachers

**Decision**: Reuse the 001-teachers stack as-is — same Next.js 15, same
typeORM 0.3, same MySQL 8, same Joi 17, same **Ant Design (`antd`)** +
**Tailwind CSS** (constitution v2.3.0 amendment supersedes the prior SGDS v3
choice), same Vitest, same docker-compose layout. No new npm dependencies
for this feature (the `antd` / `tailwindcss` / `postcss` / `autoprefixer`
packages are added by 001-teachers/T001 and inherited).

**Rationale**:
- The Constitution's Principle V (Simplicity) says "no dependencies added
  'because we might need it'". The Classes feature is satisfied by the
  existing stack; adding a new ORM, a new validation library, or a new UI
  library would be a violation.
- The same Next.js codebase hosts both features (per the Constitution's
  "one process" rule). The `app/classes/*` and `app/api/classes/*` routes
  are siblings to the `app/teachers/*` and `app/api/teachers/*` routes.
- The same Joi factory pattern (`buildCreateXxxSchema()`) used for the
  Teachers endpoint is reused for Classes, with the active levels list
  pulled from the DB at boot.
- The same shared UI components (`FormField`, `Button`, `StateViews`)
  are reused; the only new component is `Select`, a thin wrapper around
  the `antd` `Select` primitive that already exists in the dependency
  tree, styled with Tailwind CSS utility classes.

**Cross-references** (decisions made in the 001-teachers plan and
inherited here without re-deriving):
- Unit-test runner: Vitest ([001-teachers research.md §1.1](../001-teachers/research.md#11-unit-test-runner-vitest-vs-jest))
- Container layout: docker-compose with 2 services ([001-teachers research.md §1.2](../001-teachers/research.md#12-container-layout-dockerfile-vs-docker-compose))
- UI library and styling version pin: Ant Design + Tailwind CSS ([001-teachers research.md §1.3](../001-teachers/research.md#13-ui-library-and-styling-version-pin-ant-design--tailwind-css))
- typeORM 0.3 + mysql2 ([001-teachers research.md §1.4](../001-teachers/research.md#14-data-access-typeorm-version--driver))
- Joi 17 ([001-teachers research.md §1.5](../001-teachers/research.md#15-validation-library-joi-vs-zod-vs-class-validator))
- Missing requirements file: not blocking ([001-teachers research.md §1.6](../001-teachers/research.md#16-missing-requirements-asset))
- Next.js 15 + React 19 ([001-teachers research.md §1.7](../001-teachers/research.md#17-nextjs--react-versions))

**Alternatives considered**:
- **Re-derive the stack** — wasteful and risks subtle drift between the two
  features. Rejected.
- **Split the codebase into two Next.js apps** — explicitly forbidden by the
  Constitution. Rejected.

---

## 2.2. Form-teacher lookup in `POST /api/classes`

**Decision**: Two-step lookup: **first** `SELECT 1 FROM teachers WHERE email = ?`
to detect the `404 "Teacher not found"` case; **then** `INSERT INTO classes
(...)` and let the `UNIQUE` index on `classes.form_teacher_email` catch the
`409 "Teacher already assigned"` case race-safely.

**Rationale**:
- The pre-INSERT `SELECT` is the *only* way to distinguish `404 "Teacher not
  found"` from `409 "Teacher already assigned"` cleanly: if the teacher
  doesn't exist, the SELECT returns no row and the route handler returns
  `404`; if the teacher exists but is already a form teacher, the SELECT
  returns the existing `classes` row and the route handler returns `409`.
- Without the pre-INSERT check, the route handler would have to inspect the
  typeORM `QueryFailedError` and decide between `404` and `409` from the
  raw error code — possible but error-prone and harder to test.
- The `UNIQUE` index on `classes.form_teacher_email` (the second defence
  line) is still required: two simultaneous submissions with the same form
  teacher can both pass the pre-INSERT check; the second one then fails the
  `INSERT` with a `UNIQUE` violation, and the route handler translates that
  into `409 "Teacher already assigned"`. This is the
  `003-backend-api-db` SC-007 invariant ("at most one attempt succeeds
  under 10 concurrent submissions").
- The pre-INSERT check is a single indexed `SELECT`; with the
  `UNIQUE(teachers.email)` index, it's O(log N). For Stage 1 (≤ 500
  teachers) this is sub-millisecond.

**Route-handler sketch**:

```ts
// app/api/classes/route.ts (sketch, not the final code)
const schema = await buildCreateClassSchema();
const { value, error } = schema.validate(req.body);
if (error) return jsonError(400, error.message);

const teacher = await findTeacherByEmail(value.teacherEmail);
if (!teacher) return jsonError(404, "Teacher not found");

try {
  const created = await createClass(value);
  return jsonCreated(created);
} catch (e) {
  if (isUniqueViolation(e, "uq_classes_name"))         return jsonError(409, "Class name already in use");
  if (isUniqueViolation(e, "uq_classes_form_teacher"))  return jsonError(409, "Teacher already assigned");
  if (isFkViolation(e, "fk_classes_form_teacher"))     return jsonError(404, "Teacher not found");
  throw e; // → 500
}
```

**Alternatives considered**:
- **Single `INSERT` and inspect the typeORM error**: would conflate the
  teacher-not-found case with other errors (FK violation, race, network).
  The error code path would have to be more elaborate. Rejected.
- **`LEFT JOIN` in the INSERT (`INSERT ... SELECT`)**: would lose the
  ability to return a clean 404 vs 409 distinction. Rejected.
- **Application-level lock (`SELECT ... FOR UPDATE`)**: adds complexity
  for no Stage 1 benefit; the `UNIQUE` index is the right tool. Rejected.

---

## 2.3. `classes.form_teacher_email` — `FOREIGN KEY` vs application-level reference

**Decision**: **`FOREIGN KEY (form_teacher_email) REFERENCES teachers(email)`**
at the DB level. Application-level reference is rejected.

**Rationale**:
- The Constitution's Principle V (Simplicity) and the
  `003-backend-api-db` FR-007 both call for referential integrity at the
  data layer. A `FOREIGN KEY` is the simplest, fastest, and most
  testable way to enforce "a class's form teacher is always an existing
  teacher".
- Without the FK, the application code would have to check
  `SELECT 1 FROM teachers WHERE email = ?` on every class INSERT, plus
  every `SELECT` of a class (to handle the race where a teacher is
  deleted between INSERT and SELECT). The FK lets the DB do both.
- The FK also lets MySQL enforce the constraint on direct writes that
  bypass the API — exactly the property the
  `003-backend-api-db` User Story 2 codifies.
- The 001-teachers spec already requires `teachers.email` to be
  `UNIQUE` (FR-005). A `FOREIGN KEY` to a `UNIQUE` column is a clean
  MySQL pattern; no surrogate id is required for the teachers side.

**Caveat — deleting a teacher in a future stage**:
- A future-stage delete-teacher endpoint would have to handle the
  `ON DELETE` choice (`RESTRICT`, `CASCADE`, `SET NULL`). The current
  plan does not commit to one — Stage 1 has no DELETE on teachers. The
  `RESTRICT` default is the safe choice and is what the current
  `ON DELETE` behaviour would be (a teacher referenced by a class cannot
  be deleted).
- This is consistent with the `001-teachers` Assumptions and the
  `002-classes` Edge Case §4 ("a teacher is deleted after a class was
  created with that teacher as the form teacher — out of scope for v1").

**Alternatives considered**:
- **Application-level reference only** (no FK): simpler schema, but loses
  the race-safety property, and the application has to carry the
  consistency check everywhere. Rejected.
- **Surrogate `id` on `teachers` with `classes.form_teacher_id INT` FK**:
  more orthodox, but the 001-teachers spec says `email` is the natural
  identifier and that no internal surrogate id is exposed in the UI.
  Adding a surrogate id would be a contradiction. Rejected.

---

## 2.4. Class `id` strategy (surrogate, hidden)

**Decision**: Surrogate auto-increment `id` as the `classes` primary key.
The `id` column **is not** in the Stage 1 API response.

**Rationale**:
- The 002-classes spec's `Clarifications, Session 2026-06-18` (Q5)
  explicitly pins this: "Surrogate auto-increment `id`. The DB column is
  numeric and auto-generated… The `id` is **not** exposed in the Stage 1
  API response."
- A surrogate `id` lets a future edit/delete endpoint route by id without
  a schema migration. The `id` is the natural primary key for typeORM
  (`@PrimaryGeneratedColumn`).
- Global `name` uniqueness is enforced by a *separate* `UNIQUE` index, not
  by making `name` the PK (per the 002 spec Clarifications, Q3: global
  name uniqueness is the rule, not `(level, name)` composite).
- Hiding `id` from the Stage 1 API response is a one-line change in the
  route handler's `toJSON` mapping; the DB column exists for future use.

**typeORM entity sketch** (final code lives in `lib/db/entities/Class.ts`):

```ts
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

**Alternatives considered**:
- **Natural key `(level, name)`** — rejected by the 002 spec
  Clarifications (Q3): the spec wants **global** name uniqueness, not
  composite.
- **Natural key `name`** as the PK — works, but ties the PK to a
  human-editable string (a future "rename class" feature would require a
  cascading key change). Surrogate id avoids that.
- **No PK / `name` only as a `UNIQUE` index, no PK** — MySQL allows it
  but the typeORM `@PrimaryGeneratedColumn` is the idiomatic choice.

---

## 2.5. Migration strategy — separate 002 migration vs 001-owned migration

**Decision**: **Separate migrations, numbered to run after the 001
migrations.** `1700000000002-InitClasses.ts` creates the `levels` and
`classes` tables and the FK to `teachers.email`; `1700000000003-SeedLevels.ts`
seeds the `levels` table.

**Rationale**:
- typeORM migrations are versioned sequentially by the timestamp prefix;
  the file name alone determines the run order. All migrations can live
  in the same `lib/db/migrations/` folder regardless of which plan added
  them.
- Keeping the 001 and 002 migrations separate keeps each spec's plan
  self-contained: the 001 plan owns the `teachers` and `subjects` schema;
  the 002 plan owns the `classes` and `levels` schema. A future 003 plan
  (whenever it runs) can verify the cross-cutting contract by inspecting
  the migration set, not by re-deriving which file added which table.
- The migrations are *idempotent on `up`* (use `IF NOT EXISTS` and
  `INSERT IGNORE`); a re-run of the entire migration set is a no-op
  (matches `003-backend-api-db` FR-016 and FR-017).

**Migration set (final, after both 001 and 002 plans run)**:

| Timestamp | File | Owner | Purpose |
|---|---|---|---|
| 1700000000000 | `InitSchema.ts` | 001-teachers | Creates `subjects` + `teachers` tables, `UNIQUE` on `teachers.email` |
| 1700000000001 | `SeedSubjects.ts` | 001-teachers | `INSERT IGNORE` the subjects seed list |
| 1700000000002 | `InitClasses.ts` | 002-classes | Creates `levels` + `classes` tables, FK `classes.form_teacher_email` → `teachers.email`, `UNIQUE` on `classes.name`, `UNIQUE` on `classes.form_teacher_email` |
| 1700000000003 | `SeedLevels.ts` | 002-classes | `INSERT IGNORE` the levels seed list |

**Alternatives considered**:
- **Single 001-owned migration that creates all 4 tables** — would have
  made the 001 plan responsible for the `classes` and `levels` tables
  that the 001 spec doesn't talk about. Rejected.
- **No migrations / `synchronize: true` in typeORM** — explicitly
  forbidden by the `003-backend-api-db` FR-016 ("repeatable, versioned
  migration process"). Rejected.

---

## 2.6. `GET /api/classes` join strategy

**Decision**: **One `JOIN` query** in the route handler:

```sql
SELECT c.level, c.name, t.name AS form_teacher_name
FROM classes c
JOIN teachers t ON c.form_teacher_email = t.email
ORDER BY c.level, c.name;
```

**Rationale**:
- The response shape requires `formTeacher.name` (per the 002 spec
  `FR-007`). Either the route handler does a single `JOIN` (one query,
  one round-trip), or it does N+1 (one query for the class list, then N
  queries for each class's teacher name).
- With ≤ 500 classes (Stage 1 upper bound) the N+1 would be ≤ 500
  round-trips; even on a fast LAN that's 50+ ms vs the JOIN's < 5 ms. The
  JOIN is the right tool.
- The `JOIN` rides the existing `UNIQUE(teachers.email)` index, so it's
  O(M log N) for M classes and N teachers. Negligible at Stage 1 scale.
- The typeORM query is expressed as `createQueryBuilder("c")
  .innerJoinAndSelect("c.formTeacher", "t")` or equivalently via the
  `@ManyToOne` relation declared on the `Class` entity. Both are
  idiomatic.

**Response shape** (per `FR-007` and the 002 spec Assumptions):

```json
{
  "data": [
    { "level": "Primary 1", "name": "Class 1A", "formTeacher": { "name": "Alice Tan" } },
    { "level": "Primary 1", "name": "Class 1B", "formTeacher": { "name": "Bobby Lim" } }
  ]
}
```

The `id` column is intentionally **not** in the response (per the 002 spec
Clarifications, Q5).

**Alternatives considered**:
- **N+1 (find classes, then for each find teacher)** — naive, slow at
  scale, and explicitly a known anti-pattern. Rejected.
- **Denormalize the form teacher name onto the `classes` row** (cache
  the name on insert) — adds a write-time invariant ("if the teacher's
  name changes, update all of their classes") that the Stage 1 spec
  doesn't have. Rejected.
- **Return the teacher's email instead of the name** — violates `FR-007`
  ("each entry contains `level`, `name`, and `formTeacher.name`").
  Rejected.

---

## 2.7. `package.json` version policy (recap)

Per the user's input — "npm libraries should use the latest" — the Classes
feature adds **zero** new runtime dependencies. The dependency list in
[plan.md §Technical Context](./plan.md#technical-context) is the same as
the 001-teachers plan; everything in the `app/classes/*`,
`app/api/classes/*`, `app/api/levels/*`, `lib/validation/class.ts`,
`lib/db/entities/Class.ts`, and `lib/db/entities/Level.ts` files is written
against the already-installed packages (including the
`antd` / `tailwindcss` / `postcss` / `autoprefixer` packages introduced
by 001-teachers per the constitution v2.3.0 amendment).

If a future implementation step finds a gap (e.g., a specific `antd`
component that's missing or a Tailwind utility that doesn't cover a
required style), the gap is raised as a Complexity Tracking entry, not
as a silent dependency addition.
