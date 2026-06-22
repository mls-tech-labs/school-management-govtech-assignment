import Joi from "joi";

// Singapore mobile-phone rule: exactly 8 digits, must start with 8 or 9.
export const SINGAPORE_CONTACT_NUMBER_REGEX = /^[89]\d{7}$/;

export const SINGAPORE_CONTACT_NUMBER_MESSAGE =
  "Contact number must start with 8 or 9 and be 8 digits.";

export const singaporeContactNumberSchema = Joi.string()
  .pattern(SINGAPORE_CONTACT_NUMBER_REGEX)
  .required()
  .messages({
    "string.pattern.base": SINGAPORE_CONTACT_NUMBER_MESSAGE,
  });
