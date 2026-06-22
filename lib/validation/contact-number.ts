import Joi from "joi";

/**
 * Singapore mobile-phone contact-number rule — shared between
 * `001-teachers` (POST, Add Teacher) and `006-teachers-classes-mutations`
 * (PUT, Edit Teacher) per `specs/006-teachers-classes-mutations/spec.md`
 * Clarifications Session 2026-06-22 (contact-number rule restoration) +
 * FR-013.
 *
 * The rule: the value MUST match `^[89]\d{7}$` — exactly 8 digits, must
 * start with `8` or `9`. This is the canonical Singapore-mobile leading-
 * digit assumption reinstated from the relaxed `^\d{8}$` pattern in
 * `001-teachers/spec.md` Clarifications Session 2026-06-21.
 *
 * The Joi extension below is the single source of truth; both the 001
 * POST path and the 006 PUT path consume the same `singaporeContactNumberSchema`.
 */
export const SINGAPORE_CONTACT_NUMBER_REGEX = /^[89]\d{7}$/;

export const SINGAPORE_CONTACT_NUMBER_MESSAGE =
  "Contact number must start with 8 or 9 and be 8 digits.";

/**
 * Standalone Joi schema for the Teacher `contactNumber` field. Use this
 * wherever the Singapore regex applies; do NOT inline a regex pattern in
 * a per-endpoint schema.
 */
export const singaporeContactNumberSchema = Joi.string()
  .pattern(SINGAPORE_CONTACT_NUMBER_REGEX)
  .required()
  .messages({
    "string.pattern.base": SINGAPORE_CONTACT_NUMBER_MESSAGE,
  });