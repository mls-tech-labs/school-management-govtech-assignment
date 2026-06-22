import { getDataSource } from "@/lib/db/data-source";
import { Teacher } from "@/lib/db/entities/Teacher";
import { Subject } from "@/lib/db/entities/Subject";

export async function findSubjectIdByUlid(ulid: string): Promise<string | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Subject).findOne({
    where: { ulid, active: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function findSubjectByUlid(
  ulid: string,
): Promise<{ id: string; ulid: string; name: string } | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Subject).findOne({
    where: { ulid, active: true },
    select: { id: true, ulid: true, name: true },
  });
  return row ? { id: row.id, ulid: row.ulid, name: row.name } : null;
}

export async function findSubjectById(
  id: string,
): Promise<{ id: string; ulid: string; name: string } | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Subject).findOne({
    where: { id },
    select: { id: true, ulid: true, name: true },
  });
  return row ? { id: row.id, ulid: row.ulid, name: row.name } : null;
}

export async function createTeacher(input: {
  name: string;
  subjectId: string;
  email: string;
  contactNumber: string;
}): Promise<Teacher> {
  const ds = await getDataSource();
  const repo = ds.getRepository(Teacher);
  const teacher = repo.create({
    name: input.name,
    subjectId: input.subjectId,
    email: input.email,
    contactNumber: input.contactNumber,
  });
  return repo.save(teacher);
}

export async function findTeacherByUlid(ulid: string): Promise<Teacher | null> {
  const ds = await getDataSource();
  return ds.getRepository(Teacher).findOne({ where: { ulid } });
}

export async function findTeacherById(
  id: string,
): Promise<{ id: string; ulid: string; name: string } | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Teacher).findOne({
    where: { id },
    select: { id: true, ulid: true, name: true },
  });
  return row ? { id: row.id, ulid: row.ulid, name: row.name } : null;
}

// Wraps the read + write in a transaction so `previousModifiedAt`
// reflects the row's modified_at at the moment of update (no race
// with a concurrent writer).
export async function updateTeacherAndReturnPreviousModifiedAt(
  id: string,
  changes: {
    name?: string;
    subjectId?: string;
    email?: string;
    contactNumber?: string;
  },
): Promise<{ teacher: Teacher; previousModifiedAt: Date }> {
  const ds = await getDataSource();
  return ds.transaction(async (tx) => {
    const repo = tx.getRepository(Teacher);
    const row = await repo.findOneOrFail({ where: { id } });
    const previousModifiedAt = row.modifiedAt;
    if (changes.name !== undefined) row.name = changes.name;
    if (changes.subjectId !== undefined) row.subjectId = changes.subjectId;
    if (changes.email !== undefined) row.email = changes.email;
    if (changes.contactNumber !== undefined) row.contactNumber = changes.contactNumber;
    const updated = await repo.save(row);
    return { teacher: updated, previousModifiedAt };
  });
}

export async function deleteTeacherById(id: string): Promise<boolean> {
  const ds = await getDataSource();
  const result = await ds.getRepository(Teacher).delete({ id });
  return (result.affected ?? 0) > 0;
}

export interface TeacherWithSubject {
  id: string;
  ulid: string;
  name: string;
  email: string;
  contactNumber: string;
  subject: { ulid: string; name: string };
}

// Raw query — fetches the joined subject's ulid+name in one round-trip;
// typeORM's find+relations path returns the full nested entity.
export async function listTeachers(): Promise<TeacherWithSubject[]> {
  const ds = await getDataSource();
  type RawRow = {
    t_id: string;
    t_ulid: string;
    t_name: string;
    t_email: string;
    t_contact_number: string;
    subjectUlid: string | null;
    subjectName: string | null;
  };
  const rows = await ds
    .createQueryBuilder()
    .select("t.id", "t_id")
    .addSelect("t.ulid", "t_ulid")
    .addSelect("t.name", "t_name")
    .addSelect("t.email", "t_email")
    .addSelect("t.contact_number", "t_contact_number")
    .addSelect("s.ulid", "subjectUlid")
    .addSelect("s.name", "subjectName")
    .from(Teacher, "t")
    .leftJoin(Subject, "s", "s.id = t.subjectId")
    .orderBy("t.email", "ASC")
    .getRawMany<RawRow>();

  return rows.map(({ t_id: id, t_ulid: ulid, t_name: name, t_email: email, t_contact_number: contactNumber, subjectUlid, subjectName }) => ({
    id,
    ulid,
    name,
    email,
    contactNumber,
    subject: { ulid: subjectUlid ?? "", name: subjectName ?? "" },
  }));
}
