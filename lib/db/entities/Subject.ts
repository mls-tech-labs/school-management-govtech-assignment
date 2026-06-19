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
 * Reference-list entity for `subjects`. The Stage 1 seed list lives in
 * `docker/mysql/init/01-schema-and-seed.sql`. The Joi schema for the
 * Add Teacher form's `subject` field is generated at request time from
 * `SELECT name FROM subjects WHERE active = TRUE`.
 *
 * Per `specs/003-backend-api-db/spec.md` FR-018, every persisted table
 * carries a surrogate `id BIGINT UNSIGNED AUTO_INCREMENT` primary key
 * plus the six audit columns (`created_at`, `created_by`, `modified_at`,
 * `modified_by`, `version`). The natural-key `name` is preserved as
 * `UNIQUE NOT NULL`.
 *
 * Per FR-021 (Session 2026-06-20), every persisted table also carries a
 * `ulid CHAR(26) UNIQUE NOT NULL` cross-cutting row handle, generated
 * server-side by `lib/ulid.ts` in the `@BeforeInsert` hook below.
 */
@Entity({ name: "subjects" })
@Index("uq_subjects_name", ["name"], { unique: true })
@Index("uq_subjects_ulid", ["ulid"], { unique: true })
export class Subject {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id!: string; // typeORM returns BIGINT as string by default

  @Column({ type: "varchar", length: 64, unique: true })
  name!: string;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt!: Date;

  @Column({ name: "created_by", type: "varchar", length: 64, default: "system" })
  createdBy!: string;

  @UpdateDateColumn({ name: "modified_at", type: "datetime", precision: 6 })
  modifiedAt!: Date;

  @Column({ name: "modified_by", type: "varchar", length: 64, default: "system" })
  modifiedBy!: string;

  @VersionColumn({ name: "version", type: "int", default: 1 })
  version!: number;

  @Column({ name: "ulid", type: "char", length: 26, unique: true })
  ulid!: string;

  @BeforeInsert()
  assignUlid(): void {
    if (!this.ulid) this.ulid = generateUlid();
  }
}