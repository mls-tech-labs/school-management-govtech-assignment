import Joi from "joi";

/**
 * Runtime application configuration, validated with Joi at module load.
 * Throws a clear error on misconfiguration rather than failing later at runtime.
 */
const schema = Joi.object({
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(3306),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow("").required(),
  DB_NAME: Joi.string().required(),
  PORT: Joi.number().port().default(3000),

  // ─── Stage 2 (004-user-auth) ────────────────────────────────────────────
  // Redis is REQUIRED — fail-closed per spec FR-013. If a future operator
  // removes `REDIS_URL` from their env, the boot MUST refuse to start
  // rather than silently falling back to a no-session-store mode.
  REDIS_URL: Joi.string().uri({ scheme: ["redis", "rediss"] }).required(),
  SESSION_COOKIE_NAME: Joi.string().min(1).default("pvt_edu_session"),
  // Tri-state: when unset we derive from NODE_ENV at module load (production
  // = secure, dev = not secure). An explicit `true` / `false` always wins.
  SESSION_COOKIE_SECURE: Joi.boolean().optional(),
  SESSION_TTL_SECONDS: Joi.number().integer().min(1).default(1800),
  LOGIN_REDIRECT_DEFAULT: Joi.string().pattern(/^\//).default("/"),
  PASSWORD_HASH_ALGO: Joi.string().valid("argon2id").default("argon2id"),

  // ─── Stage 2 (005-security-hardening) ───────────────────────────────────
  CORS_ALLOWED_ORIGINS: Joi.string().allow("").default(""),
  CORS_ALLOWED_HEADERS: Joi.string()
    .default("Content-Type, X-CSRF-Token"),
  CSP_POLICY: Joi.string()
    .allow("")
    .default(
      // `script-src` includes `'unsafe-inline'` because Next.js
      // App Router does NOT attach a nonce or hash to its own
      // inline scripts (RSC payload + hydration boot). A strict
      // `script-src 'self'` would block the page from rendering.
      // The other directives (style-src, frame-ancestors,
      // object-src, form-action, base-uri, connect-src) stay
      // strict so clickjacking, <object> XSS, form-jacking,
      // <base href> attacks, and unauthorized exfiltration are
      // still blocked. XSS via `script-src` is mitigated by
      // React's built-in escaping + the rest of the CSP. See
      // `.env.example` for the full trade-off note.
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'",
    ),
  CSP_REPORT_ONLY: Joi.boolean().default(false),
  // Tri-state — same convention as SESSION_COOKIE_SECURE. Empty string is
  // interpreted as "derive from NODE_ENV".
  HSTS_ENABLED: Joi.boolean().optional(),
}).unknown(true);

const parsed = schema.validate(process.env, { abortEarly: false, convert: true });
if (parsed.error) {
  // Fail fast — bad config should never reach a request handler.
  throw new Error(
    `Invalid environment configuration: ${parsed.error.message}`,
  );
}

const rawEnv = process.env;

/**
 * `NODE_ENV === 'production'` is the default for the secure-by-default
 * posture. An explicit env var always wins (per Principle IV's
 * environment-driven relaxation for local dev over HTTP).
 */
function deriveSecureFlag(raw: string | undefined): boolean {
  if (raw === undefined) return rawEnv.NODE_ENV === "production";
  if (raw === "") return rawEnv.NODE_ENV === "production";
  return raw.toLowerCase() === "true" || raw === "1";
}

const sessionSecure = deriveSecureFlag(rawEnv.SESSION_COOKIE_SECURE);
const hstsEnabled =
  rawEnv.HSTS_ENABLED === undefined || rawEnv.HSTS_ENABLED === ""
    ? rawEnv.NODE_ENV === "production"
    : rawEnv.HSTS_ENABLED.toLowerCase() === "true" || rawEnv.HSTS_ENABLED === "1";

export const config = {
  db: {
    host: parsed.value.DB_HOST,
    port: Number(parsed.value.DB_PORT),
    user: parsed.value.DB_USER,
    password: parsed.value.DB_PASSWORD,
    name: parsed.value.DB_NAME,
  },
  port: Number(parsed.value.PORT),
  auth: {
    redisUrl: parsed.value.REDIS_URL,
    sessionCookieName: parsed.value.SESSION_COOKIE_NAME,
    sessionCookieSecure: sessionSecure,
    sessionTtlSeconds: Number(parsed.value.SESSION_TTL_SECONDS),
    loginRedirectDefault: parsed.value.LOGIN_REDIRECT_DEFAULT,
    passwordHashAlgo: parsed.value.PASSWORD_HASH_ALGO,
  },
  security: {
    corsAllowedOrigins: parsed.value.CORS_ALLOWED_ORIGINS,
    corsAllowedHeaders: parsed.value.CORS_ALLOWED_HEADERS,
    cspPolicy: parsed.value.CSP_POLICY,
    cspReportOnly: Boolean(parsed.value.CSP_REPORT_ONLY),
    hstsEnabled,
  },
} as const;

export type AppConfig = typeof config;
