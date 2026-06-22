import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "@/lib/config";
import { Teacher } from "./entities/Teacher";
import { Subject } from "./entities/Subject";
import { Class } from "./entities/Class";
import { Level } from "./entities/Level";
import { User } from "./entities/User";

// No `migrations` — the schema is user-prepared (see docker/mysql/init).
export const dataSourceOptions = {
  type: "mysql" as const,
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.password,
  database: config.db.name,
  entities: [Teacher, Subject, Class, Level, User],
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
