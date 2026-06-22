import { getDataSource } from "@/lib/db/data-source";
import { Subject } from "@/lib/db/entities/Subject";

export async function listActiveSubjects(): Promise<Subject[]> {
  const ds = await getDataSource();
  return ds.getRepository(Subject).find({
    where: { active: true },
    order: { name: "ASC" },
  });
}
