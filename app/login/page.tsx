"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { isSafeRedirect } from "@/lib/auth/route-guard";
import { getCsrfToken } from "@/lib/security/csrf-client";

/**
 * `/login` — the single auth entry point for the application.
 *
 * Per spec FR-002 the page renders EXACTLY three interactive
 * elements: a username input, a password input, and a "Log in"
 * button. No "Sign up", "Register", "Forgot password", or
 * "Remember me" controls.
 *
 * POST flow (per spec FR-003..FR-005 + 005 FR-007):
 *   1. Submit `POST /api/v1.0/login` as `application/json` with
 *      `{ username, password }` AND the `X-CSRF-Token` header
 *      (CSRF middleware exempts login, but the header is sent for
 *      symmetry — if a future spec removes the exempt, the page
 *      is ready).
 *   2. On `200 OK` → navigate to the validated `redirectTo`
 *      (or `LOGIN_REDIRECT_DEFAULT` / `/`).
 *   3. On `401` → display a single generic error
 *      "Invalid username or password" and clear the password field.
 *   4. On `400` → display the field-level error from the body.
 */
function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const redirectTo = search?.get("redirectTo") ?? null;
  const safeRedirect = isSafeRedirect(redirectTo) ? redirectTo : "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const csrfToken = getCsrfToken() ?? "";
      const res = await fetch("/api/v1.0/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 200) {
        router.replace(safeRedirect);
        return;
      }
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setFormError("Invalid username or password");
        setPassword("");
      } else if (res.status === 400) {
        setFormError(data.error ?? "Please review the highlighted fields.");
      } else if (res.status === 503) {
        setFormError(
          "The service is temporarily unavailable. Please retry in a moment.",
        );
      } else {
        setFormError(data.error ?? "Could not log in. Please try again.");
      }
    } catch {
      setFormError("Network error. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-6">Sign in</h1>
      <form onSubmit={onSubmit} noValidate>
        <div className="card">
          <FormField
            label="Username"
            name="username"
            value={username}
            onChange={setUsername}
            placeholder="Username"
            required
            autoComplete="username"
          />
          <FormField
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Password"
            required
            autoComplete="current-password"
          />
          {formError ? (
            <div className="text-danger text-sm mt-2" role="alert">
              {formError}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end mt-4">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Log in"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center mt-12 text-gray-500">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
