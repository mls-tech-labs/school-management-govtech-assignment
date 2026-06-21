import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from "typeorm";
import { generateUlid } from "@/lib/ulid";

/**
 * `users` entity — the only persisted table owned by 004-user-auth.
 *
 * Columns per `specs/004-user-auth/data-model.md` §2.1:
 *   - `id`            — surrogate `BIGINT UNSIGNED AUTO_INCREMENT` PK (FR-019)
 *   - `ulid`          — `CHAR(26) UNIQUE NOT NULL` row handle (FR-021);
 *                       generated server-side via the `ulid` npm package
 *                       in `@BeforeInsert()`. Clients never set this.
 *   - `username`      — `VARCHAR(64) UNIQUE NOT NULL`. The login key.
 *   - `password`      — `VARCHAR(255) NOT NULL`. The full argon2id
 *                       envelope (e.g. `$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>`).
 *                       Distinct from `salt` — see below.
 *   - `salt`          — `VARCHAR(255) NOT NULL`. The raw base64-encoded
 *                       salt. Stored separately from the password for
 *                       auditability and future rotation flows. NEVER
 *                       equal to the password column — they are two
 *                       independent fields with two independent purposes
 *                       (the password is the secret, the salt is the
 *                       per-user nonce that defeats rainbow tables).
 *   - `active`        — `BOOLEAN DEFAULT TRUE`. When false, the login
 *                       handler rejects with `401` (spec FR-006).
 *   - `created_at`    — audit column (FR-018)
 *   - `created_by`    — audit column (FR-018). For SQL-seeded rows,
 *                       this is set to `'admin'` (per the cross-cutting
 *                       rule).
 *   - `modified_at`   — audit column (FR-018)
 *   - `modified_by`   — audit column (FR-018)
 *   - `version`       — audit column (FR-018) — typeORM's `VersionColumn`
 *
 * Indexes (per data-model.md §2.4):
 *   - `uq_users_username` UNIQUE on `username`
 *   - `uq_users_ulid` UNIQUE on `ulid`
 *   - `idx_users_active` on `active` (helps login-by-username path
 *     with the `active=true` filter)
 *
 * Audit columns are HIDDEN from the API response per FR-020. The
 * `/api/v1.0/me` endpoint exposes only `{ username, active, ulid, createdAt }`.
 */
@Entity({ name: "users" })
@Index("uq_users_username", ["username"], { unique: true })
@Index("uq_users_ulid", ["ulid"], { unique: true })
@Index("idx_users_active", ["active"])
export class User {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id!: string;

  @Column({ type: "char", length: 26, unique: true })
  ulid!: string;

  @Column({ type: "varchar", length: 64, unique: true })
  username!: string;

  /**
   * argon2id envelope. Distinct from `salt`: the envelope embeds the
   * parameters, salt, and hash into a single self-describing string
   * so a future parameter migration can detect the version via the
   * `$argon2id$v=19$...` prefix.
   */
  @Column({ type: "varchar", length: 255 })
  password!: string;

  /**
   * Raw salt as base64. Distinct from `password` — they are
   * independent fields with independent meanings. NEVER derived
   * from the password and NEVER equal to the password.
   */
  @Column({ type: "varchar", length: 255 })
  salt!: string;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt!: Date;

  @Column({ name: "created_by", type: "varchar", length: 64, default: "admin" })
  createdBy!: string;

  @UpdateDateColumn({ name: "modified_at", type: "datetime", precision: 6 })
  modifiedAt!: Date;

  @Column({ name: "modified_by", type: "varchar", length: 64, default: "admin" })
  modifiedBy!: string;

  @VersionColumn({ name: "version", type: "int", default: 1 })
  version!: number;

  @BeforeInsert()
  assignUlid(): void {
    if (!this.ulid) this.ulid = generateUlid();
  }
}
