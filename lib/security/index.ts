/**
 * Barrel export for the security-hardening modules. One import per
 * consumer — keeps the dependency surface tight and lets the
 * `independence.spec.ts` static-grep audit find any accidental
 * cross-module imports.
 */
export { buildCspHeader, buildCompanionHeaders } from "./headers";
export type { HeaderDescriptor } from "./headers";
export { logCorsRejection, logCsrfRejection } from "./log";
export type { RejectionReason } from "./log";
export { mintCsrfToken, compareCsrfTokens } from "./csrf";
export {
  matchOrigin,
  isPreflight,
  buildCorsHeaders,
  buildCorsRejectionResponse,
} from "./cors";
export { getCsrfToken } from "./csrf-client";
export type { NodeEnvironment } from "./types";
// Optional strict-CSP primitive. NOT used by `middleware.ts` today
// (Next.js App Router doesn't attach a nonce to its own inline
// scripts, so a strict nonce-CSP would still block the page). Kept
// exported so a future consumer — or a future Next.js version that
// supports `useServerInsertedHTML` nonces — can opt in without
// rewriting the primitive.
export { mintCspNonce, buildCspHeader as buildCspHeaderWithNonce } from "./csp";
export type { CspHeaderDescriptor } from "./csp";
