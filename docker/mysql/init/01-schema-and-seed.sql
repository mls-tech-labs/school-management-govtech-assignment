-- =============================================================================
-- 01-schema-and-seed.sql
--
-- Idempotent bootstrap script for the Private Education Admin project.
-- Auto-runs on first `docker compose up` (the official mysql image executes every
-- .sql file in /docker-entrypoint-initdb.d alphabetically on a fresh data dir).
--
-- Per `specs/003-backend-api-db/spec.md` FR-016 (Session 2026-06-21), this SQL
-- file IS the canonical source of truth for the Stage 1 schema. The user prepares
-- MySQL manually — there is no typeORM migration set, no `migration:run` script,
-- no `migration` one-shot service in `docker-compose.yml`, and the application
-- is read/write at runtime only.
--
-- Tables (4 total) — see `lib/db/entities/*.ts` for the typeORM mapping:
--   1. subjects   — reference list (read-only in Stage 1)             [001-teachers]
--   2. teachers   — id (PK), name, subject_id (FK→subjects.id), email UNIQUE,
--                    contact_number, ulid CHAR(26) UNIQUE              [001-teachers]
--   3. levels     — reference list (read-only in Stage 1)             [002-classes]
--   4. classes    — id (PK), level_id (FK→levels.id), name UNIQUE,
--                    form_teacher_id (FK→teachers.id, UNIQUE), ulid    [002-classes]
--
-- Audit columns (per FR-018 — Session 2026-06-19):
--   Every table carries the same six audit columns plus the cross-cutting ULID
--   row handle (per FR-021, Session 2026-06-20):
--     id            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT  (PRIMARY KEY)
--     created_at    DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
--     created_by    VARCHAR(64)      NOT NULL DEFAULT 'system'
--     modified_at   DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
--                                          ON UPDATE CURRENT_TIMESTAMP(6)
--     modified_by   VARCHAR(64)      NOT NULL DEFAULT 'system'
--     version       INT              NOT NULL DEFAULT 1
--     ulid          CHAR(26)         NOT NULL  (UNIQUE per FR-021)
--   `id` is the canonical PK on every table. The natural keys
--   (subjects.name, teachers.email, levels.name, classes.name) are preserved as
--   UNIQUE NOT NULL so the Stage 1 public API can keep surfacing them (FR-020).
--
-- Integrity rules enforced at the DB layer (per FR-006..FR-009a, FR-018, FR-019,
-- FR-021):
--   * PRIMARY KEY (subjects.id)  — surrogate PK per FR-018
--   * PRIMARY KEY (teachers.id)  — surrogate PK per FR-018
--   * PRIMARY KEY (levels.id)    — surrogate PK per FR-018
--   * PRIMARY KEY (classes.id)   — surrogate PK per FR-018
--   * UNIQUE(subjects.name), UNIQUE(teachers.email), UNIQUE(levels.name)
--   * UNIQUE(classes.name)                                   — global, not composite
--   * UNIQUE(classes.form_teacher_id)                        — "at most one class per teacher"
--   * UNIQUE(<table>.ulid) for all four tables               — cross-cutting row handle
--   * FK(teachers.subject_id)          REFERENCES subjects(id)         ON UPDATE CASCADE ON DELETE RESTRICT
--   * FK(classes.level_id)             REFERENCES levels(id)           ON UPDATE CASCADE ON DELETE RESTRICT
--   * FK(classes.form_teacher_id)      REFERENCES teachers(id)         ON UPDATE CASCADE ON DELETE RESTRICT
--
-- All DDL uses IF NOT EXISTS and all DML uses INSERT IGNORE so the script is safe
-- to re-run against a populated database (idempotency contract — FR-016).
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `edu_inst`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE `edu_inst`;

