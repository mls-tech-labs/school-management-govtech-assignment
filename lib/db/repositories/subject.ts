import { getDataSource } from "@/lib/db/data-source";
import { Subject } from "@/lib/db/entities/Subject";

/**
 * Read-only helpers for the `subjects` reference list.
 * Mirrors `Subject` entity columns field-for-field per Principle VII.
 */
export async function listActiveSubjects(): Promise<Subject[]> {
  const ds = await getDataSource();
  return ds.getRepository(Subject).find({
    where: { active: true },
    order: { name: "ASC" },
  });
}

export async function getActiveSubjectNames(): Promise<string[]> {
  const subjects = await listActiveSubjects();
  return subjects.map((s) => s.name);
}
