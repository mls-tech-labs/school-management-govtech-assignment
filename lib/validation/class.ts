import Joi from "joi";

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

// PUT is full-resource replacement — same shape as POST.
export const putClassRequestSchema = createClassRequestSchema;

// Empty-body schema still validates the trust boundary.
export const deleteClassRequestSchema = Joi.object({}).min(0).max(0);

export const ulidPathParamSchema = Joi.string()
  .length(26)
  .pattern(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  .required();

export type CreateClassRequest = {
  level: { ulid: string; name?: string };
  name: string;
  formTeacher: { ulid: string; name?: string };
};

// Legacy alias — see teacher.ts.
export async function buildCreateClassSchema() {
  return createClassRequestSchema;
}
