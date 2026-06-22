import { getDataSource } from "@/lib/db/data-source";
import { User } from "@/lib/db/entities/User";

export async function findUserByUsername(username: string): Promise<User | null> {
  if (!username) return null;
  const ds = await getDataSource();
  return ds.getRepository(User).findOne({ where: { username } });
}

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
