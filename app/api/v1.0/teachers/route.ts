import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import {
  createTeacher,
  listTeachers,
  findSubjectIdByName,
} from "@/lib/db/repositories/teacher";
import { buildCreateTeacherSchema } from "@/lib/validation/teacher";

export const dynamic = "force-dynamic";

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") {
    return jsonError(400, "Request body must be valid JSON");
  }
  const schema = await buildCreateTeacherSchema();
  const { value, error } = schema.validate(body, { abortEarly: false });
  if (error) {
    const first = error.details[0]?.message ?? "Invalid request body";
    return jsonError(400, first);
  }

  // Per FR-019: resolve the natural-key `subject` (subjects.name) to the
  // surrogate `subject_id` (FK → subjects.id) before insert.
  const subjectId = await findSubjectIdByName(value.subject);
  if (subjectId === null) {
    return jsonError(400, `Unknown subject: ${value.subject}`);
  }

  try {
    const teacher = await createTeacher({
      name: value.name,
      subjectId,
      email: value.email,
      contactNumber: value.contactNumber,
    });
    // Per FR-020 + FR-021: API exposes natural keys + `ulid`. The
    // surrogate `id` and audit columns are hidden.
    return NextResponse.json(
      {
        ulid: teacher.ulid,
        name: teacher.name,
        subject: value.subject,
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
        subject: t.subjectRef?.name ?? "",
        email: t.email,
        contactNumber: t.contactNumber,
      })),
    });
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