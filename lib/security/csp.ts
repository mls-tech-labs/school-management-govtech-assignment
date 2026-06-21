/**
 * CSP header construction with per-request nonce substitution.
 *
 * Why a nonce, not a hash:
 *   Next.js injects an inline boot script into every page whose
 *   body varies per render (it embeds React Server Component
 *   payload, route data, build id, etc.). The SHA-256 hash of that
 *   script is different on every page, so pinning a single hash
 *   is impossible — the browser will reject it on every page except
 *   the one that happened to match. The standard, well-supported
 *   workaround is a per-request nonce:
 *
 *     1. `middleware.ts` generates a fresh 128-bit base64 nonce
 *        for every request.
 *     2. The nonce is interpolated into `script-src`:
 *           script-src 'self' 'nonce-{NONCE}'
 *        — the browser will execute any inline script that carries
 *        a matching `nonce="…"` attribute, and reject everything
 *        else.
 *     3. The same nonce is forwarded to the page render via a
 *        request header (`x-nonce`) and stamped onto Next.js's
 *        inline scripts by reading it in the root layout.
 *     4. The full CSP header is attached to the response.
 *
 * Pure, no runtime dependencies — safe in the Edge runtime where
 * `middleware.ts` runs.
 */

/**
 * `mintCspNonce()` — 128-bit CSPRNG value, base64url-encoded.
 * Returns a 22-character string (16 raw bytes → 22 base64url chars,
 * no `=` padding, no `+`/`/` chars). The base64url alphabet is
 * `[A-Za-z0-9_-]` — the same alphabet `lib/security/csrf.ts` uses
 * for the CSRF token, and importantly, the ONLY characters that
 * can appear in a `'nonce-…'` CSP source without escaping or
 * policy-injection risk.
 *
 * Web-Crypto only (Edge-runtime compatible). Same pattern as
 * `lib/security/csrf.ts` — no `node:crypto` import.
 */
export function mintCspNonce(): string {
  const buf = new Uint8Array(16);
  globalThis.crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]!);
  }
  // base64url: standard base64 with `+`→`-`, `/`→`_`, strip `=`.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * `buildCspHeader(policyTemplate, nonce, reportOnly)` — produce
 * the `{ name, value }` pair for the CSP header.
 *
 * The `policyTemplate` is the static policy from `CSP_POLICY`. It
 * is allowed to contain the literal token `__CSP_NONCE__` which
 * we replace with `'nonce-{NONCE}'`. If the template does NOT
 * contain the token we inject the nonce at the END of the
 * `script-src` directive so the policy still works for callers
 * who set their own script-src without the placeholder.
 */
export interface CspHeaderDescriptor {
  name: string;
  value: string;
}

export function buildCspHeader(
  policyTemplate: string,
  nonce: string,
  reportOnly: boolean,
): CspHeaderDescriptor {
  // Defensive — the nonce must be base64url-safe AND length-capped
  // to EXACTLY the length the mint function produces (22 chars).
  // The alphabet `[A-Za-z0-9_-]` alone is not enough: an attacker
  // who controls the nonce string can append any alphanumeric text
  // (e.g. `evil=true`) and the resulting policy source becomes
  // `'nonce-XXXXXXevil=true'` — the extra text is just more chars
  // inside the quoted source, not a separate directive, so the
  // browser will silently accept it. The defense is a tight length
  // cap: after the alphabet strip, truncate to 22 chars so any
  // trailing attacker payload is discarded. If a future mint
  // function returns a longer nonce, update this constant.
  const MAX_NONCE_LEN = 22;
  const stripped = nonce.replace(/[^A-Za-z0-9_-]/g, "").slice(0, MAX_NONCE_LEN);
  const safeNonce = stripped.length > 0 ? stripped : "";
  const nonceSource = safeNonce.length > 0 ? `'nonce-${safeNonce}'` : `'nonce-'`;

  let value: string;
  if (policyTemplate.includes("__CSP_NONCE__")) {
    // Explicit placeholder — substitute the whole token.
    value = policyTemplate.replace(/__CSP_NONCE__/g, nonceSource);
  } else {
    // No placeholder — append the nonce to `script-src` (creating
    // the directive if missing). We do this by detecting the
    // `script-src ...;` segment via a non-greedy regex.
    if (/script-src[^;]*/i.test(policyTemplate)) {
      value = policyTemplate.replace(
        /script-src([^;]*)/i,
        (match, rest) => `script-src${rest} ${nonceSource}`,
      );
    } else {
      // No script-src at all — append it.
      value = policyTemplate.replace(
        /;?\s*$/,
        `; script-src 'self' ${nonceSource}`,
      );
    }
  }

  return {
    name: reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value,
  };
}
