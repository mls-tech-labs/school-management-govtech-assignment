# `docker/` — local MySQL for the Private Education Admin project

Brings up the data store that the Teachers and Classes features read from /
write to.

## What this gives you

A MySQL 8 container (`pvt-edu-mysql`) exposing `localhost:3306` with the
project's 4 tables and reference-list seeds already in place:

- `subjects` — 9 rows (English, Mathematics, Science, Chinese, Malay, Tamil, Art, Music, Physical Education)
- `levels`   — 10 rows (Primary 1–6, Secondary 1–4)
- `teachers` — empty (created via `POST /api/v1.0/teachers`)
- `classes`  — empty (created via `POST /api/v1.0/classes`)

Schema name: `admin`. Default root password: `rootpass` (override via
`MYSQL_ROOT_PASSWORD` env var).

## Usage

```bash
# from the repo root
docker compose -f docker/docker-compose.yml up -d

# verify the schema + seeds
docker compose -f docker/docker-compose.yml exec mysql \
  mysql -uroot -prootpass admin \
  -e "SHOW TABLES; SELECT COUNT(*) AS n_subjects FROM subjects; SELECT COUNT(*) AS n_levels FROM levels;"
# expect: 4 tables, 9 subjects, 10 levels

# stop (keep the data)
docker compose -f docker/docker-compose.yml down

# stop AND wipe the data (drops the named volume)
docker compose -f docker/docker-compose.yml down -v
```

## Files

| Path | Purpose |
|---|---|
| `docker-compose.yml` | The single service: `mysql` (image `mysql:8.0`), port 3306, named volume, healthcheck. |
| `mysql/init/01-schema-and-seed.sql` | Idempotent DDL + seed. Auto-runs on first boot from `/docker-entrypoint-initdb.d`. Safe to re-run. |

## Idempotency

Every `CREATE TABLE` uses `IF NOT EXISTS` and every seed uses `INSERT IGNORE`,
so this script is safe to run on a populated database — matches the
`specs/003-backend-api-db/spec.md` FR-016 / FR-017 idempotency contract.

## Schema source-of-truth note

The schema in `mysql/init/01-schema-and-seed.sql` mirrors
`specs/001-teachers/data-model.md` and `specs/002-classes/data-model.md`
exactly. When those specs change, update this SQL file to keep them in
lockstep.

Per `specs/003-backend-api-db/spec.md` FR-016 (Session 2026-06-21), the
typeORM migrations path (`lib/db/migrations/`, `typeorm-ts-node-commonjs
migration:run`, the `migration` one-shot service in `docker-compose.yml`,
and the `migration:run` / `migration:revert` / `db:rebuild` npm scripts)
are all **removed from Stage 1**. The user-prepared MySQL container owns
the schema — the application is read/write at runtime only. This SQL file
is therefore the canonical source of truth for the Stage 1 schema, not a
"bootstrap until the app code is written" placeholder.

## Reference values

`subjects` and `levels` seed lists match the ratified specs. The UI mockup at
`requirements/designs/classes/Fields.png` shows different labels
("English Language", "Mother Tongue Language", and 6 Primary levels only);
those predate the spec ratification and are intentionally not used here.