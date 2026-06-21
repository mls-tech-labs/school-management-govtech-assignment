import { getDataSource } from "@/lib/db/data-source";
import { Subject } from "@/lib/db/entities/Subject";

/**
 * Read-only helpers for the `subjects` reference list.
 *
 * Per `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
 * (POST/GET reference object shape), the lookup key on the wire is
 * `subject.ulid` (a 26-char Crockford Base32 string resolved against
 * `uq_subjects_ulid`), NOT the natural-key `subjects.name`. The list
 * endpoint returns the full subject rows so the frontend can render
 * the `name` next to the `ulid` in the dropdown and round-trip it
 * back to the server.
 */
export async function listActiveSubjects(): Promise<Subject[]> {
  const ds = await getDataSource();
  return ds.getRepository(Subject).find({
    where: { active: true },
    order: { name: "ASC" },
  });
}
