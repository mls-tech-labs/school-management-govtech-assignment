<!--
Sync Impact Report
==================
Version change: 2.0.0 → 2.1.0  [MINOR: new principle + material constraint change]

Modified principles:
  II. TypeScript End-to-End  →  II. TypeScript End-to-End (architecture
      collapsed to a single Next.js app; the "shared tsconfig across the
      Next.js app and the Node.js service" wording is updated to a
      single tsconfig covering UI and API routes.)
  (other principles unchanged)

Added principles:
  VI. Functional-First (Classes Only When Necessary)
      Functional programming is the default style: pure functions,
      immutable data, explicit composition. Classes are used only when
      a framework or library requires them or when no reasonable
      functional alternative exists. New principle → MINOR.

Added sections: none
Removed sections: none

Modified sections (non-principle):
  Technical Stack Constraints
    - "Singapore Government Design System (SGDS)"  →
      "Singapore Government Design System **v3** (SGDS v3)" (PATCH
      clarification; pin the version the project standardizes on).
    - "Backend HTTP layer: a TypeScript HTTP framework selected per
      feature in plan.md → Technical Context (Express, Fastify, NestJS,
      or equivalent)"  →
      "**Next.js Route Handlers** under `app/api/` (App Router). The
      API and the UI live in a single Next.js application; there is no
      separate Node.js HTTP service." This is a material constraint
      change — the per-feature choice deferral is removed.
    - "Backend runtime: Node.js LTS" is kept (Next.js still runs on
      Node.js LTS) and rewritten as a property of the single Next.js
      app rather than a separate service.

Templates requiring updates:
  - .specify/templates/plan-template.md     ✅ no change (Constitution Check is generic;
                                                per-feature plan will use "single project"
                                                layout from the plan template's Option 1)
  - .specify/templates/spec-template.md      ✅ no change
  - .specify/templates/tasks-template.md     ✅ no change
  - .specify/templates/checklist-template.md ✅ no change
  - .specify/templates/commands/*.md         ✅ none present

Follow-up TODOs:
  - TODO(FEATURE_001): in plan.md → Project Structure, pick the
    "single project" layout from .specify/templates/plan-template.md
    (Option 1) since the app is no longer split into frontend and
    backend services. Place API route handlers under app/api/ and
    colocate unit tests.
  - TODO(FEATURE_001): in plan.md → Technical Context, decide the
    unit-test runner (Vitest vs Jest). Principle III no longer fixes
    the ordering but still requires the runner decision here.
  - TODO(FEATURE_001): in plan.md → Technical Context, decide the
    container layout (single multi-stage Dockerfile vs docker-compose
    with a MySQL service). The previous amendment flagged this; it
    remains a per-feature decision.
  - TODO(SGDS_V3_PACKAGE): pin the @govtechsg/sgds-react (or
    equivalent) package version in the first frontend plan so the
    constitution's "v3" requirement is reflected in package.json.
  - TODO(FUNCTIONAL_REVIEW): on first PR, verify no class-based
    service / controller / domain-model code is introduced; the only
    allowed classes are framework-mandated (typeORM entities, error
    subclasses where appropriate).
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

All source code — UI, API route handlers, scripts, type definitions,
tests, and infrastructure glue — MUST be written in **TypeScript** with
`strict: true`. JavaScript source files (`.js`, `.mjs`, `.cjs`) MUST NOT be
introduced except as auto-generated build output. A single `tsconfig` MUST
cover the whole application so that types cross the network boundary
between the React UI and the API routes without manual re-declaration.

**Rationale:** The requirement is "a single language across both frontend
and backend". Drift to JS fragments is the silent failure mode that erodes
that property.

### III. Unit Tests Required

Unit tests MUST exist for all domain logic — teacher/class CRUD invariants,
scheduling constraints, and any computation specific to the active feature.
Tests MUST be runnable without a network call or a live MySQL connection
(use the typeORM test fixtures / in-memory patterns documented in `plan.md`).
The order in which tests and implementation are written is the contributor's
choice; the requirement is that every domain rule is covered by a passing
unit test at the moment the feature is marked done (see Development Workflow).

**Rationale:** Unit tests are an explicit project requirement. Dropping the
test-first ordering keeps the safety net without imposing a process the
project does not need.

### IV. Single Role: Administrator

The application has exactly one user role: **Administrator**. There is no
authentication boundary, no role switcher, and no per-action authorization
check in the current scope. Introducing any additional role (e.g., Teacher,
Student, Parent) is a constitutional amendment and MUST NOT be done in a
feature spec without first amending this principle.

**Rationale:** The application is an internal admin tool. A multi-role
authorization framework is over-engineering for the stated scope and adds
attack surface without corresponding value.

### V. Simplicity (YAGNI)

Prefer the simplest design that satisfies the active spec. New abstractions,
dependencies, and services MUST be justified in `plan.md` under "Complexity
Tracking". Speculative features for future user stories MUST NOT be built.
A dependency added "because we might need it" is a violation, not a
forward-looking decision.

**Rationale:** Interview prep rewards clarity. A small, sharp implementation
demonstrates mastery better than a sprawling one.

### VI. Functional-First (Classes Only When Necessary)

Code MUST be written in a functional style by default: pure functions,
immutable data structures, and explicit composition over inheritance.
React code MUST use function components and hooks (no class components).
Server code MUST be organized as small modules of pure functions (no
class-based service layers, controllers, or repositories). Classes are
permitted only when a framework or library requires them — for example,
**typeORM entity classes** — or when no reasonable functional alternative
exists. Introducing a class for any other reason requires justification in
`plan.md` → Complexity Tracking.

**Rationale:** Functional code is easier to unit test (Principle III falls
out naturally), easier to reason about, and aligns with the interview-prep
goal of demonstrating clarity of intent.

## Technical Stack Constraints

- **Language**: TypeScript with `strict: true`. No `.js` source files.
- **Runtime**: Node.js LTS, via a single **Next.js** application. The
  application is one process; the UI lives under `app/` (or `src/app/`)
  and the API lives under `app/api/` as **Next.js Route Handlers**. There
  is no separate Node.js HTTP service, Express/Fastify/NestJS app, or
  microservice in scope.
- **Database**: MySQL (RDBMS). All persistence MUST go through **typeORM**
  entities, repositories, and migrations. Raw SQL is permitted only inside
  typeORM migrations or query builders, not in business code.
- **Frontend**: **Next.js** with the **App Router**, using **client
  components** (client-side rendering is the default for this project).
- **UI components**: the **Singapore Government Design System v3 (SGDS v3)**
  is the required component library for the active feature. Third-party
  UI deps require justification in `plan.md` and a Complexity Tracking
  entry. The exact `@govtechsg/sgds-react` (or equivalent) package version
  is pinned in `package.json` at the first frontend task — see TODO in the
  Sync Impact Report.
- **Delivery**: the application MUST run in a **Docker** container. The
  container layout (single multi-stage image, or `docker-compose` with a
  MySQL service) is decided per feature in `plan.md`.
- **Testing**: unit tests are mandatory (per Principle III). The runner
  (Vitest, Jest, or equivalent) is decided per feature in `plan.md`.
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
  SDD skills, and PRs that violate Principle II–VI.
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
  II–VI require an entry in `plan.md` → Complexity Tracking with the
  simpler alternative that was rejected and why.
- The authoritative runtime guidance for coding agents is `CLAUDE.md`;
  the authoritative process guidance is the Spec Kit skill documentation
  under `.claude/skills/speckit-*`.

**Version**: 2.1.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-18
