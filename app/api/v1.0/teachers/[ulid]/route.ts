import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import { withAuth, type AuthedRequest } from "@/lib/auth/middleware";
import {
  findTeacherByUlid,
  findSubjectByUlid,
  updateTeacherAndReturnPreviousModifiedAt,
  deleteTeacherById,
} from "@/lib/db/repositories/teacher";
import { findClassByFormTeacherId } from "@/lib/db/repositories/class";
import {
  putTeacherRequestSchema,
  deleteTeacherRequestSchema,
  ulidPathParamSchema,
} from "@/lib/validation/teacher";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ ulid: string }> };
type CtxHandler = (req: AuthedRequest, ctx?: RouteCtx) => Promise<Response>;

/**
 * Validate the `[ulid]` path parameter against the cross-cutting ULID
 * rule. Returns the cleaned ulid on success or a 400 response.
 */
function validateUlid(ulid: string): string | Response {
  const { value, error } = ulidPathParamSchema.validate(ulid);
  if (error) return jsonError(400, "Invalid ulid path parameter");
  return value;
}

/**
 * GET `/api/v1.0/teachers/[ulid]` — single-resource read.
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-002 + the
 * constitution v2.6.0 amendment: the data source for the Edit Teacher
 * page (RSC → GET pivot). Returns the row in the same shape as a
 * single entry in `GET /api/v1.0/teachers`. On an unknown `ulid`,
 * returns `404 Not Found` with `{ "error": "Teacher not found" }`.
 */
async function handleGet(
  _req: AuthedRequest,
  ctx?: RouteCtx,
): Promise<Response> {
  const { ulid } = (await ctx?.params) ?? ({} as { ulid?: string });
  if (!ulid) return jsonError(400, "Invalid ulid path parameter");
  const validated = validateUlid(ulid);
  if (typeof validated !== "string") return validated;

  try {
    const teacher = await findTeacherByUlid(validated);
    if (!teacher) return jsonError(404, "Teacher not found");

    const subject = await findSubjectByUlid(teacher.subjectId);
    return jsonOk({
      ulid: teacher.ulid,
      name: teacher.name,
      subject: {
        ulid: subject?.ulid ?? "",
        name: subject?.name ?? "",
      },
      email: teacher.email,
      contactNumber: teacher.contactNumber,
    });
  } catch (err) {
    const { status, message } = toApiError(err);
    return jsonError(status, message);
  }
}

/**
 * PUT `/api/v1.0/teachers/[ulid]` — full-resource UPDATE.
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-007:
 *   - Re-runs every POST-side invariant: subject-active, email-unique
 *     (with the row-exclusion self-match rule per Clarifications Q1),
 *     Singapore `^[89]\d{7}$` contact-number rule.
 *   - Returns 200 with the updated row in the GET-list shape PLUS a
 *     sibling `previousModifiedAt` field per FR-007 / FR-016.
 */
async function handlePut(
  req: AuthedRequest,
  ctx?: RouteCtx,
): Promise<Response> {
  const { ulid } = (await ctx?.params) ?? ({} as { ulid?: string });
  if (!ulid) return jsonError(400, "Invalid ulid path parameter");
  const validatedUlid = validateUlid(ulid);
  if (typeof validatedUlid !== "string") return validatedUlid;

  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") {
    return jsonError(400, "Request body must be valid JSON");
  }
  const { value, error } = putTeacherRequestSchema.validate(body, {
    abortEarly: false,
  });
  if (error) {
    const first = error.details[0]?.message ?? "Invalid request body";
    return jsonError(400, first);
  }

  const existing = await findTeacherByUlid(validatedUlid);
  if (!existing) return jsonError(404, "Teacher not found");

  // Re-run POST-side invariants.
  // (1) subject-active.
  const subject = await findSubjectByUlid(value.subject.ulid);
  if (!subject) return jsonError(400, "Invalid subject");

  // (2) email-unique with row-exclusion self-match (FR-007 / Q1).
  if (value.email !== existing.email) {
    const { getDataSource } = await import("@/lib/db/data-source");
    const { Teacher } = await import("@/lib/db/entities/Teacher");
    const ds = await getDataSource();
    const dup = await ds.getRepository(Teacher).findOne({
      where: { email: value.email },
      select: { id: true },
    });
    if (dup) return jsonError(409, "Email already in use");
  }

  try {
    const { teacher, previousModifiedAt } =
      await updateTeacherAndReturnPreviousModifiedAt(existing.id, {
        name: value.name,
        subjectId: subject.id,
        email: value.email,
        contactNumber: value.contactNumber,
      });
    return jsonOk({
      ulid: teacher.ulid,
      name: teacher.name,
      subject: { ulid: subject.ulid, name: subject.name },
      email: teacher.email,
      contactNumber: teacher.contactNumber,
      previousModifiedAt: previousModifiedAt.toISOString(),
    });
  } catch (err) {
    const { status, message } = toApiError(err);
    return jsonError(status, message);
  }
}

/**
 * DELETE `/api/v1.0/teachers/[ulid]` — hard delete with form-teacher
 * referential integrity guard.
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-009:
 *   - Reject with 409 + singular envelope when the teacher is currently
 *     a form teacher of a class.
 *   - On success, return 200 with `{ "ulid": "<deleted-teacher-ulid>" }`.
 *   - On a second DELETE (or unknown `ulid`), return 404 with
 *     `{ "error": "Teacher not found" }` (idempotent per Principle X.2).
 */
async function handleDelete(
  _req: AuthedRequest,
  ctx?: RouteCtx,
): Promise<Response> {
  const { ulid } = (await ctx?.params) ?? ({} as { ulid?: string });
  if (!ulid) return jsonError(400, "Invalid ulid path parameter");
  const validatedUlid = validateUlid(ulid);
  if (typeof validatedUlid !== "string") return validatedUlid;

  const existing = await findTeacherByUlid(validatedUlid);
  if (!existing) return jsonError(404, "Teacher not found");

  // Form-teacher referential integrity guard (FR-009).
  const blockingClass = await findClassByFormTeacherId(existing.id);
  if (blockingClass) {
    return jsonError(
      409,
      `Teacher is assigned as form teacher of class "${blockingClass.name}". Reassign or delete that class first.`,
      { classUlid: blockingClass.ulid, className: blockingClass.name },
    );
  }

  try {
    await deleteTeacherById(existing.id);
    return jsonOk({ ulid: existing.ulid });
  } catch (err) {
    const { status, message } = toApiError(err);
    return jsonError(status, message);
  }
}

// DELETE still validates the empty body (per Principle VII).
const handleDeleteWithValidation: CtxHandler = async (req, ctx) => {
  void req.json().catch(() => null);
  const { error } = deleteTeacherRequestSchema.validate({});
  if (error) return jsonError(400, "Invalid request body");
  return handleDelete(req, ctx);
};

const get = withApiContract(withAuth<RouteCtx>(handleGet));
const put = withApiContract(withAuth<RouteCtx>(handlePut));
const del = withApiContract(withAuth<RouteCtx>(handleDeleteWithValidation));

export async function GET(req: NextRequest, ctx: RouteCtx) {
  return get(req as AuthedRequest, ctx);
}
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  return put(req as AuthedRequest, ctx);
}
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  return del(req as AuthedRequest, ctx);
}