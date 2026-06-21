import Joi from "joi";

/**
 * Login request schema — the ONLY entry point through which a
 * username + password pair enters the credential-verification path.
 *
 * Per Constitution Principle VII, the schema mirrors the `users`
 * entity column-for-column:
 *   - `username`  → `users.username VARCHAR(64)` — required, ≤ 64 chars
 *   - `password`  → `users.password VARCHAR(255)` — required, ≤ 255 chars
 *
 * `additionalProperties(false)` rejects unknown keys (defense
 * against future "rememberMe" or other implicit fields — see spec
 * Edge Cases). The body MUST be a JSON object with EXACTLY these
 * two keys, no more, no less.
 *
 * Joi runs BEFORE any credential verification, typeORM call, or
 * persistence write (per Principle VII). A validation failure
 * returns `400 Bad Request` with a structured error envelope.
 */
export const loginRequestSchema = Joi.object({
  username: Joi.string().trim().min(1).max(64).required(),
  password: Joi.string().min(1).max(255).required(),
})
  // Per spec FR-006 + Edge Cases: no unknown keys. A request body
  // with `rememberMe`, `csrfToken`, or any other implicit field
  // is rejected with 400 before any database access.
  .unknown(false)
  .required()
  .messages({
    "string.max": "Username or password is too long",
    "string.min": "Username and password are required",
    "string.empty": "Username and password are required",
    "any.required": "Username and password are required",
    "object.unknown": "Unknown field in request body",
    "object.base": "Request body must be a JSON object",
  });

/**
 * Result type that route handlers consume.
 */
export interface LoginRequest {
  username: string;
  password: string;
}
