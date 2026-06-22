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

  // argon2id envelope. The salt inside is the per-user nonce that
  // defeats rainbow-table attacks; the standalone `salt` column is
  // stored separately for auditability.
  @Column({ type: "varchar", length: 255 })
  password!: string;

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
