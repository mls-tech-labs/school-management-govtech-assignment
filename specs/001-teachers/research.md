# Research: Teachers (001-teachers)

**Date**: 2026-06-18
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)

This document captures the open Technical Context decisions from `plan.md`,
each resolved to a single choice with rationale and the rejected alternatives.
Every entry below is consulted at implementation time; no decision is left to
the implementer.

---

## 1.1. Unit-test runner: Vitest vs Jest

**Decision**: **Vitest** (latest 1.x as of 2026-06-18).

**Rationale**:
- Native TypeScript / ESM support out of the box — no `ts-jest`, no `babel-jest`, no
  transformer config. The Constitution's Principle II (`strict: true` TS end-to-end)
  is satisfied with no extra plumbing.
- Significantly faster startup and watch loop than Jest (no Babel transform per file).
- Compatible `expect`, `describe`, `it`, `vi.fn`, `vi.mock` API — most Jest patterns port
  verbatim.
- Plays well with Next.js 15's Turbopack + ESM pipeline; Jest is still on CommonJS
  assumptions and needs workarounds for Next 15 App Router test scenarios.
- `vitest.config.ts` lives at the repo root and is referenced by `npm test` /
  `npm run test:unit`.

**Alternatives considered**:
- **Jest** (latest 29.x with `ts-jest` / `babel-jest`) — the historical default, the
  most popular runner in the React/Next ecosystem, and the most Stack-Overflow answers.
  Rejected because (a) it requires extra transformer config to play nicely with Next
  15's ESM + App Router, (b) watch mode is noticeably slower, and (c) no test in this
  feature requires Jest-only APIs (`jest.mock` factories, snapshot serializers) that
  Vitest can't match.
- **Node's built-in `node:test`** — zero dependencies, native TS via `--experimental-strip-types`.
  Rejected for Stage 1 because (a) it doesn't yet have the equivalent of Vitest's
  coverage UX, (b) the toolchain is still flagged experimental in Node LTS, and (c) the
  team is more likely to have prior Vitest/Jest experience.

**TODO closure**: This resolves the `TODO(FEATURE_001)` in the Constitution's Sync
Impact Report ("in plan.md → Technical Context, decide the unit-test runner (Vitest
vs Jest)").

---

## 1.2. Container layout: single multi-stage Dockerfile vs `docker compose` with a MySQL service

**Decision**: **`docker compose` with two services** (`app`, `mysql`).

**Rationale**:
- The Constitution's Technical Stack Constraints require both the app and the
  MySQL database to run in Docker containers. A single multi-stage image that
  bundles both would put a database inside an application container — fine for a
  one-off demo, but bad practice (no independent scaling, no independent restart,
  no volume strategy for the database).
- `docker compose` keeps the two services separate, lets each have its own
  `Dockerfile` / `image` reference, and lets the app's hot-reload loop in dev
  work without rebuilding the database image.
- A separate `docker/docker-compose.test.yml` (one service: `mysql`) gives the
  integration tests a known-good DB without running the app container.
- Production deployment of a single Next.js app + managed MySQL is the standard
  pattern; this layout translates directly to a managed DB swap.

**Alternatives considered**:
- **Single multi-stage Dockerfile** that builds the app and bakes MySQL into the
  same image. Rejected because (a) it violates the principle of one process per
  container, (b) it makes the database un-restartable independent of the app, and
  (c) it has no clean path to a managed MySQL swap in production.
- **`docker compose` with `mysql` as a `container_name` on the host network, no
  volumes** — simpler but loses data on `docker compose down`. Rejected because the
  SC-001 success criterion ("survives server restarts") would fail on every
  `docker compose down` during development.

**TODO closure**: This resolves the `TODO(FEATURE_001)` in the Constitution's Sync
Impact Report ("in plan.md → Technical Context, decide the container layout").

---

## 1.3. UI library and styling version pin (Ant Design + Tailwind CSS)

