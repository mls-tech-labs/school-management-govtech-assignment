# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`pvt-edu-admin-project` is a private-education administration project used as interview-prep learning material. The repository currently contains only the Spec Kit scaffolding — no application source code exists yet. Features are planned, specced, and implemented through the Spec-Driven Development (SDD) cycle.

## Spec Kit workflow (single source of truth)

The entire development process is driven by Spec Kit `0.11.1.dev0` with the `claude` integration and the bundled `speckit` workflow (`specify → plan → tasks → implement`, with review gates between each step). The relevant commands are exposed as Claude Code skills:

| Skill | Purpose |
|---|---|
| `/speckit-specify` | Create/update the feature spec from a natural-language description |
| `/speckit-clarify` | Ask up to 5 targeted clarification questions and write answers back into the spec |
| `/speckit-plan` | Generate `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/` from the spec |
| `/speckit-tasks` | Produce the dependency-ordered `tasks.md` |
| `/speckit-checklist` | Build a custom quality checklist for the feature |
| `/speckit-analyze` | Cross-artifact consistency check across `spec.md`, `plan.md`, `tasks.md` |
| `/speckit-constitution` | Create or amend the project constitution |
| `/speckit-implement` | Execute `tasks.md` |
| `/speckit-taskstoissues` | Convert tasks into GitHub issues |
| `/speckit-agent-context-update` | Refresh the managed Spec Kit section in this file |

When asked to design, scaffold, or implement a feature in this repo, run the SDD skills in order and stop at each gate for approval. Do not write source code directly — start with `/speckit-specify`.

### Key paths

- `.specify/` — Spec Kit state, templates, scripts, and memory
  - `.specify/memory/constitution.md` — project constitution (still on the template; run `/speckit-constitution` to fill it in)
  - `.specify/templates/` — spec, plan, tasks, checklist, constitution templates
  - `.specify/scripts/powershell/` — `create-new-feature.ps1`, `setup-plan.ps1`, `setup-tasks.ps1`, `check-prerequisites.ps1`, `common.ps1`
  - `.specify/extensions.yml` — installed extensions and hook configuration