-- -----------------------------------------------------------------------------
-- 1. subjects  (reference list — seeded once; id is the surrogate PK, name is UNIQUE NOT NULL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subjects` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(64)     NOT NULL,
  `active`      BOOLEAN         NOT NULL DEFAULT TRUE,
  `created_at`  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `created_by`  VARCHAR(64)     NOT NULL DEFAULT 'system',
  `modified_at` DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `modified_by` VARCHAR(64)     NOT NULL DEFAULT 'system',
  `version`     INT             NOT NULL DEFAULT 1,
  `ulid`        CHAR(26)        NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subjects_name` (`name`),
  UNIQUE KEY `uq_subjects_ulid` (`ulid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `subjects` (`id`, `name`, `active`, `ulid`) VALUES
  (1, 'English',            TRUE, '01H000000000000000000000A1'),
  (2, 'Mathematics',        TRUE, '01H000000000000000000000A2'),
  (3, 'Science',            TRUE, '01H000000000000000000000A3'),
  (4, 'Chinese',            TRUE, '01H000000000000000000000A4'),
  (5, 'Malay',              TRUE, '01H000000000000000000000A5'),
  (6, 'Tamil',              TRUE, '01H000000000000000000000A6'),
  (7, 'Art',                TRUE, '01H000000000000000000000A7'),
  (8, 'Music',              TRUE, '01H000000000000000000000A8'),
  (9, 'Physical Education', TRUE, '01H000000000000000000000A9');

-- -----------------------------------------------------------------------------
-- 2. teachers  (PK = id surrogate; FK subject_id → subjects.id ; UNIQUE email as natural key)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `teachers` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(255)    NOT NULL,
  `subject_id`     BIGINT UNSIGNED NOT NULL,
  `email`          VARCHAR(254)    NOT NULL,
  `contact_number` CHAR(8)         NOT NULL,
  `created_at`     DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `created_by`     VARCHAR(64)     NOT NULL DEFAULT 'system',
  `modified_at`    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `modified_by`    VARCHAR(64)     NOT NULL DEFAULT 'system',
  `version`        INT             NOT NULL DEFAULT 1,
  `ulid`           CHAR(26)        NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_teachers_email`    (`email`),
  UNIQUE KEY `uq_teachers_ulid`     (`ulid`),
  KEY `idx_teachers_subject_id` (`subject_id`),
  CONSTRAINT `fk_teachers_subject`
    FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- 3. levels  (reference list — seeded once; id is the surrogate PK, name is UNIQUE NOT NULL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `levels` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(64)     NOT NULL,
  `active`      BOOLEAN         NOT NULL DEFAULT TRUE,
  `created_at`  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `created_by`  VARCHAR(64)     NOT NULL DEFAULT 'system',
  `modified_at` DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `modified_by` VARCHAR(64)     NOT NULL DEFAULT 'system',
  `version`     INT             NOT NULL DEFAULT 1,
  `ulid`        CHAR(26)        NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_levels_name` (`name`),
  UNIQUE KEY `uq_levels_ulid` (`ulid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `levels` (`id`, `name`, `active`, `ulid`) VALUES
  (1,  'Primary 1',   TRUE, '01H000000000000000000000B1'),
  (2,  'Primary 2',   TRUE, '01H000000000000000000000B2'),
  (3,  'Primary 3',   TRUE, '01H000000000000000000000B3'),
  (4,  'Primary 4',   TRUE, '01H000000000000000000000B4'),
  (5,  'Primary 5',   TRUE, '01H000000000000000000000B5'),
  (6,  'Primary 6',   TRUE, '01H000000000000000000000B6'),
  (7,  'Secondary 1', TRUE, '01H000000000000000000000B7'),
  (8,  'Secondary 2', TRUE, '01H000000000000000000000B8'),
  (9,  'Secondary 3', TRUE, '01H000000000000000000000B9'),
  (10, 'Secondary 4', TRUE, '01H000000000000000000000BA');

-- -----------------------------------------------------------------------------
-- 4. classes  (PK = id surrogate; FKs to levels + teachers via id; UNIQUE name and form_teacher_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `classes` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `level_id`         BIGINT UNSIGNED NOT NULL,
  `name`             VARCHAR(255)    NOT NULL,
  `form_teacher_id`  BIGINT UNSIGNED NOT NULL,
  `created_at`       DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `created_by`       VARCHAR(64)     NOT NULL DEFAULT 'system',
  `modified_at`      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `modified_by`      VARCHAR(64)     NOT NULL DEFAULT 'system',
  `version`          INT             NOT NULL DEFAULT 1,
  `ulid`             CHAR(26)        NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_classes_name`         (`name`),
  UNIQUE KEY `uq_classes_form_teacher` (`form_teacher_id`),
  UNIQUE KEY `uq_classes_ulid`         (`ulid`),
  KEY `idx_classes_level_id` (`level_id`),
  CONSTRAINT `fk_classes_level`
    FOREIGN KEY (`level_id`) REFERENCES `levels` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_classes_form_teacher`
    FOREIGN KEY (`form_teacher_id`) REFERENCES `teachers` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================================
-- 5. SECURITY & USER PRIVILEGES (Automated Setup)
-- =============================================================================

-- Ensure the 'admin' user account exists with a wildcard network host assignment
CREATE USER IF NOT EXISTS 'admin'@'%' IDENTIFIED BY 'rootpass';

-- Hand the 'admin' user full keys to read/write inside the edu_inst room
GRANT ALL PRIVILEGES ON `edu_inst`.* TO 'admin'@'%';

-- Flush the privilege tables to force MySQL to reload the keycard database instantly
FLUSH PRIVILEGES;

-- =============================================================================
-- Verification (informational — runs on every boot but produces no side effects)
-- =============================================================================
SELECT 'subjects' AS table_name, COUNT(*) AS rows_seeded FROM subjects
UNION ALL SELECT 'levels',   COUNT(*) FROM levels
UNION ALL SELECT 'teachers', COUNT(*) FROM teachers
UNION ALL SELECT 'classes',  COUNT(*) FROM classes;