**Decision**: **`antd@<pinned>`** + **`tailwindcss@<pinned>`** +
**`postcss@<pinned>`** + **`autoprefixer@<pinned>`** in `package.json`
(latest stable as of 2026-06-19).

**Rationale**:
- The Constitution (v2.3.0, amendment 2026-06-19) Technical Stack Constraints
  require **Ant Design (`antd`)** as the component library and **Tailwind CSS**
  as the styling solution. This supersedes the previous requirement for SGDS v3
  (see the v2.2.0 → v2.3.0 Sync Impact Report and the
  `### Session 2026-06-19` clarification in [`spec.md`](./spec.md)).
- `antd` is the de-facto React UI component library in the wider React
  ecosystem, has comprehensive TypeScript types, ships its own reset CSS
  (`antd/dist/reset.css`), and matches the requirements file's
  explicit example ("Utilising 3rd party libraries (e.g., Ant Design or
  Material UI) is allowed").
- **Tailwind CSS** is the utility-first CSS framework required by the
  Constitution for visual presentation (layout, spacing, colour, typography,
  responsive behaviour). Tokens (colour palette, font stack, breakpoints,
  spacing scale) live in `tailwind.config.*` and are referenced from JSX
  `className` via utility classes — no hand-written CSS, no inline `style`
  objects, no per-component CSS modules except where `antd`'s documented
  escape hatches (e.g. `ConfigProvider` token overrides) require it.
- Pinning to caret ranges (`^x.y.z`) for `antd` and `tailwindcss` gets the
  latest minor + patch and blocks a major-version jump — which would be a
  design-system upgrade, not a routine update. The exact versions are
  recorded in `package-lock.json` for reproducible builds.
- `postcss` + `autoprefixer` are Tailwind's build pipeline; both pinned to
  the versions `tailwindcss` documents as compatible.

**Alternatives considered**:
- **Material UI (`@mui/material`)** — a comparable React component library
  with its own theming system. Rejected because the original requirements
  file names "Ant Design or Material UI" as examples; we choose the one
  the example lists first, and Ant Design's component model (`Form.Item`,
  `Table`, `Select` with `options`) maps more directly onto the
  forms/tables the spec calls for.
- **Chakra UI / Mantine / Radix** — equally capable React UI libraries.
  Rejected to keep the dependency surface small (Principle V — Simplicity)
  and because none of them are named in the requirements file.
- **Plain CSS / CSS Modules / styled-components** for styling instead of
  Tailwind. Rejected by the Constitution v2.3.0 (the Styling line in
  Technical Stack Constraints names Tailwind CSS as the required
  solution).
- **Exact pin (e.g. `5.21.6`)** — no auto-updates. Rejected because we want
  patch updates without a manual `npm install` edit, and the lockfile
  already pins the exact version.
- **Open range (`"latest"`)** — never reproducible. Rejected.
- **Reverting to `@govtechsg/sgds-react@^3`** — explicitly the prior
  decision; superseded by the constitution amendment.

**TODO closure**: This supersedes the prior `TODO(SGDS_V3_PACKAGE)` and
introduces `TODO(ANTD_TAILWIND_VERSION)` in the Constitution's Sync
Impact Report.

---

## 1.4. Data access: typeORM version + driver

**Decision**: **`typeorm@^0.3`** (latest 0.3.x as of 2026-06-18) with
**`mysql2@^3`** as the MySQL driver.

**Rationale**:
- typeORM 0.3 is the current stable line; 0.3 has the new `DataSource` API
  (replacing the legacy `createConnection`) and the `EntityManager` and
  `Repository` APIs that the plan uses. (Stage 1 does NOT use the
  migration CLI — `lib/db/migrations/` is out of scope per FR-016,
  Session 2026-06-21; the MySQL schema is user-prepared.)
- The Constitution's Technical Stack Constraints require typeORM
  entities and repositories — both are first-class in 0.3.
- `mysql2` is the official typeORM-recommended driver for MySQL; it supports
  prepared statements, connection pooling, and the auth plugin flow.