- `.claude/skills/speckit-*` — the Claude Code skill definitions wired into the `claude` integration
- `.specify/integrations/{claude,speckit}.manifest.json` — integrity manifests for installed files
- `specs/[###-feature-name]/` — per-feature artifacts produced by the SDD cycle (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/`, `tasks.md`); directories are created by `create-new-feature.ps1` (or the `/speckit-*` skills)
- `.specify/feature.json` — the currently active feature; written by `Save-FeatureJson` in `common.ps1` and read by `Get-CurrentBranch` via `$env:SPECIFY_FEATURE`

### Hooks

`.specify/extensions.yml` declares optional, auto-executed `after_specify` and `after_plan` hooks that invoke `speckit.agent-context.update` to refresh this file's managed section. The hooks are optional and skip gracefully if PyYAML is unavailable — install it with `pip install pyyaml` if the hook reports a missing dependency.

### Managed section in this file

The block between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` is owned by the `agent-context` extension and rewritten by `speckit.agent-context.update` (or `/speckit-agent-context-update`). Edit content outside those markers freely; inside the markers, run the skill instead of hand-editing.

## Environment

- Platform: Windows 11, Git Bash shell (POSIX). Use forward slashes and `$VAR` syntax in commands.
- Default model (per `.env`): `MiniMax-M3`, base URL `https://api.minimax.io/anthropic`.
- `.env` is JSON, not dotenv — read it with a JSON parser if you need a value; do not source it as shell variables.
- This is **not** a git repository (`Is a git repository: false`). Do not run `git commit`, `git push`, or `git branch` — `/speckit-taskstoissues` and other Spec Kit steps that expect a remote will fail until the repo is initialized.

## Build / lint / test

There is no application code, no `package.json`, no test runner, and no linter configured. Spec Kit ships the only scripts in the repo, all PowerShell:

- `pwsh .specify/scripts/powershell/create-new-feature.ps1 -ShortName <slug>` — bootstrap a new feature directory under `specs/`
- `pwsh .specify/scripts/powershell/setup-plan.ps1` / `setup-tasks.ps1` — prepare plan and tasks scaffolding for the active feature
- `pwsh .specify/scripts/powershell/check-prerequisites.ps1` — verify required artifacts exist before downstream steps

To run an individual Spec Kit step, invoke the corresponding Claude Code skill (`/speckit-plan`, `/speckit-tasks`, etc.) rather than the scripts directly — the skills enforce the SDD gates.

<!-- SPECKIT START -->
# Active feature: 003-backend-api-db

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:

- Plan: `specs/003-backend-api-db/plan.md`
- Research: `specs/003-backend-api-db/research.md`
- Data model: `specs/003-backend-api-db/data-model.md`
- Quickstart: `specs/003-backend-api-db/quickstart.md`
- Contracts: `specs/003-backend-api-db/contracts/common.yaml`, `specs/003-backend-api-db/contracts/teachers.yaml`, `specs/003-backend-api-db/contracts/classes.yaml`, `specs/003-backend-api-db/contracts/subjects.yaml`, `specs/003-backend-api-db/contracts/levels.yaml`

Related specs:
- `specs/003-backend-api-db/spec.md` (this feature — cross-cutting contract owner: error envelope, status-code table, **API version prefix FR-022 (`/api/v1.0/*`)**, **ULID row-handle column FR-021**, and **no-migrations FR-016 — user-prepared MySQL**)
- `specs/001-teachers/spec.md` (dependency: 003 owns the cross-cutting contract that 001's POST/GET `/api/v1.0/teachers` + GET `/api/v1.0/subjects` conform to; 001 owns the `teachers` and `subjects` schema (user-prepared per FR-016); both tables carry `ulid CHAR(26) UNIQUE` per FR-021)
- `specs/002-classes/spec.md` (dependency: 003 owns the cross-cutting contract that 002's POST/GET `/api/v1.0/classes` + GET `/api/v1.0/levels` conform to; 002 owns the `classes` and `levels` schema (user-prepared per FR-016); both tables carry `ulid CHAR(26) UNIQUE` per FR-021)

# Cross-cutting project rules

These rules apply to **every** active feature (003, 001, 002):

- **ULID column (FR-021)**: every persisted table (`subjects`, `teachers`,
  `levels`, `classes`) carries `ulid CHAR(26) UNIQUE NOT NULL`. Generated
  server-side by the `ulid` npm package via `lib/ulid.ts` in a typeORM
  `@BeforeInsert()` hook. Exposed as the first property in every Stage 1
  POST 201 body and every entry in the GET 200 list. NOT a FK target.
  Indexed as `uq_<table>_ulid`. Clients never set `ulid`; it is
  server-generated. See `003-backend-api-db/research.md` §3.11 and
  each feature's `data-model.md` for the entity sketch.
- **Audit columns (FR-018)**: every persisted table carries
  `created_at`, `created_by`, `modified_at`, `modified_by`, `version`.
  Audit columns are hidden from the Stage 1 API response (FR-020).
- **Surrogate id (FR-019)**: every persisted table has a surrogate
  `id BIGINT UNSIGNED AUTO_INCREMENT` PK; FKs reference `id`. The
  Stage 1 API response does NOT expose `id` for `classes` /
  `teachers` (hidden to keep the wire shape stable).
- **API version prefix (FR-022)**: all Stage 1 endpoints are exposed
  under the literal prefix `/api/v1.0/`:
  - `POST /api/v1.0/teachers` and `GET /api/v1.0/teachers` (001).
  - `GET /api/v1.0/subjects` (001).
  - `POST /api/v1.0/classes` and `GET /api/v1.0/classes` (002).
  - `GET /api/v1.0/levels` (002).
  Unversioned paths (`/api/teachers`, etc.) are out of Stage 1 scope;
  the route handlers MUST NOT be reachable at the unversioned path.
- **Migrations out of Stage 1 (FR-016, Session 2026-06-21)**: the
  MySQL schema, audit columns, ULID column, FK constraints, UNIQUE
  indexes, and the `subjects` / `levels` reference-list seed data are
  all created by the user against the user-prepared MySQL container.
  The application is read/write at runtime only — `docker compose up`
  MUST NOT run a typeORM migration or any equivalent schema-creation
  step. The `lib/db/migrations/` directory and the
  `typeorm-ts-node-commonjs migration:run` command are out of Stage 1
  scope. The four migration files
  (`1700000000000-InitSchema.ts`, `…-SeedSubjects.ts`,
  `…-InitClasses.ts`, `…-SeedLevels.ts`) are removed.
- **Contact number rule (FR-004 in 001/003, Session 2026-06-21)**:
  teacher `contactNumber` MUST be exactly 8 digits, digits-only
  (`^\d{8}$`); no leading-digit restriction. The previous
  `^[89]\d{7}$` Singapore-mobile assumption is removed.
<!-- SPECKIT END -->
