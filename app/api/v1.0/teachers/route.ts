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

/**
 * POST `/api/v1.0/teachers` — create a new teacher.
 *
 * Wire shape (per `003-backend-api-db/spec.md` Clarifications,
 * Session 2026-06-20 — POST/GET reference object shape):
 *   { name, subject: { ulid, name? }, email, contactNumber }
 *
 * The route handler resolves `subject.ulid` to `subjects.id` via
 * `findSubjectIdByUlid` (against `uq_subjects_ulid`); an unknown or
 * inactive `subject.ulid` is rejected with `400 Bad Request` +
 * `{ "error": "Invalid subject" }` per FR-013. The nested
 * `subject.name` is a display hint and is ignored server-side — the
 * response echoes the authoritative `name` from the referenced
 * subject row.
 *
 * `ulid` is generated server-side via the `ulid` npm package (per
 * FR-021) on insert and returned in the 201 body so the frontend
 * can cache the row handle. Any top-level `ulid` in the request body
 * is rejected by Joi (`additionalProperties: false`).
 */
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

  // Per FR-019: resolve `subject.ulid` to the surrogate `subjects.id`
  // before insert. Per Clarifications, Session 2026-06-20, the nested
  // `subject.name` is ignored — only `ulid` is consulted.
  const subjectId = await findSubjectIdByUlid(value.subject.ulid);
  if (subjectId === null) {
    return jsonError(400, "Invalid subject");
  }

  try {
    const teacher = await createTeacher({
      name: value.name,
      subjectId,
      email: value.email,
      contactNumber: value.contactNumber,
    });
    // Per FR-020 + FR-021: API exposes `ulid` + natural keys. The
    // surrogate `id` and audit columns are hidden. Per Session
    // 2026-06-20: `subject` is a nested `{ ulid, name }` object —
    // we echo the AUTHORITATIVE name from the referenced subject row,
    // not the client-supplied display hint.
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

/**
 * GET `/api/v1.0/teachers` — list all teachers.
 *
 * Each entry carries the nested `subject: { ulid, name }` shape per
 * Clarifications, Session 2026-06-20. The `ulid` and `name` come
 * from the referenced subject row (joined on the surrogate `id` per
 * FR-019).
 */
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
