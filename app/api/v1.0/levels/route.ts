import { jsonOk, jsonError } from "@/lib/api/response";
import { withApiContract } from "@/lib/api/route";
import { toApiError } from "@/lib/api/db-error";
import { listActiveLevels } from "@/lib/db/repositories/level";

export const dynamic = "force-dynamic";

async function handleGet() {
  try {
    const levels = await listActiveLevels();
    return jsonOk({
      data: levels.map((l) => ({
        ulid: l.ulid,
        name: l.name,
        active: l.active,
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
