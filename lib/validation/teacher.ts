import Joi from "joi";
import {
  singaporeContactNumberSchema,
  SINGAPORE_CONTACT_NUMBER_MESSAGE,
} from "./contact-number";

const ULID_PATTERN = "^[0-9A-HJKMNP-TV-Z]{26}$";

export const createTeacherRequestSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  subject: Joi.object({
    ulid: Joi.string().pattern(new RegExp(ULID_PATTERN)).required(),
    name: Joi.string().min(1).max(64).optional(),
  })
    .required()
    .unknown(false),
  email: Joi.string().trim().lowercase().email({ tlds: false }).max(254).required(),
  contactNumber: singaporeContactNumberSchema,
}).unknown(false);

// PUT is full-resource replacement — same shape as POST.
export const putTeacherRequestSchema = createTeacherRequestSchema;

// Empty-body schema still validates the trust boundary.
export const deleteTeacherRequestSchema = Joi.object({}).min(0).max(0);

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

// Legacy alias kept so callers that still `await` this function
// (returning a Promise from an older build) keep working.
export async function buildCreateTeacherSchema() {
  return createTeacherRequestSchema;
}
