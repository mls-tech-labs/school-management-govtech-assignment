import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import { withAuth, type AuthedRequest } from "@/lib/auth/middleware";
import {
  findTeacherByUlid,
  findSubjectById,
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

function validateUlid(ulid: string): string | Response {
  const { value, error } = ulidPathParamSchema.validate(ulid);
  if (error) return jsonError(400, "Invalid ulid path parameter");
  return value;
}

async function getUlid(ctx?: RouteCtx): Promise<string | Response> {
  const { ulid } = (await ctx?.params) ?? ({} as { ulid?: string });
  if (!ulid) return jsonError(400, "Invalid ulid path parameter");
  return validateUlid(ulid);
}

async function handleGet(
  _req: AuthedRequest,
  ctx?: RouteCtx,
): Promise<Response> {
  const ulid = await getUlid(ctx);
  if (typeof ulid !== "string") return ulid;

  try {
    const teacher = await findTeacherByUlid(ulid);
    if (!teacher) return jsonError(404, "Teacher not found");

    // Resolve the joined subject's ulid+name via the surrogate FK.
    const subject = await findSubjectById(teacher.subjectId);
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

async function handlePut(
  req: AuthedRequest,
  ctx?: RouteCtx,
): Promise<Response> {
  const ulid = await getUlid(ctx);
  if (typeof ulid !== "string") return ulid;

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

  const existing = await findTeacherByUlid(ulid);
  if (!existing) return jsonError(404, "Teacher not found");

  // Re-run POST-side invariants.
  const subject = await findSubjectByUlid(value.subject.ulid);
  if (!subject) return jsonError(400, "Invalid subject");

  // Email uniqueness with row-exclusion self-match.
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

async function handleDelete(
  _req: AuthedRequest,
  ctx?: RouteCtx,
): Promise<Response> {
  const ulid = await getUlid(ctx);
  if (typeof ulid !== "string") return ulid;

  const existing = await findTeacherByUlid(ulid);
  if (!existing) return jsonError(404, "Teacher not found");

  // Form-teacher referential integrity guard.
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

// DELETE still validates the empty body.
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
