import Joi from "joi";

/**
 * Joi schema for `POST /api/v1.0/teachers` request body.
 *
 * Per `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
 * (POST/GET reference object shape), reference fields on the wire are
 * nested `{ ulid, name }` objects. The schema validates:
 *   - `subject.ulid` (required, 26-char Crockford Base32)
 *   - `subject.name` (optional, display hint, ignored server-side per
 *     Clarifications, Session 2026-06-20)
 *   - `name` (required, 1..255)
 *   - `email` (required, syntactically valid, max 254)
 *   - `contactNumber` (required, exactly 8 digits, digits-only, **no**
 *     leading-digit restriction — per FR-004, Session 2026-06-21)
 *
 * Per Principle VII, mirrors the `Teacher` entity columns field-for-field.
 * The subject `ulid` is resolved to `subjects.id` by the route handler
 * via `findSubjectIdByUlid` (against `uq_subjects_ulid`); an unknown or
 * inactive `subject.ulid` is rejected with `400 Bad Request` +
 * `{ "error": "Invalid subject" }` per FR-013.
 */
const ULID_PATTERN = "^[0-9A-HJKMNP-TV-Z]{26}$";

export const createTeacherRequestSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  subject: Joi.object({
    ulid: Joi.string().pattern(new RegExp(ULID_PATTERN)).required(),
    name: Joi.string().min(1).max(64).optional(),
  })
    .required()
    // Allow either { ulid, name } or { ulid } (name is optional per
    // Session 2026-06-20). additionalProperties:false blocks typos
    // like { ulid, label } or { ulid, title }.
    .unknown(false),
  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: false })
    .max(254)
    .required(),
  contactNumber: Joi.string()
    .pattern(/^\d{8}$/)
    .required(),
}).unknown(false);

export type CreateTeacherRequest = {
  name: string;
  subject: { ulid: string; name?: string };
  email: string;
  contactNumber: string;
};

/**
 * Backwards-compatible alias — the previous build returned a Promise
 * (it pre-loaded the active subject names list before building the
 * Joi schema). With the new wire shape the lookup is by `ulid` (not
 * by `name`), so the schema is static and a Promise is no longer
 * required. Callers that still `await` this function (the legacy
 * route handler signature) keep working.
 *
 * @deprecated Use `createTeacherRequestSchema` directly.
 */
export async function buildCreateTeacherSchema() {
  return createTeacherRequestSchema;
}
