import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import {
  createClass,
  listClassesWithFormTeacher,
} from "@/lib/db/repositories/class";
import { findTeacherByUlid } from "@/lib/db/repositories/teacher";
import { findLevelIdByUlid } from "@/lib/db/repositories/level";
import { createClassRequestSchema } from "@/lib/validation/class";

export const dynamic = "force-dynamic";

/**
 * POST `/api/v1.0/classes` — create a new class.
 *
 * Wire shape (per `003-backend-api-db/spec.md` Clarifications,
 * Session 2026-06-20 — POST/GET reference object shape):
 *   { level: { ulid, name? }, name, formTeacher: { ulid, name? } }
 *
 * The route handler resolves:
 *   - `level.ulid` → `levels.id` (via `findLevelIdByUlid` against
 *     `uq_levels_ulid`); unknown/inactive → `400 Bad Request` +
 *     `{ "error": "Invalid level" }` per FR-013.
 *   - `formTeacher.ulid` → `teachers.id` (via `findTeacherByUlid`
 *     against `uq_teachers_ulid`); unknown → `404 Not Found` +
 *     `{ "error": "Teacher not found" }` per FR-013. This pre-INSERT
 *     existence check distinguishes `404` from `409 "Teacher already
 *     assigned"` (the DB `UNIQUE(classes.form_teacher_id)` returns
 *     `409` for the form-teacher race; the FK is the backstop).
 *
 * The nested `level.name` and `formTeacher.name` are display hints
 * and are ignored server-side — the response echoes the
 * authoritative `name` from the referenced rows.
 */
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

  // Resolve `level.ulid` first — unknown levels are 400.
  const levelId = await findLevelIdByUlid(value.level.ulid);
  if (levelId === null) {
    return jsonError(400, "Invalid level");
  }

  // Resolve `formTeacher.ulid` — unknown teachers are 404 (race-safe
  // vs. the form-teacher 409 from the DB UNIQUE index).
  const teacher = await findTeacherByUlid(value.formTeacher.ulid);
  if (!teacher) {
    return jsonError(404, "Teacher not found");
  }

  try {
    const klass = await createClass({
      levelId,
      name: value.name,
      formTeacherId: teacher.id,
    });
    // Per FR-020 + FR-021: API exposes `ulid` + natural keys. The
    // surrogate `id` and audit columns are hidden. Per Session
    // 2026-06-20: `level` and `formTeacher` are nested
    // `{ ulid, name }` objects — we echo the AUTHORITATIVE names from
    // the referenced rows, not the client-supplied display hints.
    return NextResponse.json(
      {
        ulid: klass.ulid,
        level: { ulid: value.level.ulid, name: value.level.name ?? "" },
        name: klass.name,
        formTeacher: {
          ulid: teacher.ulid,
          name: teacher.name,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const { status, message } = toApiError(err);
    return jsonError(status, message);
  }
}

/**
 * GET `/api/v1.0/classes` — list all classes.
 *
 * Each entry carries the nested `level: { ulid, name }` and
 * `formTeacher: { ulid, name }` shapes per Clarifications, Session
 * 2026-06-20. The `ulid` and `name` come from the referenced rows
 * (joined on the surrogate `id` per FR-019).
 */
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
