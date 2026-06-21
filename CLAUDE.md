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

The block between `<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/004-user-auth/plan.md
<!-- SPECKIT END -->
` is owned by the `agent-context` extension and rewritten by `speckit.agent-context.update` (or `/speckit-agent-context-update`). Edit content outside those markers freely; inside the markers, run the skill instead of hand-editing.

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
# Active feature: 005-security-hardening

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:

- Plan: `specs/005-security-hardening/plan.md`
- Research: `specs/005-security-hardening/research.md`
- Data model: `specs/005-security-hardening/data-model.md`
- Quickstart: `specs/005-security-hardening/quickstart.md`
- Contracts: `specs/005-security-hardening/contracts/security.yaml`
- Spec: `specs/005-security-hardening/spec.md`
- Checklist: `specs/005-security-hardening/checklists/requirements.md`

The agent-context extension auto-detects the most recent
`specs/*/plan.md`; the active plan per `.specify/feature.json`
is `specs/005-security-hardening/plan.md` (this feature).

Constitution references (v2.4.0, ratified 2026-06-18, last amended 2026-06-21):
- **Principle IV — Single Role: Authenticated Administrator**: the
  single Administrator role is gated by a session-based authentication
  boundary; every request to a protected resource is rejected with
  HTTP `401 Unauthorized` when no valid session cookie is presented.
  The three auth endpoints (`POST /api/v1.0/login`, `POST /api/v1.0/logout`,
  `GET /api/v1.0/me`) and the session cookie attributes
  (`HttpOnly`, `Secure`, `SameSite=Strict`) are owned by 004. The
  `csrfToken` cookie (added by 005, minted on successful login)
  shares the `Secure` env-driven relaxation with the session cookie.
- **Principle IX — Security & Hardening (NON-NEGOTIABLE in Stage 2)**:
  CORS allow-list, restrictive CSP header, double-submit CSRF token
  on state-changing requests, and layered XSS prevention. **This
  feature (`005-security-hardening`) is the implementation** of all
  four controls at the application boundary. Wired via Next.js
  `middleware.ts` (CORS + CSRF) and `next.config.mjs → headers()`
  (CSP + companion headers + HSTS).
- **Stage Scope — Stage 2 In Scope**: authentication feature
  (`004-user-auth`) + the four Principle IX hardening controls
  (`005-security-hardening`). Both shipped; no further Stage 2
  hardening specs.
- **Stage Scope — Stage 2 Out of Scope**: MFA, OAuth/SSO, password
  reset, self-registration, account lockout, rate limiting beyond
  Joi input validation, audit logging beyond the existing audit
  columns, FK migration of `created_by`/`modified_by` to `users.id`,
  COOP / CORP / COEP, DOMPurify (no rich-text fields in Stage 2).

Related specs:
- `specs/005-security-hardening/spec.md` (this feature — CORS
  allow-list, CSP header, double-submit CSRF token, layered XSS
  posture; FR-001..FR-022, SC-001..SC-013; adds 5 `.env` keys —
  `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_HEADERS`, `CSP_POLICY`,
  `CSP_REPORT_ONLY`, `HSTS_ENABLED` — and zero new entities /
  endpoints).
- `specs/004-user-auth/spec.md` (cross-feature consumer: 005
  amends `SessionRecord` with `csrfToken` field and adds the
  CSRF cookie to login / logout handlers; 004's auth middleware
  is the inner layer that runs AFTER 005's CSRF middleware in the
  request lifecycle).
- `specs/003-backend-api-db/spec.md` (cross-cutting contract owner:
  error envelope `{ "error": "..." }` extended with two new
  discriminators `cors` and `csrf`; the cross-cutting
  status-code table gains `403` for these rejection cases;
  `Content-Type: application/json` requirement, no-migrations
  FR-016, ULID FR-021, audit FR-018, surrogate id FR-019, version
  prefix FR-022 — all unchanged).
- `specs/001-teachers/spec.md` and `specs/002-classes/spec.md`
  (consumers: every state-changing endpoint they own becomes
  CSRF-protected once 005 ships; the React UI in those features
  MUST be updated to send the `X-CSRF-Token` header on every
  POST call — fetched via `lib/security/csrf-client.ts →
  getCsrfToken()`).

# Cross-cutting project rules

These rules apply to **every** active feature (005, 004, 003, 001, 002):

