"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { notification } from "antd";
import { getCsrfToken } from "@/lib/security/csrf-client";

/**
 * `use-edit-submit` — the shared hook for the Edit Teacher / Edit
 * Class forms. Per `006-teachers-classes-mutations/spec.md` FR-016 +
 * research.md §6.6 (concurrent-edit toast):
 *
 *   1. On PUT 200, compare the response's `previousModifiedAt` to the
 *      form-load `modifiedAt` captured when the form mounted. If they
 *      differ, the row was modified by another writer between
 *      form-load and form-submit — fire a non-blocking antd warning
 *      notification.
 *   2. On 409 (duplicate email / form-teacher collision / etc.),
 *      surface a field-level error message to the caller.
 *   3. On 400 (validation / Singapore contact-number rejection),
 *      surface a field-level error on the appropriate control.
 *   4. On success, navigate to the list page and call the caller's
 *      `onSuccess` (if any) so the list can refresh client-side.
 *
 * The toast is informational only — the update has already been saved;
 * the admin can dismiss or act on it. The toast MUST NOT block
 * navigation, MUST NOT trigger a re-fetch, and MUST auto-dismiss
 * after 8 seconds (per FR-016).
 */

export interface UseEditSubmitOptions<TBody> {
  url: string;
  /** The `modifiedAt` the form captured when it mounted (from the GET response). */
  formLoadModifiedAt: string | null;
  /** Called on PUT 200 — typically refreshes the list client-side. */
  onSuccess?: () => void;
  /** Optional mapper from Joi-style error message → field name. */
  mapFieldError?: (message: string) => string | null;
}

export interface UseEditSubmitResult<TBody> {
  submitting: boolean;
  submit: (body: TBody) => Promise<void>;
}

interface PutResponseBody {
  previousModifiedAt?: string;
  error?: string;
}

export function useEditSubmit<TBody>(
  opts: UseEditSubmitOptions<TBody>,
): UseEditSubmitResult<TBody> {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (body: TBody): Promise<void> => {
      setSubmitting(true);
      try {
        const res = await fetch(opts.url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken() ?? "",
          },
          body: JSON.stringify(body),
        });
        if (res.status === 200) {
          const data = (await res.json().catch(() => ({}))) as PutResponseBody;
          // Concurrent-edit toast: only fire if the captured value
          // differs from the response's `previousModifiedAt`.
          if (
            data.previousModifiedAt &&
            opts.formLoadModifiedAt &&
            data.previousModifiedAt !== opts.formLoadModifiedAt
          ) {
            const t = new Date(data.previousModifiedAt);
            const hh = String(t.getHours()).padStart(2, "0");
            const mm = String(t.getMinutes()).padStart(2, "0");
            const ss = String(t.getSeconds()).padStart(2, "0");
            notification.warning({
              message: "Concurrent edit detected",
              description: `Note: this record was edited by another administrator at ${hh}:${mm}:${ss} — your changes are saved, but please verify.`,
              placement: "topRight",
              duration: 8,
            });
          }
          if (opts.onSuccess) opts.onSuccess();
          // Navigate back to the list page.
          const url = new URL(opts.url, window.location.origin);
          const listPath = url.pathname.replace(/\/[^\/]+\/edit\/?$/, "");
          router.push(listPath || "/");
          return;
        }
        // Failure paths — let the form surface the field-level error
        // via the returned error message (the form inspects the
        // thrown sentinel).
        const data = (await res.json().catch(() => ({}))) as PutResponseBody;
        const err = new Error(data.error ?? `Request failed (${res.status})`);
        (err as Error & { status?: number }).status = res.status;
        throw err;
      } catch (err: unknown) {
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [opts, router],
  );

  return { submitting, submit };
}