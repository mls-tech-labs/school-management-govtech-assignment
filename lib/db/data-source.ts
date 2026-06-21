import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "@/lib/config";
import { Teacher } from "./entities/Teacher";
import { Subject } from "./entities/Subject";
import { Class } from "./entities/Class";
import { Level } from "./entities/Level";
import { User } from "./entities/User";

/**
 * typeORM DataSource singleton. **No migration set in Stage 1 / 2**
 * (per `specs/003-backend-api-db/spec.md` FR-016 + the constitution
 * Stage Scope → Stage 2 Out of Scope migration section): the MySQL
 * schema, audit columns, `ulid CHAR(26) UNIQUE NOT NULL` column,
 * FK constraints, UNIQUE indexes, the `subjects` / `levels`
 * reference-list seed data, AND the `users` table are all created by
 * the user with their own SQL against the user-prepared MySQL
 * container (mirrored in `docker/mysql/init/01-schema-and-seed.sql`).
 *
 * The application is **read/write at runtime only** — `docker compose up`
 * brings up the app container, which connects to the existing MySQL.
 * No `migration:run` step runs on boot; the `lib/db/migrations/`
 * directory is out of Stage 1 / Stage 2 scope.
 */
export const dataSourceOptions = {
  type: "mysql" as const,
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.password,
  database: config.db.name,
  entities: [Teacher, Subject, Class, Level, User],
  // No `migrations` array — schema is user-prepared per FR-016.
  synchronize: false,
  migrationsRun: false,
  logging: false,
  charset: "utf8mb4",
};

let _ds: DataSource | null = null;

export function getDataSource(): Promise<DataSource> {
  if (_ds && _ds.isInitialized) return Promise.resolve(_ds);
  _ds = new DataSource(dataSourceOptions);
  return _ds.initialize();
}

export const AppDataSource = new DataSource(dataSourceOptions);
