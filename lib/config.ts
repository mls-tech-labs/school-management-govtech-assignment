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
}).unknown(true);

const parsed = schema.validate(process.env, { abortEarly: false, convert: true });
if (parsed.error) {
  // Fail fast — bad config should never reach a request handler.
  throw new Error(
    `Invalid environment configuration: ${parsed.error.message}`,
  );
}

export const config = {
  db: {
    host: parsed.value.DB_HOST,
    port: Number(parsed.value.DB_PORT),
    user: parsed.value.DB_USER,
    password: parsed.value.DB_PASSWORD,
    name: parsed.value.DB_NAME,
  },
  port: Number(parsed.value.PORT),
} as const;

export type AppConfig = typeof config;
