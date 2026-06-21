import Joi from "joi";

/**
 * Joi schema for `POST /api/v1.0/classes` request body.
 *
 * Per `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
 * (POST/GET reference object shape), reference fields on the wire are
 * nested `{ ulid, name }` objects. The schema validates:
 *   - `level.ulid` (required, 26-char Crockford Base32)
 *   - `level.name` (optional, display hint, ignored server-side)
 *   - `formTeacher.ulid` (required, 26-char Crockford Base32)
 *   - `formTeacher.name` (optional, display hint, ignored server-side)
 *   - `name` (required, 1..255, globally unique per FR-005c)
 *
 * Per Principle VII, mirrors the `Class` entity columns field-for-field.
 * The `level.ulid` is resolved to `levels.id` by the route handler
 * via `findLevelIdByUlid` (against `uq_levels_ulid`); unknown /
 * inactive values are rejected with `400 Bad Request` +
 * `{ "error": "Invalid level" }` per FR-013. The `formTeacher.ulid`
 * is resolved to `teachers.id` via `findTeacherByUlid` (against
 * `uq_teachers_ulid`); unknown values are rejected with
 * `404 Not Found` + `{ "error": "Teacher not found" }` per FR-013
 * (covers the race where a teacher is removed between page load and
 * submit).
 */
const ULID_PATTERN = "^[0-9A-HJKMNP-TV-Z]{26}$";

export const createClassRequestSchema = Joi.object({
  level: Joi.object({
    ulid: Joi.string().pattern(new RegExp(ULID_PATTERN)).required(),
    name: Joi.string().min(1).max(64).optional(),
  })
    .required()
    .unknown(false),
  name: Joi.string().trim().min(1).max(255).required(),
  formTeacher: Joi.object({
    ulid: Joi.string().pattern(new RegExp(ULID_PATTERN)).required(),
    name: Joi.string().min(1).max(255).optional(),
  })
    .required()
    .unknown(false),
}).unknown(false);

export type CreateClassRequest = {
  level: { ulid: string; name?: string };
  name: string;
  formTeacher: { ulid: string; name?: string };
};

/**
 * Backwards-compatible alias — the previous build returned a Promise
 * (it pre-loaded the active level names list before building the Joi
 * schema). With the new wire shape the lookup is by `ulid` (not by
 * `name`), so the schema is static and a Promise is no longer
 * required. Callers that still `await` this function (the legacy
 * route handler signature) keep working.
 *
 * @deprecated Use `createClassRequestSchema` directly.
 */
export async function buildCreateClassSchema() {
  return createClassRequestSchema;
}
