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
 * AND the authoritative `subjects.ulid` + `subjects.name` (so the GET
 * response can echo the row's authoritative `name` and `ulid`, not
 * the client-supplied display hint — per Clarifications, Session
 * 2026-06-20).
 */
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

/**
 * Resolve a `subjects.id` (surrogate PK) to the row's `ulid` and
 * `name`. Used by the class GET-by-ulid route to surface the
 * authoritative level row.
 */
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
 *
 * Also used by the Stage 3 `GET /api/v1.0/teachers/[ulid]` route
 * handler, the Edit Teacher RSC page, and the PUT/DELETE handlers'
 * pre-write lookups (per `006-teachers-classes-mutations/spec.md`
 * FR-002 / FR-007 / FR-009). Returns the full Teacher entity so
 * callers can pick which columns they need.
 */
export async function findTeacherByUlid(ulid: string): Promise<Teacher | null> {
  const ds = await getDataSource();
  return ds.getRepository(Teacher).findOne({ where: { ulid } });
}

/**
 * Resolve a `teachers.id` (surrogate PK) to the row's `ulid` and
 * `name`. Used by the Stage 3 `GET /api/v1.0/classes/[ulid]` route
 * handler to surface the authoritative form-teacher row — the join
 * key is the surrogate `id` (per FR-019), not the ulid.
 */
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

/**
 * Update a teacher and capture the pre-update `modified_at` value.
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

/**
 * Hard-delete a teacher by surrogate `id`. Returns `true` when a row
 * was deleted; `false` when no row matched (used by the DELETE
 * handler's idempotent 404 path per Principle X.2).
 */
export async function deleteTeacherById(id: string): Promise<boolean> {
  const ds = await getDataSource();
  const result = await ds.getRepository(Teacher).delete({ id });
  return (result.affected ?? 0) > 0;
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
