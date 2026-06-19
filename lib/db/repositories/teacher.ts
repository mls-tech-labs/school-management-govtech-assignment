import { getDataSource } from "@/lib/db/data-source";
import { Teacher } from "@/lib/db/entities/Teacher";
import { Subject } from "@/lib/db/entities/Subject";

export interface CreateTeacherInput {
  name: string;
  subject: string; // natural-key: subjects.name, resolved to subjects.id by the route handler
  email: string;
  contactNumber: string;
}

/**
 * Resolve the natural-key `subject` (subjects.name) to the surrogate
 * `subjects.id` required by the `teachers.subject_id` FK column
 * (per FR-019). Returns `null` when the subject is not found so the
 * caller can return `400 Bad Request` from the route handler.
 */
export async function findSubjectIdByName(name: string): Promise<string | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Subject).findOne({
    where: { name, active: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Create a new teacher. The wire field `subject` must already be
 * resolved to a `subjectId` (FK to `subjects.id`) by the caller.
 * The DB `UNIQUE(teachers.email)` constraint is the race-safe source
 * of truth for duplicate-email detection — the typeORM
 * `QueryFailedError` thrown here is mapped to `409` by
 * `lib/api/db-error.toApiError()` in the route handler.
 */
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

export async function findTeacherByEmail(email: string): Promise<Teacher | null> {
  const ds = await getDataSource();
  return ds.getRepository(Teacher).findOne({ where: { email } });
}

export async function findTeacherIdByEmail(email: string): Promise<string | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Teacher).findOne({
    where: { email },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function listTeachers(): Promise<Teacher[]> {
  const ds = await getDataSource();
  return ds.getRepository(Teacher).find({ order: { email: "ASC" } });
}