import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import { withAuth } from "@/lib/auth/middleware";
import {
  createClass,
  listClassesWithFormTeacher,
} from "@/lib/db/repositories/class";
import { findTeacherByUlid } from "@/lib/db/repositories/teacher";
import { findLevelIdByUlid } from "@/lib/db/repositories/level";
import { createClassRequestSchema } from "@/lib/validation/class";

export const dynamic = "force-dynamic";

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") {
    return jsonError(400, "Request body must be valid JSON");
  }
  const { value, error } = createClassRequestSchema.validate(body, {
    abortEarly: false,
  });
  if (error) {
    const first = error.details[0]?.message ?? "Invalid request body";
    return jsonError(400, first);
  }

  const levelId = await findLevelIdByUlid(value.level.ulid);
  if (levelId === null) return jsonError(400, "Invalid level");

  const teacher = await findTeacherByUlid(value.formTeacher.ulid);
  if (!teacher) return jsonError(404, "Teacher not found");

  try {
    const klass = await createClass({
      levelId,
      name: value.name,
      formTeacherId: teacher.id,
    });
    return NextResponse.json(
      {
        ulid: klass.ulid,
        level: { ulid: value.level.ulid, name: value.level.name ?? "" },
        name: klass.name,
        formTeacher: { ulid: teacher.ulid, name: teacher.name },
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

const post = withApiContract(withAuth(handlePost));
const get = withApiContract(withAuth(handleGet));

export async function POST(req: NextRequest) {
  return post(req);
}
export async function GET(req: NextRequest) {
  return get(req);
}
