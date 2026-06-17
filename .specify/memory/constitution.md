<!--
Sync Impact Report
==================
Version change: (none) → 1.0.0  [initial ratification; no prior version]

Replaced placeholders:
  [PROJECT_NAME]            → pvt-edu-admin-project
  [PRINCIPLE_1_NAME]        → I.  Spec-Driven Development (NON-NEGOTIABLE)
  [PRINCIPLE_2_NAME]        → II. TypeScript End-to-End
  [PRINCIPLE_3_NAME]        → III. Test-First for Domain Logic
  [PRINCIPLE_4_NAME]        → IV. Role-Based Access Control
  [PRINCIPLE_5_NAME]        → V.  Simplicity (YAGNI)
  [SECTION_2_NAME]          → Technical Stack Constraints
  [SECTION_3_NAME]          → Development Workflow
  [GOVERNANCE_RULES]        → concrete amendment + versioning rules
  [CONSTITUTION_VERSION]    → 1.0.0
  [RATIFICATION_DATE]       → 2026-06-18
  [LAST_AMENDED_DATE]       → 2026-06-18

Added sections: none beyond placeholder fills
Removed sections: none
Principles renamed: none (template slots were all blank)

Templates requiring updates:
  - .specify/templates/plan-template.md     ✅ no change (Constitution Check is generic)
  - .specify/templates/spec-template.md      ✅ no change
  - .specify/templates/tasks-template.md     ✅ no change
  - .specify/templates/checklist-template.md ✅ no change
  - .specify/templates/commands/*.md         ✅ none present

Follow-up TODOs:
  - TODO(API_FRAMEWORK): pick Express vs Fastify vs NestJS for the first
    feature in plan.md → Technical Context; not pinned here so the choice
    stays a per-feature decision unless a later amendment makes it global.
  - TODO(UNIT_TEST_RUNNER): pick Vitest vs Jest for the first feature
    in plan.md → Technical Context; same rationale.
  - TODO(CONTAINER_LAYOUT): choose single Dockerfile vs docker-compose
    (with MySQL service) at the first feature; doctrine above only fixes
    "the deliverable ships in a container".
  - TODO(SGDS_VERSION): pin the Singapore Government Design System
    package version when the first frontend task is planned.
-->

# pvt-edu-admin-project Constitution

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)

Every feature in this project MUST be produced through the Spec Kit workflow:
`/speckit-specify` → review → `/speckit-plan` → review → `/speckit-tasks` →
`/speckit-implement`. No source code, schema, migration, or contract is
written before its `spec.md`, `plan.md`, and `tasks.md` exist for the active
feature in `specs/[###-feature-name]/`. Reviewers MUST stop at each gate and
explicitly approve before the next step runs.

**Rationale:** The repository exists as interview-prep learning material
built around the SDD cycle. Skipping steps collapses the very practice the
project is meant to teach.

### II. TypeScript End-to-End

All source code — backend, frontend, scripts, type definitions, tests, and
infrastructure glue — MUST be written in **TypeScript** with `strict: true`.
JavaScript source files (`.js`, `.mjs`, `.cjs`) MUST NOT be introduced
except as auto-generated build output. The same `tsconfig` compiler options
MUST be honoured by both the Next.js app and the Node.js service so that
types cross the network boundary without manual re-declaration.

**Rationale:** The requirement is "a single language across both frontend
and backend". Drift to JS fragments is the silent failure mode that erodes
that property.

### III. Test-First for Domain Logic

All domain rules — teacher/class CRUD invariants, scheduling constraints,
authorization checks, billing math — MUST follow a test-first cycle: write
a failing unit test, confirm it fails for the right reason, then implement
to green. UI plumbing, generated code, and one-off scripts are exempt.
Tests MUST live next to the code they cover (e.g., `tests/unit/...`,
`co-located __tests__/`) and MUST be runnable without a network call or a
live MySQL connection (use the typeORM test fixtures / in-memory patterns
documented in `plan.md`).

**Rationale:** Unit tests are an explicit project requirement, and
test-first is the only discipline that proves the rule is captured rather
than observed as a side-effect.

### IV. Role-Based Access Control

Every mutating endpoint or admin action MUST check the caller's role before
executing. The role catalogue MUST be enumerated in `data-model.md` for any
feature that introduces a new role or permission. Authorization rules MUST
be expressed declaratively (a policy table or equivalent), not scattered
across handlers. The current minimum role set is **Administrator**; new
roles (e.g., Teacher, Student, Parent) require an entry in the feature
spec before they may be coded.

**Rationale:** Admin tools serve distinct audiences. Implicit authorization
is the most common source of breaches in this category of app, and
centralizing the policy makes it auditable in one place.

### V. Simplicity (YAGNI)

Prefer the simplest design that satisfies the active spec. New abstractions,
dependencies, and services MUST be justified in `plan.md` under "Complexity
Tracking". Speculative features for future user stories MUST NOT be built.
A dependency added "because we might need it" is a violation, not a
forward-looking decision.

**Rationale:** Interview prep rewards clarity. A small, sharp implementation
demonstrates mastery better than a sprawling one.

## Technical Stack Constraints

- **Language**: TypeScript with `strict: true`. No `.js` source files.
- **Backend runtime**: Node.js LTS.
- **Backend HTTP layer**: a TypeScript HTTP framework selected per feature
  in `plan.md` → Technical Context (Express, Fastify, NestJS, or equivalent).
- **Database**: MySQL (RDBMS). All persistence MUST go through **typeORM**
  entities, repositories, and migrations. Raw SQL is permitted only inside
  typeORM migrations or query builders, not in business code.
- **Frontend**: **Next.js** with the **App Router**, using **client
  components** (client-side rendering is the default for this project).
- **UI components**: the **Singapore Government Design System (SGDS)** is
  the preferred component library. Third-party UI deps require justification
  in `plan.md` and a Complexity Tracking entry.
- **Delivery**: the application MUST run in a **Docker** container. The
  container layout (single image, multi-stage build, or `docker-compose`
  with a MySQL service) is decided per feature in `plan.md`.
- **Testing**: unit tests are mandatory. The runner (Vitest, Jest, or
  equivalent) is decided per feature in `plan.md`.
- **Secrets**: MUST NOT be committed. Local secrets go in `.env.local`
  (gitignored) or are passed at container run time. The repo-level `.env`
  is JSON and holds model configuration only — see `CLAUDE.md` → Environment.

## Development Workflow

- Each feature lives in its own `specs/[###-feature-name]/` directory and
  goes through the SDD cycle in order. Gates are enforced by the Spec Kit
  skills under `.claude/skills/speckit-*`.
- A feature is "done" only when all of the following hold: (a) every
  `tasks.md` item is checked, (b) the `quickstart.md` validation steps
  pass, (c) `/speckit-analyze` reports no cross-artifact inconsistencies,
  and (d) `README.md` reflects any new run / deploy / assumption.
- `README.md` at the repository root is a **contract** for every release.
  It MUST contain: clear instructions to run a working local instance of
  the web app and API server; documented assumptions; links to the hosted
  web app and API when applicable; and (optionally) notes or suggestions
  on the API design. A PR that changes behavior without updating the
  README is incomplete.
- Pull requests for code MUST link the active spec, plan, and tasks.
  Reviewers MUST reject PRs whose artifacts were not produced through the
  SDD skills, and PRs that violate Principle II–V.
- When in doubt, prefer amending this constitution over maintaining
  out-of-band conventions.

## Governance

- This constitution supersedes all other written or unwritten development
  practices in this repository.
- Amendments require a written rationale, a Sync Impact Report at the top
  of this file, and a version bump per the rules below.
- **Versioning policy** follows semantic versioning:
  - **MAJOR** — principle removal or incompatible redefinition.
  - **MINOR** — new principle or section added, or material guidance
    expanded.
  - **PATCH** — clarifications, wording fixes, non-semantic refinements.
- Compliance review: every `/speckit-implement` run MUST include a
  Constitution Check section in `plan.md`; deviations from Principles
  II–V require an entry in `plan.md` → Complexity Tracking with the
  simpler alternative that was rejected and why.
- The authoritative runtime guidance for coding agents is `CLAUDE.md`;
  the authoritative process guidance is the Spec Kit skill documentation
  under `.claude/skills/speckit-*`.

**Version**: 1.0.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-18
