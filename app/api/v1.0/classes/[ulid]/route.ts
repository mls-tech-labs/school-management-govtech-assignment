import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import { withAuth, type AuthedRequest } from "@/lib/auth/middleware";
import {
  findClassByUlid,
  updateClassAndReturnPreviousModifiedAt,
  deleteClassById,
  findClassByFormTeacherId,
} from "@/lib/db/repositories/class";
import { findTeacherById, findTeacherByUlid } from "@/lib/db/repositories/teacher";
import {
  findLevelIdByUlid,
  findLevelById,
} from "@/lib/db/repositories/level";
import {
  putClassRequestSchema,
  deleteClassRequestSchema,
  ulidPathParamSchema,
} from "@/lib/validation/class";

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
    const klass = await findClassByUlid(ulid);
    if (!klass) return jsonError(404, "Class not found");

    const teacher = await findTeacherById(klass.formTeacherId);
    const levelRow = await findLevelById(klass.levelId);

    return jsonOk({
      ulid: klass.ulid,
      level: {
        ulid: levelRow?.ulid ?? "",
        name: levelRow?.name ?? "",
      },
      name: klass.name,
      formTeacher: {
        ulid: teacher?.ulid ?? "",
        name: teacher?.name ?? "",
      },
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
  const { value, error } = putClassRequestSchema.validate(body, {
    abortEarly: false,
  });
  if (error) {
    const first = error.details[0]?.message ?? "Invalid request body";
    return jsonError(400, first);
  }

  const existing = await findClassByUlid(ulid);
  if (!existing) return jsonError(404, "Class not found");

  // (1) level-active.
  const levelId = await findLevelIdByUlid(value.level.ulid);
  if (levelId === null) return jsonError(400, "Invalid level");

  // (2) form-teacher existence.
  const teacher = await findTeacherByUlid(value.formTeacher.ulid);
  if (!teacher) return jsonError(404, "Teacher not found");

  // (3) form-teacher uniqueness vs. a DIFFERENT class.
  if (teacher.id !== existing.formTeacherId) {
    const blocking = await findClassByFormTeacherId(teacher.id);
    if (blocking) return jsonError(409, "Teacher already assigned");
  }

  // (4) class-name uniqueness (row-exclusion self-match).
  if (value.name !== existing.name) {
    const { getDataSource } = await import("@/lib/db/data-source");
    const { Class } = await import("@/lib/db/entities/Class");
    const ds = await getDataSource();
    const dup = await ds
      .getRepository(Class)
      .createQueryBuilder("c")
      .select(["c.id"])
      .where("c.name = :name", { name: value.name })
      .getOne();
    if (dup) return jsonError(409, "Class name already in use");
  }

  try {
    const { klass, previousModifiedAt } =
      await updateClassAndReturnPreviousModifiedAt(existing.id, {
        name: value.name,
        levelId,
        formTeacherId: teacher.id,
      });
    return jsonOk({
      ulid: klass.ulid,
      level: { ulid: value.level.ulid, name: value.level.name ?? "" },
      name: klass.name,
      formTeacher: {
        ulid: teacher.ulid,
        name: teacher.name,
      },
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

  const existing = await findClassByUlid(ulid);
  if (!existing) return jsonError(404, "Class not found");

  try {
    await deleteClassById(existing.id);
    return jsonOk({ ulid: existing.ulid });
  } catch (err) {
    const { status, message } = toApiError(err);
    return jsonError(status, message);
  }
}

// DELETE still validates the empty body.
const handleDeleteWithValidation: CtxHandler = async (req, ctx) => {
  void req.json().catch(() => null);
  const { error } = deleteClassRequestSchema.validate({});
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
