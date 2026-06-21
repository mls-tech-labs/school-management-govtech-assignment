import { getDataSource } from "@/lib/db/data-source";
import { User } from "@/lib/db/entities/User";

/**
 * Find a user by `username`. Returns the full entity (including the
 * argon2id envelope `password` field and the standalone base64
 * `salt` field) so the login handler can verify credentials in a
 * single round-trip.
 *
 * The two credential columns are returned separately:
 *   - `password` — the argon2id envelope (used by `argon2.verify`)
 *   - `salt`     — the standalone base64 nonce (audit-only; the
 *                  verify path reads the salt from the envelope)
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  if (!username) return null;
  const ds = await getDataSource();
  return ds.getRepository(User).findOne({ where: { username } });
}

/**
 * Find a user by surrogate `id` (used by `GET /api/v1.0/me`).
 * Returns only the fields the `/me` response surfaces
 * (per spec FR-009 — exactly `{ username, active, ulid, createdAt }`).
 */
export async function findUserById(
  id: number,
): Promise<Pick<User, "username" | "active" | "ulid" | "createdAt"> | null> {
  if (!id) return null;
  const ds = await getDataSource();
  return ds.getRepository(User).findOne({
    where: { id: String(id) as unknown as never },
    select: { username: true, active: true, ulid: true, createdAt: true },
  });
}
