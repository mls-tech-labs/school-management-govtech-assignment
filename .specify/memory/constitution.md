<!--
Sync Impact Report
==================
Version change: 2.1.0 → 2.2.0  [MINOR: two new principles + new Stage Scope section]

Modified principles: none (Principles I–VI are unchanged in title and intent;
                     wording in Technical Stack Constraints and Secrets is
                     clarified, see "Modified sections" below).

Added principles:
  VII. Joi Schema Validation (input + DB column alignment)
       Joi MUST validate every API request body, query parameter, and
       server-trusted form submission that crosses a trust boundary.
       The Joi schema for each entity MUST mirror the typeORM entity
       columns so the same field-level constraints (required-ness,
       length, type, format) appear in both validation and persistence.
       New principle → MINOR.

  VIII. UI Quality — Self-Explanatory, Reusable, Simple
       Every UI component MUST be self-explanatory (clear name,
       explicit props, no hidden coupling), reusable (no feature-
       specific hard-coding; composed from generic primitives), and
       as simple as the requirement allows. New principle → MINOR.

Added sections:
  Stage Scope
    Captures the currently in-scope features (Stage 1 = Teachers UI
    Create+Read, Classes UI Create+Read, and their backend APIs) so
    any feature spec that goes outside it requires an explicit
    amendment.

Modified sections (non-principle):
  Technical Stack Constraints
    - "the application MUST run in a Docker container" →
      "the application MUST run in a Docker container, and the
      MySQL database MUST also run in a Docker container." PATCH
      clarification: pins MySQL's runtime as Docker per the user's
      stated environment.
    - Secrets:
        "Local secrets go in `.env.local` (gitignored) or are passed
        at container run time. The repo-level `.env` is JSON and holds
        model configuration only — see `CLAUDE.md` → Environment." →
        "Runtime application configuration (database URL, server
        port, feature flags, etc.) is provided via the `.env` file
        loaded by Next.js / the runtime (standard dotenv format).
        Secrets that MUST NOT be committed (passwords, API keys) live
        in `.env.local` (gitignored) or are passed at container run
        time. The repo-level `.env` that is JSON and holds model
        configuration only — see `CLAUDE.md` → Environment — is a
        separate concern and MUST NOT be used for application
        runtime config." PATCH clarification: separates the
        application's dotenv `.env` from the JSON `.env` consumed
        by the coding-agent harness, and aligns the document with
        the user's "all the configurations are provided via .env
        file" statement.

