import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import {
  createClass,
  listClassesWithFormTeacher,
} from "@/lib/db/repositories/class";
import { findTeacherByEmail } from "@/lib/db/repositories/teacher";
import { findLevelIdByName } from "@/lib/db/repositories/level";
import { buildCreateClassSchema } from "@/lib/validation/class";

export const dynamic = "force-dynamic";

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") {
    return jsonError(400, "Request body must be valid JSON");
  }
  const schema = await buildCreateClassSchema();
  const { value, error } = schema.validate(body, { abortEarly: false });
  if (error) {
    const first = error.details[0]?.message ?? "Invalid request body";
    return jsonError(400, first);
  }

  // Per FR-019: resolve natural keys to FK ids.
  // - `level` (levels.name) → level_id (FK → levels.id)
  // - `teacherEmail` (teachers.email) → form_teacher_id (FK → teachers.id)
  //
  // Pre-INSERT teacher existence check distinguishes `404 Teacher not
  // found` from `409 Teacher already assigned` (the DB returns the
  // latter for the form-teacher race; the FK is the backstop).
  const teacher = await findTeacherByEmail(value.teacherEmail);
  if (!teacher) {
    return jsonError(404, "Teacher not found");
  }
  const levelId = await findLevelIdByName(value.level);
  if (levelId === null) {
    return jsonError(400, `Unknown level: ${value.level}`);
  }

  try {
    const klass = await createClass({
      levelId,
      name: value.name,
      formTeacherId: teacher.id,
    });
    // Per FR-020 + FR-021: API exposes natural keys + `ulid`. The
    // surrogate `id` and audit columns are hidden.
    return NextResponse.json(
      {
        ulid: klass.ulid,
        level: value.level,
        name: klass.name,
        formTeacher: { name: teacher.name },
      },
      { status: 201 },
    );
  } catch (err) {
    const { status, message } = toApiError(err);
    return jsonError(status, message);
  }
}

async function handleGet() {
  try {
    const classes = await listClassesWithFormTeacher();
    return jsonOk({ data: classes });
  } catch (err) {
    const { status, message } = toApiError(err);
    return jsonError(status, message);
  }
}

const post = withApiContract(handlePost);
const get = withApiContract(handleGet);

export async function POST(req: NextRequest) {
  return post(req);
}
export async function GET(req: NextRequest) {
  return get(req);
}