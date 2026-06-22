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
 * Joi schema for `PUT /api/v1.0/classes/[ulid]` request body.
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-008: full-resource
 * replacement; every mutable field is required. The shape mirrors
 * `createClassRequestSchema` exactly.
 *
 * Row-exclusion self-match semantics on `name` and `formTeacher.ulid`
 * are enforced application-side by the PUT handler (it queries
 * `WHERE name = ? AND id != <class.id>` and
 * `WHERE form_teacher_id = ? AND id != <class.id>`); the Joi schema
 * just validates the shape — collision vs. a different row is a 409,
 * the same value as the row itself is a no-op 200.
 */
export const putClassRequestSchema = createClassRequestSchema;

/**
 * Joi schema for `DELETE /api/v1.0/classes/[ulid]` request body.
 *
 * Per Principle VII: Joi MUST validate every payload that crosses a
 * trust boundary; the empty body is the boundary. The schema is an
 * empty-body schema that still runs the validation step and rejects
 * any non-empty body with a schema-level error (per
 * `006-teachers-classes-mutations/data-model.md` §3).
 */
export const deleteClassRequestSchema = Joi.object({}).min(0).max(0);

/**
 * Joi schema for the `[ulid]` path parameter on every Stage 3
 * single-resource endpoint (GET / PUT / DELETE). 26-character Crockford
 * Base32, matching the cross-cutting ULID rule from
 * `003-backend-api-db/spec.md` FR-021.
 */
export const ulidPathParamSchema = Joi.string()
  .length(26)
  .pattern(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  .required();

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
