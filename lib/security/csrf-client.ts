// Reads the NON-HttpOnly `csrfToken` cookie from the document. SSR-safe.
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie;
  if (!raw) return null;
  const match = /(?:^|;\s*)csrfToken=([^;]+)/.exec(raw);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
