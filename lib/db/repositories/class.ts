import { getDataSource } from "@/lib/db/data-source";
import { Class } from "@/lib/db/entities/Class";

export interface CreateClassInput {
  levelId: string;
  name: string;
  formTeacherId: string;
}

/**
 * Resolve the nested `class.ulid` to the surrogate `classes.id`.
 *
 * Per `006-teachers-classes-mutations/data-model.md` §7: shared by the
 * new `GET /api/v1.0/classes/[ulid]` handler, the Edit Class RSC page,
 * and the PUT/DELETE handlers' pre-write lookups. Returns the full
 * Class entity so callers can pick which columns they need.
 */
export async function findClassByUlid(ulid: string): Promise<Class | null> {
  const ds = await getDataSource();
  return ds.getRepository(Class).findOne({ where: { ulid } });
}

/**
 * Form-teacher guard — the DELETE-Teacher 409 path needs to know
 * whether a class currently references this teacher as its form
 * teacher. Per `006-teachers-classes-mutations/data-model.md` §4:
 *
 *   - The query is a single indexed lookup against `classes.form_teacher_id`'s
 *     `UNIQUE` index (`uq_classes_form_teacher`). The `UNIQUE` constraint
 *     guarantees at most one row is returned.
 *   - The returned row's `ulid` and `name` are used as `details.classUlid`
 *     and the embedded class name in the DELETE-Teacher 409 envelope
 *     (per FR-009).
 *
 * Returns `{ id, ulid, name }` of the blocking class or `null` when the
 * teacher is not currently a form teacher.
 */
export async function findClassByFormTeacherId(
  formTeacherId: string,
): Promise<{ id: string; ulid: string; name: string } | null> {
  const ds = await getDataSource();
  const row = await ds
    .getRepository(Class)
    .createQueryBuilder("class")
    .select(["class.id", "class.ulid", "class.name"])
    .where("class.formTeacherId = :formTeacherId", { formTeacherId })
    .getOne();
  return row ? { id: row.id, ulid: row.ulid, name: row.name } : null;
}

/**
 * Update a class and capture the pre-update `modified_at` value.
 *
 * Per `006-teachers-classes-mutations/data-model.md` §5: the PUT 200
 * response body includes a sibling `previousModifiedAt` field whose
 * value is the row's `modified_at` IMMEDIATELY BEFORE the just-completed
 * write. The client-side `use-edit-submit` hook compares this value to
 * the form-load `modifiedAt` to detect a clobber between form-mount and
 * form-submit (per FR-016).
 *
 * Wraps the read + write in a single transaction so the captured value
 * is the value as observed at the moment of the update (no race with
 * a concurrent writer).
 */
export async function updateClassAndReturnPreviousModifiedAt(
  id: string,
  changes: {
    name?: string;
    levelId?: string;
    formTeacherId?: string;
  },
): Promise<{ klass: Class; previousModifiedAt: Date }> {
  const ds = await getDataSource();
  return ds.transaction(async (tx) => {
    const repo = tx.getRepository(Class);
    const row = await repo.findOneOrFail({ where: { id } });
    const previousModifiedAt = row.modifiedAt;
    if (changes.name !== undefined) row.name = changes.name;
    if (changes.levelId !== undefined) row.levelId = changes.levelId;
    if (changes.formTeacherId !== undefined) row.formTeacherId = changes.formTeacherId;
    const updated = await repo.save(row);
    return { klass: updated, previousModifiedAt };
  });
}

/**
 * Hard-delete a class by surrogate `id`. Returns `true` when a row
 * was deleted; `false` when no row matched (used by the DELETE
 * handler's idempotent 404 path per Principle X.2).
 */
export async function deleteClassById(id: string): Promise<boolean> {
  const ds = await getDataSource();
  const result = await ds.getRepository(Class).delete({ id });
  return (result.affected ?? 0) > 0;
}

/**
 * Wire shape of a class entry returned by
 * `GET /api/v1.0/classes` (per
 * `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
 * — POST/GET reference object shape). `level` and `formTeacher`
 * are nested `{ ulid, name }` objects; `name` echoes the
 * authoritative row name (not the client-supplied display hint).
 */
export interface ClassWithFormTeacher {
  ulid: string;
  level: { ulid: string; name: string };
  name: string;
  formTeacher: { ulid: string; name: string };
}

/**
 * Insert a new class. The caller has already resolved the wire
 * fields `level.ulid` and `formTeacher.ulid` to the surrogate FK
 * ids `levelId` and `formTeacherId` (per FR-019, via
 * `findLevelIdByUlid` / `findTeacherByUlid`).
 *
 * The `UNIQUE(classes.name)` and `UNIQUE(classes.form_teacher_id)`
 * indexes + the FK to `teachers.id` are the race-safe integrity
 * layer; thrown `QueryFailedError`s are mapped by
 * `lib/api/db-error.toApiError()`.
 */
export async function createClass(input: CreateClassInput): Promise<Class> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Class);
  const klass = repo.create({
    levelId: input.levelId,
    name: input.name,
    formTeacherId: input.formTeacherId,
  });
  return repo.save(klass);
}

/**
 * List all classes joined with the referenced level + form-teacher
 * rows. The wire shape carries `level: { ulid, name }` and
 * `formTeacher: { ulid, name }` per Clarifications, Session
 * 2026-06-20. The surrogate `id` column is intentionally omitted
 * from the response shape per FR-020; the audit columns are hidden
 * per FR-020.
 *
 * The JOINs are on the surrogate `id` columns (per FR-019); the
 * `form_teacher_id` FK column references `teachers.id` and the
 * `level_id` FK column references `levels.id`.
 */
export async function listClassesWithFormTeacher(): Promise<ClassWithFormTeacher[]> {
  const ds = await getDataSource();
  const rows = await ds
    .createQueryBuilder()
    .select("c.ulid", "ulid")
    .addSelect("l.ulid", "levelUlid")
    .addSelect("l.name", "levelName")
    .addSelect("c.name", "name")
    .addSelect("t.ulid", "formTeacherUlid")
    .addSelect("t.name", "formTeacherName")
    .from(Class, "c")
    .innerJoin("teachers", "t", "t.id = c.formTeacherId")
    .innerJoin("levels", "l", "l.id = c.levelId")
    .orderBy("l.name", "ASC")
    .addOrderBy("c.name", "ASC")
    .getRawMany<{
      ulid: string;
      levelUlid: string;
      levelName: string;
      name: string;
      formTeacherUlid: string;
      formTeacherName: string;
    }>();

  return rows.map((r) => ({
    ulid: r.ulid,
    level: { ulid: r.levelUlid, name: r.levelName },
    name: r.name,
    formTeacher: { ulid: r.formTeacherUlid, name: r.formTeacherName },
  }));
}
