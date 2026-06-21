import { getDataSource } from "@/lib/db/data-source";
import { Teacher } from "@/lib/db/entities/Teacher";
import { Subject } from "@/lib/db/entities/Subject";

/**
 * Resolve the nested `subject.ulid` (per `003-backend-api-db/spec.md`
 * Clarifications, Session 2026-06-20 — POST/GET reference object
 * shape) to the surrogate `subjects.id` required by the
 * `teachers.subject_id` FK column (per FR-019). Returns `null` when
 * the subject is not found or is inactive so the caller can return
 * `400 Bad Request` + `{ "error": "Invalid subject" }` from the
 * route handler. The lookup hits `uq_subjects_ulid`.
 */
export async function findSubjectIdByUlid(ulid: string): Promise<string | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Subject).findOne({
    where: { ulid, active: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Resolve the nested `subject.ulid` to the surrogate `subjects.id`
 * AND the authoritative `subjects.name` (so the GET response can
 * echo the row's authoritative `name`, not the client-supplied
 * display hint — per Clarifications, Session 2026-06-20).
 */
export async function findSubjectByUlid(
  ulid: string,
): Promise<{ id: string; name: string } | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Subject).findOne({
    where: { ulid, active: true },
    select: { id: true, name: true },
  });
  return row ? { id: row.id, name: row.name } : null;
}

/**
 * Create a new teacher. The wire field `subject` has already been
 * resolved to `subjectId` (FK to `subjects.id`) by the caller via
 * `findSubjectIdByUlid` (per FR-019). The DB `UNIQUE(teachers.email)`
 * constraint is the race-safe source of truth for duplicate-email
 * detection — the typeORM `QueryFailedError` thrown here is mapped
 * to `409` by `lib/api/db-error.toApiError()` in the route handler.
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

/**
 * Resolve the nested `formTeacher.ulid` (per Clarifications, Session
 * 2026-06-20) to the `teachers` row (matched against
 * `uq_teachers_ulid`). Used by the classes POST handler to distinguish
 * `404 "Teacher not found"` from `409 "Teacher already assigned"`
 * (the FK + UNIQUE index in MySQL fire the latter for the form-teacher
 * race; this lookup is the pre-INSERT existence check).
 */
export async function findTeacherByUlid(ulid: string): Promise<Teacher | null> {
  const ds = await getDataSource();
  return ds.getRepository(Teacher).findOne({ where: { ulid } });
}

/**
 * Wire shape of a teacher entry returned by
 * `GET /api/v1.0/teachers` (per
 * `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
 * — POST/GET reference object shape). `subject` is a nested
 * `{ ulid, name }` object; `name` echoes the authoritative row name.
 *
 * The route handler converts to the final wire shape (which does
 * NOT include `id` / audit columns per FR-020).
 */
export interface TeacherWithSubject {
  id: string;
  ulid: string;
  name: string;
  email: string;
  contactNumber: string;
  subject: { ulid: string; name: string };
}

/**
 * List all teachers joined with the referenced subject row. The GET
 * response shape carries `subject: { ulid, name }` (per Clarifications,
 * Session 2026-06-20), so we fetch the subject's `ulid` and `name`
 * alongside the teacher columns. The JOIN is on the surrogate `id`
 * (per FR-019).
 */
export async function listTeachers(): Promise<TeacherWithSubject[]> {
  const ds = await getDataSource();
  // Use a raw query so we can fetch the joined subject's `ulid` +
  // `name` in a single round-trip; typeORM's find+relations path
  // returns the full nested Subject entity which is heavier than the
  // wire shape needs.
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

  return rows.map((r) => ({
    id: r.t_id,
    ulid: r.t_ulid,
    name: r.t_name,
    email: r.t_email,
    contactNumber: r.t_contact_number,
    subject: {
      ulid: r.subjectUlid ?? "",
      name: r.subjectName ?? "",
    },
  }));
}
