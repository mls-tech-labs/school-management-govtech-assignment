import { defineConfig } from "vitest/config";

/**
 * Vitest config — per `lib/config.ts`, the runtime config Joi
 * schema requires `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`,
 * and (Stage 2) `REDIS_URL` at module-load time. We populate
 * dummy values via `setupFiles` so the test environment can
 * import `lib/config.ts` (and therefore everything that depends
 * on it, including `lib/auth/cookie.ts` and `lib/auth/session.ts`)
 * without crashing.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.spec.ts",
      "tests/contract/**/*.spec.ts",
      "tests/integration/**/*.spec.ts",
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
});
