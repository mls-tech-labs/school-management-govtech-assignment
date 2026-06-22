import Joi from "joi";

export const loginRequestSchema = Joi.object({
  username: Joi.string().trim().min(1).max(64).required(),
  password: Joi.string().min(1).max(255).required(),
})
  // No unknown keys — future "rememberMe" etc. must be rejected explicitly.
  .unknown(false)
  .required()
  .messages({
    "string.max": "Username or password is too long",
    "string.min": "Username and password are required",
    "string.empty": "Username and password are required",
    "any.required": "Username and password are required",
    "object.unknown": "Unknown field in request body",
    "object.base": "Request body must be a JSON object",
  });

export interface LoginRequest {
  username: string;
  password: string;
}
