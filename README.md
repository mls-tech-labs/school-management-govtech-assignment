# Private Education Admin Portal

A small admin portal for managing **Teachers** and **Classes** in a private school. Stage 1 ships Create + Read for both entities, backed by Next.js 15 (App Router) + MySQL 8 + typeORM + Joi + Ant Design + Tailwind CSS.

> **Project status**: Stage 1 implemented. See `specs/001-teachers/`, `specs/002-classes/`, and `specs/003-backend-api-db/` for the source-of-truth specs.

---

## Quick start (Docker)

```bash
# 1. Copy environment template
cp .env.example .env.local

# 2. Bring up MySQL (auto-loads docker/mysql/init/01-schema-and-seed.sql on first boot —
#    this is the user-prepared MySQL container per FR-016: the schema, audit columns,
#    ulid CHAR(26) UNIQUE columns, FK constraints, UNIQUE indexes, and the subjects
#    / levels reference-list seeds are all created by the SQL bootstrap; no typeORM
#    migration runs on app boot)
docker compose -f docker/docker-compose.yml up -d mysql

# 3. Bring up the app (no migration step — the app connects to the existing MySQL)
docker compose -f docker/docker-compose.yml up -d --build app

# 4. Open the portal
open http://localhost:3000          # redirects to /teachers
```

To wipe and start fresh:

```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d mysql      # re-seeds the schema
docker compose -f docker/docker-compose.yml up -d --build app
```

---

## Quick start (local dev, no Docker)

```bash
npm ci
# Start the user-prepared MySQL container (or any local MySQL 8 instance with the
# schema already bootstrapped via docker/mysql/init/01-schema-and-seed.sql):
docker compose -f docker/docker-compose.yml up -d mysql
cp .env.example .env.local   # then edit credentials if needed
npm run dev
```

Open <http://localhost:3000>. **Do not** run any migration command — there is no
migration set in Stage 1 (per FR-016, Session 2026-06-21).

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Production server (after build) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run all Vitest tiers |
| `npm run test:unit` | Unit tests only (no DB) |
| `npm run test:contract` | Contract tests (Next.js route handlers in isolation) |
| `npm run test:integration` | Integration tests (require live MySQL container) |

> **No migration scripts.** Stage 1 ships with no typeORM migration set and no
> boot-time seeder. The MySQL schema is user-prepared (see `docker/mysql/init/01-schema-and-seed.sql`).
> The previous `migration:run`, `migration:revert`, and `db:rebuild` scripts have
> been removed per FR-016.

---

## Architecture

- **Runtime**: single Next.js 15 process (frontend + API). The Constitution forbids microservice splits in Stage 1.
- **Persistence**: MySQL 8 in a Docker container. The schema, audit columns, `ulid CHAR(26) UNIQUE NOT NULL` row-handle column, FK constraints, UNIQUE indexes, and the `subjects` / `levels` reference-list seed data are all created by the user against the user-prepared MySQL container (mirrored in `docker/mysql/init/01-schema-and-seed.sql`). The application is read/write at runtime only — `docker compose up` does NOT run any migration step (per FR-016, Session 2026-06-21). The `lib/db/migrations/` directory is out of Stage 1 scope.
- **Validation**: every request body is validated by Joi before any DB call. Joi schemas mirror the typeORM entity columns field-for-field (Constitution Principle VII).
- **API contract**: every response uses the cross-cutting envelope from `specs/003-backend-api-db/spec.md` (`{ "data": [...] }` for lists, `{ "error": "..." }` for errors, `{ "ulid": "..." }` as the first property on every entry — per FR-021). Status-code table is locked to 400 / 404 / 409 / 415 / 500 / 503. All Stage 1 endpoints live under the `/api/v1.0/` version prefix (per FR-022).

### Directory layout

