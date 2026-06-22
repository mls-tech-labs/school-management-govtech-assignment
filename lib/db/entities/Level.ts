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

// Reference list seeded by the user-prepared MySQL container.
@Entity({ name: "levels" })
@Index("uq_levels_name", ["name"], { unique: true })
@Index("uq_levels_ulid", ["ulid"], { unique: true })
export class Level {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id!: string;

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
