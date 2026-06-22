"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface RouteGuardProps {
  children: ReactNode;
}

type GuardState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "retryable"; message: string };

// Accepts `/` or any single-slash path. Rejects empty strings,
// protocol-relative URLs (`//host`), and scheme prefixes (`javascript:`).
export function isSafeRedirect(value: string | null | undefined): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  if (/[\/\\]/.test(value[1] ?? "")) return false;
  return true;
}

function encodeRedirectTo(): string {
  if (typeof window === "undefined") return "/";
  const full = (window.location.pathname || "/") + (window.location.search || "");
  return encodeURIComponent(full);
}

export function RouteGuard({ children }: RouteGuardProps) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>({ kind: "loading" });

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
          router.replace(`/login?redirectTo=${encodeRedirectTo()}`);
          return;
        }
        if (res.status === 503) {
          setState({
            kind: "retryable",
            message: "The service is temporarily unavailable. Please retry in a moment.",
          });
          return;
        }
        setState({
          kind: "retryable",
          message: `Could not verify your session (HTTP ${res.status}).`,
        });
      } catch {
        if (cancelled) return;
        setState({ kind: "retryable", message: "Network error. Please retry." });
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
  return (
    <div className="text-center mt-12 text-gray-500">
      <p>Loading…</p>
    </div>
  );
}
