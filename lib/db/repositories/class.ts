import { getDataSource } from "@/lib/db/data-source";
import { Class } from "@/lib/db/entities/Class";

export interface CreateClassInput {
  levelId: string;
  name: string;
  formTeacherId: string;
}

export async function findClassByUlid(ulid: string): Promise<Class | null> {
  const ds = await getDataSource();
  return ds.getRepository(Class).findOne({ where: { ulid } });
}

// Used by the DELETE-Teacher 409 path. The UNIQUE(form_teacher_id)
// index guarantees at most one row.
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

// `previousModifiedAt` reflects modified_at at the moment of update
// (no race with a concurrent writer).
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

export async function deleteClassById(id: string): Promise<boolean> {
  const ds = await getDataSource();
  const result = await ds.getRepository(Class).delete({ id });
  return (result.affected ?? 0) > 0;
}

export interface ClassWithFormTeacher {
  ulid: string;
  level: { ulid: string; name: string };
  name: string;
  formTeacher: { ulid: string; name: string };
}

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

  return rows.map(({ ulid, levelUlid, levelName, name, formTeacherUlid, formTeacherName }) => ({
    ulid,
    level: { ulid: levelUlid, name: levelName },
    name,
    formTeacher: { ulid: formTeacherUlid, name: formTeacherName },
  }));
}
