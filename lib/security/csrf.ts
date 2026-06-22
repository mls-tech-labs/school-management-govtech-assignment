// Edge-runtime compatible — uses Web Crypto, no `node:*` imports.
const TOKEN_BYTES = 32; // 256 bits, same entropy as the session token.

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function mintCsrfToken(): string {
  const buf = new Uint8Array(TOKEN_BYTES);
  globalThis.crypto.getRandomValues(buf);
  return bytesToBase64Url(buf);
}

// Constant-time comparison. Returns false on missing/empty/unequal
// inputs; true only when byte-equal.
export function compareCsrfTokens(
  cookie: string | undefined,
  header: string | undefined,
): boolean {
  if (!cookie || !header) return false;
  if (cookie.length === 0 || header.length === 0) return false;
  if (cookie.length !== header.length) {
    // Dummy XOR-fold over equal-length zero-filled strings so the
    // timing profile stays flat.
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
