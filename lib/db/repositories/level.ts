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

/**
 * Resolve the nested `level.ulid` (per `003-backend-api-db/spec.md`
 * Clarifications, Session 2026-06-20 — POST/GET reference object
 * shape) to the surrogate `levels.id` required by the
 * `classes.level_id` FK column (per FR-019). Returns `null` when
 * the level is not found or is inactive so the caller can return
 * `400 Bad Request` + `{ "error": "Invalid level" }` from the
 * route handler. The lookup hits `uq_levels_ulid`.
 */
export async function findLevelIdByUlid(ulid: string): Promise<string | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Level).findOne({
    where: { ulid, active: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Resolve the nested `level.ulid` to the surrogate `levels.id` AND
 * the authoritative `levels.name` (so the GET response can echo the
 * row's authoritative `name`, not the client-supplied display hint —
 * per Clarifications, Session 2026-06-20).
 */
export async function findLevelByUlid(
  ulid: string,
): Promise<{ id: string; name: string } | null> {
  const ds = await getDataSource();
  const row = await ds.getRepository(Level).findOne({
    where: { ulid, active: true },
    select: { id: true, name: true },
  });
  return row ? { id: row.id, name: row.name } : null;
}
