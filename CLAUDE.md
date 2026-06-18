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
- `specs/003-backend-api-db/spec.md` (this feature — cross-cutting contract owner: error envelope, status-code table, migration-set ordering, reference-list seed pattern)
- `specs/001-teachers/spec.md` (dependency: 003 owns the cross-cutting contract that 001's POST/GET /api/teachers + GET /api/subjects conform to; 001 owns the `teachers` and `subjects` schema and migrations)
- `specs/002-classes/spec.md` (dependency: 003 owns the cross-cutting contract that 002's POST/GET /api/classes + GET /api/levels conform to; 002 owns the `classes` and `levels` schema and migrations)
<!-- SPECKIT END -->
