import Joi from "joi";
import { getActiveSubjectNames } from "@/lib/db/repositories/subject";

/**
 * Joi schema for `POST /api/v1.0/teachers` request body.
 *
 * Per Principle VII, mirrors the `Teacher` entity columns field-for-field:
 *   - name: required, 1..255
 *   - subject: required, must be in the active `subjects` reference list
 *   - email: required, syntactically valid, max 254, lowercased + trimmed
 *   - contactNumber: required, exactly 8 digits, digits-only, **no**
 *     leading-digit restriction (per `specs/001-teachers/spec.md`
 *     FR-004, Session 2026-06-21 — the previous Singapore-mobile
 *     `^[89]\d{7}$` pattern was removed).
 *
 * `subject` is validated against the live, active subjects list at request
 * time (rather than a closed enum baked into the schema) so the form
 * stays in sync with `GET /api/v1.0/subjects` if the seed list ever changes.
 */
export async function buildCreateTeacherSchema() {
  const subjects = await getActiveSubjectNames();
  return Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    subject: Joi.string()
      .valid(...subjects)
      .required(),
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
}
