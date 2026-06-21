import { getDataSource } from "@/lib/db/data-source";
import { Class } from "@/lib/db/entities/Class";

export interface CreateClassInput {
  levelId: string;
  name: string;
  formTeacherId: string;
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
