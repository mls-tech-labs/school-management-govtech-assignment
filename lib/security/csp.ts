// Per-request CSP nonce + policy-with-placeholder substitution. Kept
// optional — Next.js App Router does not attach nonces to its own
// inline scripts, so strict-CSP would still block the page.

const MAX_NONCE_LEN = 22;

export function mintCspNonce(): string {
  const buf = new Uint8Array(16);
  globalThis.crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface CspHeaderDescriptor {
  name: string;
  value: string;
}

// Defensive length cap: a nonce longer than the mint's output would
// silently accept trailing attacker payload inside the quoted source.
function safeNonce(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, MAX_NONCE_LEN);
}

export function buildCspHeader(
  policyTemplate: string,
  nonce: string,
  reportOnly: boolean,
): CspHeaderDescriptor {
  const nonceSource = safeNonce(nonce).length > 0
    ? `'nonce-${safeNonce(nonce)}'`
    : `'nonce-'`;

  let value: string;
  if (policyTemplate.includes("__CSP_NONCE__")) {
    value = policyTemplate.replace(/__CSP_NONCE__/g, nonceSource);
  } else if (/script-src[^;]*/i.test(policyTemplate)) {
    value = policyTemplate.replace(
      /script-src([^;]*)/i,
      (match, rest) => `script-src${rest} ${nonceSource}`,
    );
  } else {
    value = policyTemplate.replace(
      /;?\s*$/,
      `; script-src 'self' ${nonceSource}`,
    );
  }

  return {
    name: reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value,
  };
}
