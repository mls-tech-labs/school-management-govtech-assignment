// Edge-runtime compatibility — this module is imported by
// `middleware.ts`, which Next.js bundles for the Edge runtime.
// The Edge runtime forbids `node:*` imports (webpack's
// `UnhandledSchemeError`), so we use the Web Crypto API via
// `globalThis.crypto` instead. Web Crypto is available in:
//   - Node.js ≥ 18 (where `globalThis.crypto` exposes the
//     same `getRandomValues` implementation)
//   - The Edge runtime (V8 isolate with Web Crypto built in)
//
// `timingSafeEqual` is replaced by an explicit XOR-fold constant-
// time compare. The contract is identical to the `node:crypto`
// version: identical inputs → `true`; otherwise `false`; length
// mismatch → `false` (with a dummy XOR-fold to keep timing
// constant).

const TOKEN_BYTES = 32; // 256 bits — same entropy as the session token.

/**
 * `mintCsrfToken()` — fresh 256-bit CSPRNG token, base64url-encoded
 * (no `+`, `/`, or `=`). Returns a 43-character string.
 *
 * The two `mint*` functions in this codebase (session token +
 * CSRF token) deliberately use the same entropy and encoding so an
 * operator inspecting Redis keys / cookies cannot accidentally
 * mistake one for the other.
 */
export function mintCsrfToken(): string {
  const buf = new Uint8Array(TOKEN_BYTES);
  globalThis.crypto.getRandomValues(buf);
  // base64url encoding: standard `btoa` works on the binary string
  // view of the bytes. The Node test environment also provides
  // `btoa` in modern versions.
  let binary = "";
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * `compareCsrfTokens(cookie, header)` — constant-time comparison
 * with explicit length-mismatch handling. Returns:
 *   - `false` when either side is missing or empty
 *   - `false` when the two strings have different lengths
 *   - `false` when the bytes don't match (in constant time)
 *   - `true` only when both inputs are present, equal-length, and
 *     byte-equal.
 *
 * Constant-time implementation: XOR every byte pair and fold the
 * results with `|=`. The result is `0` iff every byte matched.
 * The loop runs over the length of the SHORTER string; for the
 * mismatched-length case we still run a dummy XOR-fold of equal
 * length to keep the timing profile flat.
 */
export function compareCsrfTokens(
  cookie: string | undefined,
  header: string | undefined,
): boolean {
  if (!cookie || !header) return false;
  if (cookie.length === 0 || header.length === 0) return false;
  if (cookie.length !== header.length) {
    // Dummy XOR-fold on equal-length zero-filled strings to keep
    // the timing profile flat. Result is discarded; `0` is just a
    // throwaway.
    const n = Math.min(cookie.length, header.length);
    let _pad = 0;
    for (let i = 0; i < n; i++) _pad |= 0 ^ 0;
    void _pad;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < cookie.length; i++) {
    diff |= cookie.charCodeAt(i) ^ header.charCodeAt(i);
  }
  return diff === 0;
}
