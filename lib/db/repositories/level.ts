import { getDataSource } from "@/lib/db/data-source";
import { Level } from "@/lib/db/entities/Level";

export async function listActiveLevels(): Promise<Level[]> {
  const ds = await getDataSource();
  return ds.getRepository(Level).find({
    where: { active: true },
    order: { name: "ASC" },
  });
}

export async function findLevelIdByUlid(ulid: string): Promise<string | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Level).findOne({
    where: { ulid, active: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function findLevelByUlid(
  ulid: string,
): Promise<{ id: string; ulid: string; name: string } | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Level).findOne({
    where: { ulid, active: true },
    select: { id: true, ulid: true, name: true },
  });
  return row ? { id: row.id, ulid: row.ulid, name: row.name } : null;
}

export async function findLevelById(
  id: string,
): Promise<{ id: string; ulid: string; name: string } | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Level).findOne({
    where: { id },
    select: { id: true, ulid: true, name: true },
  });
  return row ? { id: row.id, ulid: row.ulid, name: row.name } : null;
}