```text
app/
├── api/v1.0/
│   ├── teachers/route.ts        POST + GET /api/v1.0/teachers
│   ├── subjects/route.ts        GET     /api/v1.0/subjects
│   ├── classes/route.ts         POST + GET /api/v1.0/classes
│   └── levels/route.ts          GET     /api/v1.0/levels
├── teachers/                    /teachers + /teachers/add
├── classes/                     /classes + /classes/add
├── layout.tsx, page.tsx, globals.css
components/                      Shared UI primitives (FormField, Button, Select, StateViews)
lib/
├── api/                         response.ts + content-type.ts + route.ts + db-error.ts
├── db/                          entities, repositories (no migrations/)
├── ulid.ts                      generateUlid() — cross-cutting row-handle generator (FR-021)
└── validation/                  Joi schemas (teacher.ts, class.ts)
tests/
├── unit/                        Joi schemas + helpers + ulid.spec.ts
├── contract/                    route-handler contract tests
└── integration/                 full-stack tests against live MySQL
docker/
├── Dockerfile
├── docker-compose.yml           mysql + app (no migration one-shot — per FR-016)
├── docker-compose.test.yml      mysql only, on port 3307, for integration tests
└── mysql/init/01-schema-and-seed.sql
```

---

## API contract

The single source of truth is `specs/003-backend-api-db/contracts/common.yaml`. Per-feature contracts inherit from it. All Stage 1 endpoints live under the `/api/v1.0/` version prefix (per FR-022, Session 2026-06-21).

### Endpoints

| Method | Path | Body / Query | Success | Error codes |
|---|---|---|---|---|
| POST | `/api/v1.0/teachers` | `{ name, subject, email, contactNumber }` | `201` + `Teacher` JSON | 400, 409, 415, 500, 503 |
| GET | `/api/v1.0/teachers` | — | `200` + `{ data: Teacher[] }` | 415, 500, 503 |
| GET | `/api/v1.0/subjects` | — | `200` + `{ data: Subject[] }` | 415, 500, 503 |
| POST | `/api/v1.0/classes` | `{ level, name, teacherEmail }` | `201` + `Class` JSON | 400, 404, 409, 415, 500, 503 |
| GET | `/api/v1.0/classes` | — | `200` + `{ data: Class[] }` | 415, 500, 503 |
| GET | `/api/v1.0/levels` | — | `200` + `{ data: Level[] }` | 415, 500, 503 |

Every entry in every response carries the cross-cutting `ulid` row handle (per FR-021) — a 26-character Crockford Base32 string, server-generated by `lib/ulid.ts` via a typeORM `@BeforeInsert()` hook on every entity.

### Status code table

| Code | When |
|---|---|
| 400 | Validation failure (Joi), unknown subject, unknown level |
| 404 | Teacher not found (`POST /api/v1.0/classes` only) |
| 409 | Duplicate email / class name / form teacher |
| 415 | `Content-Type` is not `application/json` |
| 500 | Unhandled server error (no internal details leaked) |
| 503 | Data store briefly unavailable |

---

## Stage 1 assumptions (per the specs)

- **One role**: Administrator. No auth, no sessions.
- **No pagination**: ≤ 500 teachers / classes per stage. Full list returned.
- **Read-only reference lists**: `subjects` (9) and `levels` (10) are seeded once by the user's SQL against the user-prepared MySQL container; admin authoring is a future-stage feature.
- **No edit / delete**: Create + Read only.
- **Phone format**: exactly 8 digits, digits-only, **no leading-digit restriction** (per FR-004, Session 2026-06-21 — the previous Singapore-mobile `^[89]\d{7}$` pattern was removed). Display format on the table is `XXXX XXXX`.
- **Form Teacher control**: searchable combobox over the existing teachers list.

---

## Validation rules at a glance

- `name` (Teacher): 1..255 chars, required.
- `subject` (Teacher): must match an active entry in `subjects`.
- `email` (Teacher): syntactically valid; **unique across teachers**.
- `contactNumber` (Teacher): exactly 8 digits, digits-only, **no** leading-digit restriction.
- `level` (Class): must match an active entry in `levels`.
- `name` (Class): 1..255 chars; **globally unique**.
- `teacherEmail` (Class): must reference an existing teacher; **unique across classes** (one form teacher per teacher).
