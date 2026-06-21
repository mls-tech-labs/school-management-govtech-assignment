/**
 * Shared type aliases for the security-hardening modules.
 *
 * `NodeEnvironment` is the same shape Next.js uses for `process.env.NODE_ENV`,
 * kept loose so `next.config.mjs` (which runs at build time and only has the
 * raw string) can pass `'development' | 'production' | 'test'` through
 * directly without coercion.
 */
export type NodeEnvironment = "development" | "production" | "test";
