import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import { listActiveSubjects } from "@/lib/db/repositories/subject";

export const dynamic = "force-dynamic";

async function handleGet() {
  try {
    const subjects = await listActiveSubjects();
    return jsonOk({
      data: subjects.map((s) => ({
        ulid: s.ulid,
        name: s.name,
        active: s.active,
      })),
    });
  } catch (err) {
    const { status, message } = toApiError(err);
    return jsonError(status, message);
  }
}

const get = withApiContract(handleGet);
export async function GET(req: Request) {
  return get(req as never);
}
