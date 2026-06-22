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
import { Subject } from "./Subject";
import { generateUlid } from "@/lib/ulid";

@Entity({ name: "teachers" })
@Index("uq_teachers_email", ["email"], { unique: true })
@Index("uq_teachers_ulid", ["ulid"], { unique: true })
@Index("idx_teachers_subject_id", ["subjectId"])
export class Teacher {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  // FK → subjects.id. The route handler resolves `subject.ulid` here.
  @Column({ name: "subject_id", type: "bigint", unsigned: true })
  subjectId!: string;

  @Column({ type: "varchar", length: 254, unique: true })
  email!: string;

  @Column({ name: "contact_number", type: "char", length: 8 })
  contactNumber!: string;

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

  @ManyToOne(() => Subject, { eager: false })
  @JoinColumn({ name: "subject_id", referencedColumnName: "id" })
  subjectRef?: Subject;

  @BeforeInsert()
  assignUlid(): void {
    if (!this.ulid) this.ulid = generateUlid();
  }
}
