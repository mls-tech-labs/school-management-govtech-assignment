import Joi from "joi";

// Tri-state helpers: unset/empty → derive from NODE_ENV; explicit
// `true` / `false` always wins (dev-friendly relaxation over HTTP).
function deriveSecureFlag(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") return process.env.NODE_ENV === "production";
  return raw.toLowerCase() === "true" || raw === "1";
}

const schema = Joi.object({
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(3306),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow("").required(),
  DB_NAME: Joi.string().required(),
  PORT: Joi.number().port().default(3000),

  // Redis is REQUIRED — fail-closed if REDIS_URL is missing.
  REDIS_URL: Joi.string().uri({ scheme: ["redis", "rediss"] }).required(),
  SESSION_COOKIE_NAME: Joi.string().min(1).default("pvt_edu_session"),
  SESSION_COOKIE_SECURE: Joi.boolean().optional(),
  SESSION_TTL_SECONDS: Joi.number().integer().min(1).default(1800),
  LOGIN_REDIRECT_DEFAULT: Joi.string().pattern(/^\//).default("/"),
  PASSWORD_HASH_ALGO: Joi.string().valid("argon2id").default("argon2id"),

  CORS_ALLOWED_ORIGINS: Joi.string().allow("").default(""),
  CORS_ALLOWED_HEADERS: Joi.string().default("Content-Type, X-CSRF-Token"),
  // `script-src 'unsafe-inline'` is required because Next.js App Router
  // does not attach nonces to its own inline scripts (RSC payload +
  // hydration boot). The other directives stay strict.
  CSP_POLICY: Joi.string()
    .allow("")
    .default(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'",
    ),
  CSP_REPORT_ONLY: Joi.boolean().default(false),
  HSTS_ENABLED: Joi.boolean().optional(),
}).unknown(true);

const parsed = schema.validate(process.env, { abortEarly: false, convert: true });
if (parsed.error) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const sessionSecure = deriveSecureFlag(process.env.SESSION_COOKIE_SECURE);
const hstsEnabled =
  process.env.HSTS_ENABLED === undefined || process.env.HSTS_ENABLED === ""
    ? process.env.NODE_ENV === "production"
    : process.env.HSTS_ENABLED.toLowerCase() === "true" || process.env.HSTS_ENABLED === "1";

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
