import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from "typeorm";
import { Teacher } from "./Teacher";
import { Level } from "./Level";
import { generateUlid } from "@/lib/ulid";

/**
 * Class entity. Per FR-018 every persisted table carries a surrogate
 * `id BIGINT UNSIGNED AUTO_INCREMENT` primary key plus the six audit
 * columns. The natural-key `name` is preserved as `UNIQUE NOT NULL` per
 * FR-005c; `form_teacher_id` carries `UNIQUE` per FR-008 ("at most one
 * class per teacher").
 *
 * The Stage 1 API surface exposes natural keys (`level`, `name`,
 * `formTeacher: { name }`) plus the cross-cutting `ulid` row handle
 * (per FR-021) — the surrogate `id` and audit columns are hidden per
 * FR-020.
 *
 * Per FR-019, foreign keys reference the surrogate `id` of the target
 * table. The wire fields `level` (level name) and `teacherEmail` are
 * resolved to `level_id` (FK → `levels.id`) and `form_teacher_id` (FK
 * → `teachers.id`) by the route handler before insert.
 */
@Entity({ name: "classes" })
@Index("uq_classes_name", ["name"], { unique: true })
@Index("uq_classes_form_teacher", ["formTeacherId"], { unique: true })
@Index("uq_classes_ulid", ["ulid"], { unique: true })
@Index("idx_classes_level_id", ["levelId"])
export class Class {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id!: string;

  /**
   * FK → `levels.id` per FR-019. Not exposed in the API response.
   */
  @Column({ name: "level_id", type: "bigint", unsigned: true })
  levelId!: string;

  @Column({ type: "varchar", length: 255, unique: true })
  name!: string;

  /**
   * FK → `teachers.id` per FR-019. `UNIQUE` enforces the
   * "at most one class per teacher" invariant (FR-008). Not exposed in
   * the API response.
   */
  @Column({ name: "form_teacher_id", type: "bigint", unsigned: true })
  formTeacherId!: string;

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

  @ManyToOne(() => Level, { eager: false })
  @JoinColumn({ name: "level_id", referencedColumnName: "id" })
  levelRef?: Level;

  @ManyToOne(() => Teacher, { eager: false })
  @JoinColumn({ name: "form_teacher_id", referencedColumnName: "id" })
  formTeacher?: Teacher;

  @BeforeInsert()
  assignUlid(): void {
    if (!this.ulid) this.ulid = generateUlid();
  }
}