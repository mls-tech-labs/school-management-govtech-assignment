import Joi from "joi";
import {
  singaporeContactNumberSchema,
  SINGAPORE_CONTACT_NUMBER_MESSAGE,
} from "./contact-number";

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
 *   - `contactNumber` (required, Singapore `^[89]\d{7}$` regex — per
 *     `006-teachers-classes-mutations/spec.md` Clarifications Session
 *     2026-06-22 (contact-number rule restoration) + FR-013, restored
 *     from the relaxed `^\d{8}$` pattern in Session 2026-06-21)
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
  contactNumber: singaporeContactNumberSchema,
}).unknown(false);

/**
 * Joi schema for `PUT /api/v1.0/teachers/[ulid]` request body.
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-007: full-resource
 * replacement; every mutable field is required. The shape mirrors
 * `createTeacherRequestSchema` exactly. The `ulid` is taken from the
 * path parameter (per FR-007) and is NOT accepted in the body
 * (`additionalProperties: false`).
 */
export const putTeacherRequestSchema = createTeacherRequestSchema;

/**
 * Joi schema for `DELETE /api/v1.0/teachers/[ulid]` request body.
 *
 * Per Principle VII: Joi MUST validate every payload that crosses a
 * trust boundary; the empty body is the boundary. The schema is an
 * empty-body schema that still runs the validation step and rejects
 * any non-empty body with a schema-level error (per
 * `006-teachers-classes-mutations/data-model.md` §2).
 */
export const deleteTeacherRequestSchema = Joi.object({}).min(0).max(0);

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

export { SINGAPORE_CONTACT_NUMBER_MESSAGE };

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
