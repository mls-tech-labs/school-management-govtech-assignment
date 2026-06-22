import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import { withAuth } from "@/lib/auth/middleware";
import {
  createTeacher,
  listTeachers,
  findSubjectIdByUlid,
} from "@/lib/db/repositories/teacher";
import { createTeacherRequestSchema } from "@/lib/validation/teacher";

export const dynamic = "force-dynamic";

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") {
    return jsonError(400, "Request body must be valid JSON");
  }
  const { value, error } = createTeacherRequestSchema.validate(body, {
    abortEarly: false,
  });
  if (error) {
    const first = error.details[0]?.message ?? "Invalid request body";
    return jsonError(400, first);
  }

  const subjectId = await findSubjectIdByUlid(value.subject.ulid);
  if (subjectId === null) return jsonError(400, "Invalid subject");

  try {
    const teacher = await createTeacher({
      name: value.name,
      subjectId,
      email: value.email,
      contactNumber: value.contactNumber,
    });
    return NextResponse.json(
      {
        ulid: teacher.ulid,
        name: teacher.name,
        subject: { ulid: value.subject.ulid, name: value.subject.name ?? "" },
        email: teacher.email,
        contactNumber: teacher.contactNumber,
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
    const teachers = await listTeachers();
    return jsonOk({
      data: teachers.map((t) => ({
        ulid: t.ulid,
        name: t.name,
        subject: { ulid: t.subject.ulid, name: t.subject.name },
        email: t.email,
        contactNumber: t.contactNumber,
      })),
    });
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
