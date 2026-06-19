import Joi from "joi";
import { getActiveLevelNames } from "@/lib/db/repositories/level";

/**
 * Joi schema for `POST /api/v1.0/classes` request body.
 *
 * Per Principle VII, mirrors the `Class` entity columns field-for-field:
 *   - level: required, must be in the active `levels` reference list
 *   - name: required, 1..255
 *   - teacherEmail: required, syntactically valid email
 *
 * The `teacherEmail` → `Teacher` existence check is performed in the route
 * handler (after Joi, before insert) so the route can distinguish
 * `404 "Teacher not found"` from `409 "Teacher already assigned"`.
 */
export async function buildCreateClassSchema() {
  const levels = await getActiveLevelNames();
  return Joi.object({
    level: Joi.string()
      .valid(...levels)
      .required(),
    name: Joi.string().trim().min(1).max(255).required(),
    teacherEmail: Joi.string()
      .trim()
      .lowercase()
      .email({ tlds: false })
      .max(254)
      .required(),
  }).unknown(false);
}
