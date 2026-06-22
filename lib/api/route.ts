import { NextRequest } from "next/server";
import { jsonError } from "./response";
import { requireJson } from "./content-type";

export type Handler<TCtx = unknown> = (
  req: NextRequest,
  ctx?: TCtx,
) => Promise<Response>;

export interface WithApiContractOptions {
  successStatus?: 200 | 201;
}

// Wraps a route handler with two cross-cutting guarantees:
//   1. Content-Type gate (415) on body-carrying requests.
//   2. Unhandled-throw guard — any leaked exception becomes a 500.
// Typed DB errors are NOT translated here; the inner handler is
// responsible for mapping them via `toApiError`.
export function withApiContract<TCtx = unknown>(
  handler: Handler<TCtx>,
  _opts: WithApiContractOptions = {},
): Handler<TCtx> {
  return async (req: NextRequest, ctx?: TCtx): Promise<Response> => {
    const ct = requireJson(req);
    if (ct) return ct;

    try {
      return await handler(req, ctx);
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error("[withApiContract] unhandled error", err);
      return jsonError(500, "Internal server error");
    }
  };
}