- The plan uses `find()`, `findOne()`, and `save()` only — no QueryBuilder — so
  the driver doesn't matter beyond the connection string.

**ULID column (per FR-021, owned by `003-backend-api-db`)**:
- The 2026-06-20 ULID clarification added a
  `ulid CHAR(26) NOT NULL UNIQUE` column to every table. The
  `ulid` is generated server-side by the
  [`ulid`](https://www.npmjs.com/package/ulid) npm package
  (`generateUlid()` from `lib/ulid.ts`, owned by `003-backend-api-db`).
- The `Teacher` and `Subject` entities declare
  `@Column({ type: "char", length: 26, unique: true }) ulid!: string`
  and the entity `@BeforeInsert()` hook calls `generateUlid()` to
  populate the column.
- `ulid` is the **frontend-stable row handle** (per FR-021). The
  Stage 1 POST 201 body and every entry in the GET 200 list carry
  `ulid`. The surrogate `id` continues to be hidden from the API
  response (per `002-classes/spec.md` Clarifications, Session
  2026-06-18, Q5 — and the matching rule inherited by 001).
- `ulid` is NOT a foreign-key target. FKs continue to reference the
  surrogate `id` (per FR-019). The `UNIQUE(teachers.ulid)` and
  `UNIQUE(subjects.ulid)` indexes are the cross-cutting row-handle
  constraint.

**Alternatives considered**:
- **`mysql` driver** (the older one) — still supported but not recommended; slower
  and lacks prepared-statement parameter binding fixes. Rejected.
- **Prisma** — modern, schema-first, with great types. Rejected because the
  Constitution specifies typeORM, and the per-feature specs are written against
  typeORM-style entities (decorators, repository methods). (Stage 1
  does not include migration files — `lib/db/migrations/` is out
  of scope per FR-016, Session 2026-06-21.)

---

## 1.5. Validation library: Joi vs Zod vs class-validator

**Decision**: **Joi 17.x** (latest stable).

**Rationale**:
- The Constitution's Principle VII specifies Joi explicitly: "Joi MUST validate
  every payload that crosses a trust boundary." Zod and class-validator are not
  in scope under the Constitution.
- Joi 17 is the current major; 18 is in development as of 2026-06 and is not yet
  recommended for production. Pin to `^17`.
- Joi's `.pattern()`, `.valid(... list)`, `.email({ tlds: false })` and
  `.required()` cover the spec's validation rules cleanly: email format,
  8-digit `/^\d{8}$/` contact number (digits-only, no
  leading-digit restriction — per FR-004, Session 2026-06-21),
  subject in the seeded list.
- Joi schemas live as plain `.ts` modules (per Principle VII), imported by the
  route handler, and unit-tested directly (no live HTTP).

**Alternatives considered**:
- **Zod** — modern, TypeScript-first, plays well with `tRPC` and form libs. Rejected
  because the Constitution specifies Joi.
- **class-validator** — requires class-based DTOs, conflicts with Principle VI
  (no class-based code). Rejected.
- **Joi 18 (alpha / beta)** — would be the latest, but the Constitution + community
  practice pin on 17.x. Rejected for stability.

---

## 1.6. Missing `.requirements/Full Stack Assignment.md` asset

**Decision**: **Do not block on the missing file**; the spec already enumerates the
four teacher fields (name, subject, email, contactNumber) and the four classes fields
(level, name, formTeacherEmail) with concrete validation rules. Proceed against the
spec.

**Rationale**:
- The 001-teachers `spec.md` "Input" line references the file
  (`.requirements/Full Stack Assignment.md`) as the source for the teachers and
  classes behaviors and Figma design references, but the file is not present in
  the repo (`ls .requirements/` returns "No such file or directory").
- The Clarifications (Session 2026-06-18) already pinned every numeric / format
  detail the spec is missing: subject type (predefined list, FK), contact number
  format (8 digits, starts 8/9), duplicate-email status (409), pagination
  (no, ≤ 500), API response time (no new target), cross-cutting 415/503.
- The Figma design paths in the spec (`./designs/teachers/...`) likewise do not
  exist; the spec already documented that the Filled State mirrors the Classes
  Filled State (Assumption in 001-teachers §Assumptions), so no Figma asset is
  blocking.

**Follow-up (out of this plan's scope)**:
- A separate cleanup task (not part of 001-teachers implementation) can restore the
  `.requirements/` directory and the `./designs/` directory if the original files
  become available. None of the FRs, SCs, or edge cases in this spec depend on those
  files.

**Alternatives considered**:
- **Stop and ask the user for the file** — sensible, but the user has been clear
  in two prior clarification sessions ("do not assume things, you can always clarify
  with me"); every concrete value the spec could have leaned on the file for is
  already pinned in the Clarifications. Proceeding.
- **Reverse-engineer the Figma design from the Add Teacher / Teachers pages
  described in the spec** — the spec is detailed enough that the forms can be
  built from the field names, the Filled State description ("mirrors Classes"),
  and the error-state requirements. No need to wait for the Figma.

---

## 1.7. Next.js + React versions

**Decision**: **`next@^15`** (latest 15.x as of 2026-06-18) paired with
**`react@^19` and `react-dom@^19`**.

**Rationale**:
- Next 15 is the current stable line; App Router is the default and required by
  the Constitution ("Next.js with the **App Router**, using **client components**").
- Next 15 pairs with React 19 by default; using React 18 is unsupported on
  Next 15. Pin to React 19 in `package.json`.
- App Router's client-component model matches the spec's "client-side rendering
  is the default for this project" assumption.
- Route Handlers under `app/api/*/route.ts` are the documented way to build the
  API; no separate Express / Fastify server.

**Alternatives considered**:
- **Next 14** — would still work, but the user asked for "latest npm libraries".
  Rejected.
- **Pages Router** — the legacy model. Rejected because the Constitution specifies
  App Router.
- **A separate backend in Express / Fastify / NestJS** — explicitly out of scope
  per the Constitution ("There is no separate Node.js HTTP service,
  Express/Fastify/NestJS app, or microservice in scope.").

---

## 1.8. Module system: ESM vs CJS

**Decision**: **TypeScript with the Next.js default** (Next 15 supports both ESM and
CJS; the default for new Next 15 apps is the Next-native build pipeline, with
`"type": "module"` in `package.json` and `.mjs` / `.ts` source files).

**Rationale**:
- The Constitution's Principle II says "no `.js` source files" — the source is
  `.ts`, the build output is auto-generated.
- Next 15's default `tsconfig.json` is CommonJS-style on the build side but the
  authored source is ESM-style (import/export). This is the path of least
  resistance.
- typeORM 0.3 ships both CJS and ESM builds; the library works with the
  Next 15 build setup out of the box. (Stage 1 does not run the
  typeORM migration CLI — `lib/db/migrations/` is out of scope per
  FR-016, Session 2026-06-21.)

**Alternatives considered**:
- **Full strict ESM** (`"type": "module"` everywhere, no `require`). Rejected
  because it makes any future re-introduction of the typeORM migration CLI
  harder to configure; not worth the friction in Stage 1 where the
  CLI is not used.
- **Full CJS** (the legacy pattern). Rejected because Next 15 has moved on.

---

## 1.9. `package.json` version policy (recap)

Per the user's input — "npm libraries should be latest" — the dependency list in
[plan.md §Technical Context](./plan.md#technical-context) uses caret ranges
(`^x.y.z`) for every runtime dependency, pinned exactly in `package-lock.json` by
the first `npm install`. Dev dependencies (`typescript`, `vitest`, `@types/*`)
follow the same pattern. The exact versions are recorded at install time; the
plan itself does not pin a specific patch number.

The `package.json` policy is therefore:
- Runtime deps: caret ranges, locked via `package-lock.json`.
- Dev deps: caret ranges, locked via `package-lock.json`.
- Engines: `"node": ">=20.x"` (current Node LTS as of 2026-06-18).