- **ULID column (FR-021)**: every persisted table (`subjects`,
  `teachers`, `levels`, `classes`, **`users`**) carries
  `ulid CHAR(26) UNIQUE NOT NULL`. Generated server-side by the
  `ulid` npm package via `lib/ulid.ts` in a typeORM `@BeforeInsert()`
  hook. Exposed as the first property in every Stage 1 POST 201
  body and every entry in the GET 200 list, and in every Stage 2
  `GET /api/me` body. NOT a FK target. Indexed as
  `uq_<table>_ulid`. Clients never set `ulid`; it is
  server-generated. See `003-backend-api-db/research.md` §3.11 and
  each feature's `data-model.md` for the entity sketch.
- **Audit columns (FR-018)**: every persisted table carries
  `created_at`, `created_by`, `modified_at`, `modified_by`, `version`.
  Audit columns are hidden from the Stage 1 / Stage 2 API response
  (FR-020). For `users`, `created_by` is set to `'admin'` for
  SQL-seeded rows; the FK migration of `created_by` / `modified_by`
  to `users.id` on `teachers` / `classes` / `subjects` / `levels`
  is OUT of Stage 2 scope (Principle V — YAGNI).
- **Surrogate id (FR-019)**: every persisted table has a surrogate
  `id BIGINT UNSIGNED AUTO_INCREMENT` PK; FKs reference `id`. The
  Stage 1 / Stage 2 API responses do NOT expose `id` for `classes`,
  `teachers`, or `users` (hidden to keep the wire shape stable).
- **API version prefix (FR-022)**: all Stage 1 and Stage 2 endpoints
  are exposed under the literal prefix `/api/v1.0/` (per
  `003-backend-api-db` Clarification Session 2026-06-21, Q1 —
  versioned-path propagation; the previous unversioned exemption
  for the three auth endpoints is removed):
  - `POST /api/v1.0/teachers` and `GET /api/v1.0/teachers` (001).
  - `GET /api/v1.0/subjects` (001).
  - `POST /api/v1.0/classes` and `GET /api/v1.0/classes` (002).
  - `GET /api/v1.0/levels` (002).
  - `POST /api/v1.0/login` and `POST /api/v1.0/logout` and
    `GET /api/v1.0/me` (004).
- **Migrations out of Stage 1 / Stage 2 (FR-016, Session 2026-06-21)**:
  the MySQL schema, audit columns, ULID column, FK constraints,
  UNIQUE indexes, the `subjects` / `levels` reference-list seed
  data, and now also the `users` table are all created by the user
  against the user-prepared MySQL container. The application is
  read/write at runtime only — `docker compose up` MUST NOT run a
  typeORM migration or any equivalent schema-creation step. The
  `lib/db/migrations/` directory and the
  `typeorm-ts-node-commonjs migration:run` command are out of Stage
  1 / Stage 2 scope. The four Stage 1 migration files
  (`1700000000000-InitSchema.ts`, `…-SeedSubjects.ts`,
  `…-InitClasses.ts`, `…-SeedLevels.ts`) are removed.
- **Contact number rule (FR-004 in 001/003, Session 2026-06-21)**:
  teacher `contactNumber` MUST be exactly 8 digits, digits-only
  (`^\d{8}$`); no leading-digit restriction. The previous
  `^[89]\d{7}$` Singapore-mobile assumption is removed.
- **Authentication boundary (Principle IV, Stage 2)**: every
  `/api/v1.0/*` endpoint except `POST /api/v1.0/login` and
  `GET /api/v1.0/me` requires a valid session cookie
  (HttpOnly + Secure + SameSite=Strict, hard 30-minute TTL in Redis).
  The auth middleware is the single source of truth for the boundary;
  route handlers MUST NOT do their own session lookup.
  `POST /api/v1.0/logout` is idempotent and clears the session cookie
  on the response. Login mints a fresh opaque sessionId (defense
  against session fixation); the pre-seeded sessionId (if any) is
  removed from Redis.
- **Hardening deferred to 005 (Principle IX, per Clarifications
  Session 2026-06-21 round 1, Q1)**: the four Principle IX controls
  (CORS allow-list, CSP header, double-submit CSRF token on
  state-changing requests, layered XSS posture) are owned by a
  future `005-security-hardening` spec, not by 004. The `Secure`
  cookie flag is environment-driven (relaxed in local-dev HTTP) per
  Principle IV.
- **Stage 2 Out-of-Scope controls** (per constitution Stage Scope):
  MFA / 2FA, OAuth / OIDC / SSO, password reset / forgot-password,
  self-registration, admin authoring of `users`, account lockout /
  brute-force throttling / captcha-after-N-failures, rate limiting
  beyond Joi input validation, audit logging beyond the existing
  audit columns, COOP / CORP / COEP.
<!-- SPECKIT END -->
