"use client";

import { useRouter } from "next/navigation";
import { Dropdown, Modal, notification } from "antd";
import type { MenuProps } from "antd";
import { getCsrfToken } from "@/lib/security/csrf-client";

/**
 * Shared per-row `...` actions menu used by both the Teachers and
 * Classes list tables. Per `006-teachers-classes-mutations/research.md`
 * §6.5: a single shared client component reused by both lists via
 * cross-folder import.
 *
 * The component takes:
 *   - `ulid`: the row's cross-cutting ULID handle (per FR-021).
 *   - `name`: the row's display name (embedded in the Delete modal
 *     copy per FR-004).
 *   - `resource`: 'teacher' | 'class' — picks the resource-specific
 *     edit page route, the DELETE endpoint, and the modal copy.
 *   - `onDeleted`: callback fired after a successful delete OR a
 *     silent 404 (per FR-006 — list refresh, no error toast on 404).
 *
 * The trigger button has `aria-label="Row actions"` (per FR-001) as
 * a low-cost screen-reader hint that is announced on mouse hover/focus
 * regardless of keyboard-interaction support.
 *
 * Keyboard accessibility is NOT a Stage 3 requirement (per
 * Clarifications Session 2026-06-22 Q4); the mouse-only posture is
 * intentional.
 */
export interface RowActionsMenuProps {
  ulid: string;
  name: string;
  resource: "teacher" | "class";
  onDeleted: () => void;
}

interface DeleteErrorEnvelope {
  error?: string;
  details?: {
    classUlid?: string;
    className?: string;
  };
}

export function RowActionsMenu({
  ulid,
  name,
  resource,
  onDeleted,
}: RowActionsMenuProps) {
  const router = useRouter();

  function handleDelete() {
    Modal.confirm({
      title: `Delete ${resource} ${name}?`,
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      maskClosable: true,
      async onOk() {
        try {
          const res = await fetch(`/api/v1.0/${resource}s/${ulid}`, {
            method: "DELETE",
            headers: {
              "X-CSRF-Token": getCsrfToken() ?? "",
            },
          });
          if (res.status === 200) {
            // Success — refresh the list silently per FR-006.
            onDeleted();
            return;
          }
          if (res.status === 404) {
            // Second delete / race — refresh silently (no error toast)
            // per FR-006 + Principle X.2.
            onDeleted();
            return;
          }
          if (res.status === 409) {
            // Form-teacher referential integrity guard (DELETE-Teacher
            // only). The wire envelope embeds the class name in the
            // `error` string verbatim per FR-005 — we surface it
            // directly in the antd error notification.
            const body = (await res
              .json()
              .catch(() => ({}))) as DeleteErrorEnvelope;
            const message = body.error ?? "Conflict.";
            notification.error({
              message: "Cannot delete",
              description: message,
              placement: "topRight",
              duration: 8,
            });
            return;
          }
          // Other error codes — show the wire envelope's error string.
          const body = (await res
            .json()
            .catch(() => ({}))) as DeleteErrorEnvelope;
          notification.error({
            message: "Delete failed",
            description: body.error ?? `Request failed (${res.status})`,
            placement: "topRight",
            duration: 8,
          });
        } catch {
          notification.error({
            message: "Delete failed",
            description: "Network error. Please retry.",
            placement: "topRight",
            duration: 8,
          });
        }
      },
    });
  }

  const items: MenuProps["items"] = [
    {
      key: "edit",
      label: "Edit",
      onClick: () => router.push(`/${resource}s/${ulid}/edit`),
    },
    {
      key: "delete",
      label: "Delete",
      danger: true,
      onClick: () => handleDelete(),
    },
  ];

  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
      <button
        type="button"
        aria-label="Row actions"
        className="text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border-0 cursor-pointer text-lg leading-none"
      >
        ⋯
      </button>
    </Dropdown>
  );
}