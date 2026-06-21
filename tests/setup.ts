/**
 * Vitest setup — populate the env vars required by `lib/config.ts`
 * BEFORE any test imports `lib/config.ts` (directly or transitively).
 *
 * The runtime config Joi schema requires `DB_HOST`, `DB_USER`,
 * `DB_PASSWORD`, `DB_NAME`, and (Stage 2) `REDIS_URL`. The unit
 * tier never opens a real DB or Redis connection, so the values
 * can be inert (matching the existing `tests/.env` patterns from
 * Stage 1).
 */
process.env.DB_HOST ??= "localhost";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "test";
process.env.DB_PASSWORD ??= "test";
process.env.DB_NAME ??= "test";
process.env.REDIS_URL ??= "redis://localhost:6379";
(process.env as Record<string, string>).NODE_ENV ??= "test";
