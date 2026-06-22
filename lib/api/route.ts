import { NextRequest } from "next/server";
import { jsonError } from "./response";
import { requireJson } from "./content-type";

/**
 * `withApiContract` — the single enforcement point for the cross-cutting
 * API contract from `specs/003-backend-api-db/spec.md` FR-010..FR-015.
 *
 * Two guarantees this wrapper provides:
 *   1. Content-Type gate — body-carrying requests (POST/PUT/PATCH) MUST
 *      carry `Content-Type: application/json`; anything else short-circuits
 *      to a `415` envelope (FR-010).
 *   2. Unhandled-rejection guard — any thrown error that escapes the inner
 *      handler becomes a `500` envelope with a non-leaking message (FR-015);
 *      the original error is logged with its stack trace server-side so it
 *      never reaches the client.
 *
 * One guarantee this wrapper does NOT provide:
 *   - Translation of typed DB errors to status codes. That is the inner
 *     handler's responsibility (via `toApiError` in `./db-error`). The
 *     wrapper only catches *unhandled* throws, which by definition are
 *     bugs, not contract violations.
 *
 * The handler signature accepts a typed `ctx` argument so Stage 3
 * dynamic-route handlers (`/api/v1.0/{teachers,classes}/[ulid]`) can
 * receive their `{ params: Promise<{ ulid: string }> }` context
 * without losing the inferred `RouteCtx` type through the wrapper
 * chain. The default `unknown` keeps the legacy call sites (no ctx)
 * compile-clean.
 */
export type Handler<TCtx = unknown> = (
  req: NextRequest,
  ctx?: TCtx,
) => Promise<Response>;

export interface WithApiContractOptions {
  /** Default success status for the inner handler. Defaults to 200. */
  successStatus?: 200 | 201;
}

export function withApiContract<TCtx = unknown>(
  handler: Handler<TCtx>,
  _opts: WithApiContractOptions = {},
): Handler<TCtx> {
  return async (req: NextRequest, ctx?: TCtx): Promise<Response> => {
    // 1. Content-Type gate.
    const ct = requireJson(req);
    if (ct) return ct;

    try {
      const result = await handler(req, ctx);
      return result;
    } catch (err: unknown) {
      // Per FR-015: log the full error server-side, return a generic
      // message to the client. Never leak stack / SQL / connection strings.
      // eslint-disable-next-line no-console
      console.error("[withApiContract] unhandled error", err);
      return jsonError(500, "Internal server error");
    }
  };
}
