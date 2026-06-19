import { getDataSource } from "@/lib/db/data-source";
import { Class } from "@/lib/db/entities/Class";

export interface CreateClassInput {
  levelId: string;
  name: string;
  formTeacherId: string;
}

export interface ClassWithFormTeacher {
  ulid: string;
  level: string;
  name: string;
  formTeacher: { name: string };
}

/**
 * Insert a new class. The caller has already resolved the wire fields
 * `level` (level name) and `teacherEmail` to the surrogate FK ids
 * `levelId` and `formTeacherId` (per FR-019).
 *
 * The `UNIQUE(classes.name)` and `UNIQUE(classes.form_teacher_id)`
 * indexes + the FK to `teachers.id` are the race-safe integrity layer;
 * thrown `QueryFailedError`s are mapped by `lib/api/db-error.toApiError()`.
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
 * List all classes joined with the form-teacher's name. The surrogate
 * `id` column is intentionally omitted from the response shape per
 * `specs/002-classes/spec.md` Clarifications Q5; the audit columns are
 * hidden per FR-020.
 *
 * The JOIN is on `teachers.id` (the surrogate PK) per FR-019 — the
 * `form_teacher_id` FK column references `teachers.id`.
 */
export async function listClassesWithFormTeacher(): Promise<ClassWithFormTeacher[]> {
  const ds = await getDataSource();
  const rows = await ds
    .createQueryBuilder()
    .select("c.ulid", "ulid")
    .addSelect("l.name", "levelName")
    .addSelect("c.name", "name")
    .addSelect("t.name", "formTeacherName")
    .from(Class, "c")
    .innerJoin("teachers", "t", "t.id = c.formTeacherId")
    .innerJoin("levels", "l", "l.id = c.levelId")
    .orderBy("l.name", "ASC")
    .addOrderBy("c.name", "ASC")
    .getRawMany<{
      ulid: string;
      levelName: string;
      name: string;
      formTeacherName: string;
    }>();

  return rows.map((r) => ({
    ulid: r.ulid,
    level: r.levelName,
    name: r.name,
    formTeacher: { name: r.formTeacherName },
  }));
}