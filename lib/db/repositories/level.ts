import { getDataSource } from "@/lib/db/data-source";
import { Level } from "@/lib/db/entities/Level";

/** Read-only helpers for the `levels` reference list. */
export async function listActiveLevels(): Promise<Level[]> {
  const ds = await getDataSource();
  return ds.getRepository(Level).find({
    where: { active: true },
    order: { name: "ASC" },
  });
}

export async function getActiveLevelNames(): Promise<string[]> {
  const levels = await listActiveLevels();
  return levels.map((l) => l.name);
}

/**
 * Resolve the natural-key `level` (levels.name) to the surrogate
 * `levels.id` required by the `classes.level_id` FK column (per FR-019).
 * Returns `null` when the level is not found so the caller can return
 * `400 Bad Request` from the route handler.
 */
export async function findLevelIdByName(name: string): Promise<string | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Level).findOne({
    where: { name, active: true },
    select: { id: true },
  });
  return row?.id ?? null;
}