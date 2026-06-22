"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { notification } from "antd";
import { getCsrfToken } from "@/lib/security/csrf-client";

// Shared edit-form submit hook.
//   1. On PUT 200, compare previousModifiedAt to the form-load value
//      and fire a non-blocking warning toast if a concurrent edit
//      happened between mount and submit.
//   2. On failure, throw an Error with the wire envelope's `error`
//      message so the form can surface a field-level error.
export interface UseEditSubmitOptions<TBody> {
  url: string;
  formLoadModifiedAt: string | null;
  onSuccess?: () => void;
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
          // Navigate back to the list page (strip the trailing /ulid/edit).
          const url = new URL(opts.url, window.location.origin);
          const listPath = url.pathname.replace(/\/[^\/]+\/edit\/?$/, "");
          router.push(listPath || "/");
          return;
        }
        const data = (await res.json().catch(() => ({}))) as PutResponseBody;
        const err = new Error(data.error ?? `Request failed (${res.status})`);
        (err as Error & { status?: number }).status = res.status;
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [opts, router],
  );

  return { submitting, submit };
}
