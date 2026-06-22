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
 * GET `/api/v1.0/classes/[ulid]` — single-resource read.
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-003 + the
 * constitution v2.6.0 amendment: the data source for the Edit Class
 * page (RSC → GET pivot). Returns the row in the same shape as a
 * single entry in `GET /api/v1.0/classes`. On an unknown `ulid`,
 * returns `404 Not Found` with `{ "error": "Class not found" }`.
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
    const klass = await findClassByUlid(validated);
    if (!klass) return jsonError(404, "Class not found");

    // `klass.formTeacherId` and `klass.levelId` are surrogate FKs
    // (per FR-019), not ulids — so we look both up by id.
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

/**
 * PUT `/api/v1.0/classes/[ulid]` — full-resource UPDATE.
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-008:
 *   - Re-runs every POST-side invariant: level-active,
 *     form-teacher-existence, form-teacher-uniqueness against a
 *     DIFFERENT class (row-exclusion self-match per Q1), and
 *     class-name-uniqueness (row-exclusion self-match).
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
  const { value, error } = putClassRequestSchema.validate(body, {
    abortEarly: false,
  });
  if (error) {
    const first = error.details[0]?.message ?? "Invalid request body";
    return jsonError(400, first);
  }

  const existing = await findClassByUlid(validatedUlid);
  if (!existing) return jsonError(404, "Class not found");

  // (1) level-active.
  const levelId = await findLevelIdByUlid(value.level.ulid);
  if (levelId === null) return jsonError(400, "Invalid level");

  // (2) form-teacher existence (FR-004, 002-classes).
  const teacher = await findTeacherByUlid(value.formTeacher.ulid);
  if (!teacher) return jsonError(404, "Teacher not found");

  // (3) form-teacher uniqueness against a DIFFERENT class
  //     (row-exclusion self-match rule).
  if (teacher.id !== existing.formTeacherId) {
    const blocking = await findClassByFormTeacherId(teacher.id);
    if (blocking) {
      return jsonError(409, "Teacher already assigned");
    }
  }

  // (4) class-name uniqueness (row-exclusion self-match rule).
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

/**
 * DELETE `/api/v1.0/classes/[ulid]` — hard delete.
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-010:
 *   - Unconstrained at the database layer (no other table references
 *     `classes.id` outside the audit columns per Principle X.2).
 *   - On success, returns 200 with `{ "ulid": "<deleted-class-ulid>" }`.
 *   - On a second DELETE (or unknown `ulid`), returns 404 with
 *     `{ "error": "Class not found" }` (idempotent per Principle X.2).
 */
async function handleDelete(
  _req: AuthedRequest,
  ctx?: RouteCtx,
): Promise<Response> {
  const { ulid } = (await ctx?.params) ?? ({} as { ulid?: string });
  if (!ulid) return jsonError(400, "Invalid ulid path parameter");
  const validatedUlid = validateUlid(ulid);
  if (typeof validatedUlid !== "string") return validatedUlid;

  const existing = await findClassByUlid(validatedUlid);
  if (!existing) return jsonError(404, "Class not found");

  try {
    await deleteClassById(existing.id);
    return jsonOk({ ulid: existing.ulid });
  } catch (err) {
    const { status, message } = toApiError(err);
    return jsonError(status, message);
  }
}

// DELETE still validates the empty body (per Principle VII).
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