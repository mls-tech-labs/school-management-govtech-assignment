-- =============================================================================
-- 01-schema-and-seed.sql
--
-- Idempotent bootstrap script for the Private Education Admin project.
-- Auto-runs on first `docker compose up` (the official mysql image executes every
-- .sql file in /docker-entrypoint-initdb.d alphabetically on a fresh data dir).
--
-- Tables (4 total) — see specs/001-teachers/data-model.md, specs/002-classes/data-model.md,
-- and specs/003-backend-api-db/spec.md:
--   1. subjects    — reference list (read-only in Stage 1)        [001-teachers]
--   2. teachers    — name, subject(FK), email(UNIQUE), contact   [001-teachers]
--   3. levels      — reference list (read-only in Stage 1)        [002-classes]
--   4. classes     — id, level(FK), name(UNIQUE), form_teacher_email(UNIQUE FK→teachers.email)
--                                                                  [002-classes]
--
-- Integrity rules enforced at the DB layer (per FR-006..FR-009a):
--   * UNIQUE(teachers.email)
--   * UNIQUE(classes.name)                                  — global, not composite
--   * UNIQUE(classes.form_teacher_email)                    — "at most one class per teacher"
--   * FK(teachers.subject)           REFERENCES subjects(name)
--   * FK(classes.level)              REFERENCES levels(name)
--   * FK(classes.form_teacher_email) REFERENCES teachers(email)
--
-- All DDL uses IF NOT EXISTS and all DML uses INSERT IGNORE so the script is safe
-- to re-run against a populated database (idempotency contract — FR-016, FR-017).
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `edu_inst`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE `edu_inst`;

-- -----------------------------------------------------------------------------
-- 1. subjects  (reference list — seeded once)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subjects` (
  `name`   VARCHAR(64)  NOT NULL,
  `active` BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `subjects` (`name`, `active`) VALUES
  ('English',           TRUE),
  ('Mathematics',       TRUE),
  ('Science',           TRUE),
  ('Chinese',           TRUE),
  ('Malay',             TRUE),
  ('Tamil',             TRUE),
  ('Art',               TRUE),
  ('Music',             TRUE),
  ('Physical Education',TRUE);

-- -----------------------------------------------------------------------------
-- 2. teachers  (FK subject → subjects.name ; UNIQUE email)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `teachers` (
  `name`           VARCHAR(255) NOT NULL,
  `subject`        VARCHAR(64)  NOT NULL,
  `email`          VARCHAR(254) NOT NULL,
  `contact_number` CHAR(8)      NOT NULL,
  PRIMARY KEY (`email`),
  UNIQUE KEY `uq_teachers_email` (`email`),
  KEY `idx_teachers_subject` (`subject`),
  CONSTRAINT `fk_teachers_subject`
    FOREIGN KEY (`subject`) REFERENCES `subjects` (`name`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- 3. levels  (reference list — seeded once)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `levels` (
  `name`   VARCHAR(64)  NOT NULL,
  `active` BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `levels` (`name`, `active`) VALUES
  ('Primary 1',   TRUE),
  ('Primary 2',   TRUE),
  ('Primary 3',   TRUE),
  ('Primary 4',   TRUE),
  ('Primary 5',   TRUE),
  ('Primary 6',   TRUE),
  ('Secondary 1', TRUE),
  ('Secondary 2', TRUE),
  ('Secondary 3', TRUE),
  ('Secondary 4', TRUE);

-- -----------------------------------------------------------------------------
-- 4. classes  (FKs to levels + teachers; UNIQUE name and form_teacher_email)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `classes` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `level`              VARCHAR(64)     NOT NULL,
  `name`               VARCHAR(255)    NOT NULL,
  `form_teacher_email` VARCHAR(254)    NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_classes_name`          (`name`),
  UNIQUE KEY `uq_classes_form_teacher`  (`form_teacher_email`),
  KEY `idx_classes_level` (`level`),
  CONSTRAINT `fk_classes_level`
    FOREIGN KEY (`level`) REFERENCES `levels` (`name`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_classes_form_teacher`
    FOREIGN KEY (`form_teacher_email`) REFERENCES `teachers` (`email`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================================
-- Verification (informational — runs on every boot but produces no side effects)
-- =============================================================================
SELECT 'subjects' AS table_name, COUNT(*) AS rows_seeded FROM subjects
UNION ALL SELECT 'levels',   COUNT(*) FROM levels
UNION ALL SELECT 'teachers', COUNT(*) FROM teachers
UNION ALL SELECT 'classes',  COUNT(*) FROM classes;