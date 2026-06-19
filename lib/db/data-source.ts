import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "@/lib/config";
import { Teacher } from "./entities/Teacher";
import { Subject } from "./entities/Subject";
import { Class } from "./entities/Class";
import { Level } from "./entities/Level";

/**
 * typeORM DataSource singleton. **No migration set in Stage 1** (per
 * `specs/003-backend-api-db/spec.md` FR-016, Session 2026-06-21): the
 * MySQL schema, audit columns, `ulid CHAR(26) UNIQUE NOT NULL` column,
 * FK constraints, UNIQUE indexes, and the `subjects` / `levels`
 * reference-list seed data are all created by the user against the
 * user-prepared MySQL container (mirrored in
 * `docker/mysql/init/01-schema-and-seed.sql`).
 *
 * The application is **read/write at runtime only** — `docker compose up`
 * brings up the app container, which connects to the existing MySQL.
 * No `migration:run` step runs on boot; the `lib/db/migrations/`
 * directory is out of Stage 1 scope.
 */
export const dataSourceOptions = {
  type: "mysql" as const,
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.password,
  database: config.db.name,
  entities: [Teacher, Subject, Class, Level],
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