Templates requiring updates:
  - .specify/templates/plan-template.md     ✅ no change
  - .specify/templates/spec-template.md      ✅ no change
  - .specify/templates/tasks-template.md     ✅ no change
  - .specify/templates/checklist-template.md ✅ no change
  - .specify/templates/commands/*.md         ✅ none present

Follow-up TODOs:
  - TODO(FEATURE_001): in plan.md → Technical Context, decide the
    unit-test runner (Vitest vs Jest). Principle III does not fix
    the ordering but still requires the runner decision here.
  - TODO(FEATURE_001): in plan.md → Technical Context, decide the
    container layout (single multi-stage Dockerfile vs docker-compose
    with a MySQL service).
  - TODO(SGDS_V3_PACKAGE): pin the @govtechsg/sgds-react (or
    equivalent) package version in the first frontend plan so the
    constitution's "v3" requirement is reflected in package.json.
  - TODO(JOI_ALIGNMENT): on the first PR that adds a typeORM
    entity, verify a matching Joi schema exists with identical
    field-level constraints (required-ness, length, regex, format).
  - TODO(FUNCTIONAL_REVIEW): on first PR, verify no class-based
    service / controller / domain-model code is introduced; the only
    allowed classes are framework-mandated (typeORM entities, Joi
    schema helpers where required, error subclasses where appropriate).
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

### VII. Joi Schema Validation

**Joi MUST validate every payload that crosses a trust boundary** —
in particular, every Next.js Route Handler request body and every
query/path parameter consumed by an API. Validation MUST run before
any business logic, typeORM call, or persistence write. Validation
errors MUST be returned to the client with HTTP `400 Bad Request` and
a structured `{ error, details }` payload; they MUST NOT leak
internal messages, stack traces, or database column names.

The Joi schema for an entity MUST mirror the typeORM entity columns
field-for-field: same required-ness, same length bounds, same string
format / regex, same numeric range. Where a constraint is awkward to
express in typeORM decorators (e.g. cross-field rules), the Joi
schema is the source of truth and the typeORM column is the relaxed
default — but the mismatch MUST be documented in `plan.md`.

Joi schemas live in plain `.ts` modules (functional: exported factory
functions or const schemas), not in classes. They are unit-tested
(Principle III): at least one test per schema covers the happy path
and one test per constraint covers the rejection path.

**Rationale:** Manual, ad-hoc validation drifts away from the
typeORM columns and silently lets malformed data into MySQL.
Joi-as-source-of-truth gives the app one declarative contract
that is easy to unit test, hard to bypass, and explicitly
defends the database boundary — which is the security property
the project asked for.

### VIII. UI Quality — Self-Explanatory, Reusable, Simple

Every UI component — page, section, form control, table, button — MUST
satisfy three properties:

1. **Self-explanatory.** Clear, domain-meaningful name; explicit, typed
   props with no hidden coupling to global state or ambient config;
   one obvious place to look for its behaviour. Props MUST be
   documented (TSDoc or equivalent) when their meaning is not obvious
   from the type alone.
2. **Reusable.** No feature-specific hard-coding (no `Teacher` field
   names baked into a "Form" component). Composed from generic SGDS
   v3 primitives and shared form/table helpers rather than re-
   implementing them per page.
3. **Simple.** No abstractions ahead of the current requirement
   (Principle V applies here too). If a component needs three layers
   of indirection to render one button, it is the wrong component.

UI work is reviewed against these three properties in addition to
the standard Spec-Driven gates.

**Rationale:** Self-explanatory + reusable + simple components are
the difference between an admin tool a single developer can read
end-to-end and one that requires tribal knowledge to extend. The
project's interview-prep goal is to demonstrate that clarity, not
to demonstrate framework acrobatics.

## Stage Scope

This section pins what the current constitution actually authorises.
A feature spec that exceeds this scope MUST first amend this section
(or amend Principle IV, Principle V, etc., as relevant).

**Stage 1 — In Scope:**

- **Teachers UI**: Create and Read operations only.
- **Classes UI**: Create and Read operations only.
- **Backend APIs**: the corresponding `POST` and `GET` endpoints for
  Teachers and Classes, exposed as Next.js Route Handlers under
  `app/api/`, validated by Joi (Principle VII) and persisted via
  typeORM (Technical Stack Constraints).
- **Data model**: the MySQL tables backing Teachers and Classes, as
  defined in `specs/003-backend-api-db/spec.md` and locked into
  typeORM entities with matching Joi schemas.

**Stage 1 — Explicitly Out of Scope** (requires a constitutional
amendment to enter scope):

- Update and Delete operations on Teachers / Classes.
- Authentication, authorization, sessions, or any non-administrator
  role (see Principle IV).
- New entities beyond Teachers and Classes.
- Production deployment, observability, or non-MySQL storage.

## Technical Stack Constraints

- **Language**: TypeScript with `strict: true`. No `.js` source files.
- **Runtime**: Node.js LTS, via a single **Next.js** application. The
  application is one process; the UI lives under `app/` (or `src/app/`)
  and the API lives under `app/api/` as **Next.js Route Handlers**. There
  is no separate Node.js HTTP service, Express/Fastify/NestJS app, or
  microservice in scope.
- **Database**: **MySQL** (RDBMS), running in a **Docker container**.
  All persistence MUST go through **typeORM** entities, repositories,
  and migrations. Raw SQL is permitted only inside typeORM migrations
  or query builders, not in business code.
- **Frontend**: **Next.js** with the **App Router**, using **client
  components** (client-side rendering is the default for this project).
- **UI components**: the **Singapore Government Design System v3 (SGDS v3)**
  is the required component library for the active feature. Third-party
  UI deps require justification in `plan.md` and a Complexity Tracking
  entry. The exact `@govtechsg/sgds-react` (or equivalent) package version
  is pinned in `package.json` at the first frontend task — see TODO in the
  Sync Impact Report.
- **Validation**: **Joi** schemas (Principle VII), aligned field-for-field
  with the typeORM entity columns.
- **Delivery**: the application MUST run in a **Docker** container, and
  the MySQL database MUST also run in a Docker container. The container
  layout (single multi-stage image, or `docker-compose` with a MySQL
  service) is decided per feature in `plan.md`.
- **Configuration**: runtime application configuration (database URL,
  server port, feature flags, etc.) is provided via the `.env` file
  loaded by Next.js / the Node.js runtime, in standard dotenv format.
- **Testing**: unit tests are mandatory (per Principle III). The runner
  (Vitest, Jest, or equivalent) is decided per feature in `plan.md`.
- **Secrets**: passwords, API keys, and other values that MUST NOT be
  committed live in `.env.local` (gitignored) or are passed at container
  run time. The repo-level `.env` that the coding-agent harness reads as
  JSON and that holds model configuration only — see `CLAUDE.md` →
  Environment — is a separate concern and MUST NOT be used as the source
  of application runtime configuration.

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
  SDD skills, and PRs that violate Principle II–VIII.
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
  II–VIII require an entry in `plan.md` → Complexity Tracking with the
  simpler alternative that was rejected and why.
- The authoritative runtime guidance for coding agents is `CLAUDE.md`;
  the authoritative process guidance is the Spec Kit skill documentation
  under `.claude/skills/speckit-*`.

**Version**: 2.2.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-18