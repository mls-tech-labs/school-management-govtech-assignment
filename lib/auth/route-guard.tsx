"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * `<RouteGuard>` — the React function component that wraps every
 * page inside the `app/(private)/` route group. On mount it calls
 * `GET /api/v1.0/me`:
 *   - `200 OK`           → render `children`.
 *   - `401 Unauthorized` → redirect to `/login?redirectTo=<encoded
 *                            current URL>`. The single-slash-prefix
 *                            validation below rejects open-redirect
 *                            attempts (defense-in-depth; the login
 *                            page re-validates on its read side).
 *   - `503`              → show a retry-friendly message (no
 *                          redirect — the spec does not require
 *                          auto-retry on 503).
 *
 * The component deliberately does NOT import the
 * `withApiContract` envelope helpers — the call is plain `fetch`
 * so the unit test can mount it in JSDOM without a Next.js server.
 */
export interface RouteGuardProps {
  children: ReactNode;
}

/**
 * `isSafeRedirect(value)` — single-slash-prefix validator. Accepts
 *   - `/` (root)
 *   - `/teachers` (any single-slash path, with optional query / hash)
 * Rejects:
 *   - `` (empty)
 *   - `//evil.example.com` (protocol-relative URL)
 *   - `http://evil.example.com` (absolute URL)
 *   - `javascript:alert(1)` (scheme prefix)
 *   - any value that does NOT start with exactly one `/`
 *
 * The same validator is applied at the login-page read site
 * (`app/login/page.tsx`) as defense-in-depth against an open-redirect
 * vulnerability.
 */
export function isSafeRedirect(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  // MUST start with `/` and MUST NOT start with `//` or `/\\`.
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  // Reject protocol-prefixed URIs that snuck through after a single slash.
  // e.g. `/\evil.example.com` is a backslash-prefixed URL in some parsers.
  if (/[\/\\]/.test(value[1] ?? "")) return false;
  return true;
}

function encodeRedirectTo(): string {
  if (typeof window === "undefined") return "/";
  const path = window.location.pathname || "/";
  const search = window.location.search || "";
  const full = path + search;
  return encodeURIComponent(full);
}

export function RouteGuard({ children }: RouteGuardProps) {
  const router = useRouter();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready" }
    | { kind: "retryable"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/v1.0/me", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 200) {
          setState({ kind: "ready" });
          return;
        }
        if (res.status === 401) {
          // Redirect to /login with the encoded current URL.
          const encoded = encodeRedirectTo();
          router.replace(`/login?redirectTo=${encoded}`);
          return;
        }
        if (res.status === 503) {
          setState({
            kind: "retryable",
            message:
              "The service is temporarily unavailable. Please retry in a moment.",
          });
          return;
        }
        // Any other status is treated as a hard failure (no redirect).
        setState({
          kind: "retryable",
          message: `Could not verify your session (HTTP ${res.status}).`,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "retryable",
          message: "Network error. Please retry.",
        });
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state.kind === "ready") return <>{children}</>;
  if (state.kind === "retryable") {
    return (
      <div className="card max-w-md mx-auto mt-12 text-center">
        <p className="text-danger font-semibold mb-3">{state.message}</p>
        <button
          type="button"
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded border-0 cursor-pointer"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  // Loading state — matches the existing `LoadingState` component's
  // visual style (centered spinner + label).
  return (
    <div className="text-center mt-12 text-gray-500">
      <p>Loading…</p>
    </div>
  );
}
