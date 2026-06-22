"use client";

import { useRouter } from "next/navigation";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { getCsrfToken } from "@/lib/security/csrf-client";

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

// `class` + "s" would yield `/classs/...` (Next.js 404), so paths
// are hardcoded per resource.
const RESOURCE_PATHS: Record<"teacher" | "class", { edit: string; api: string }> = {
  teacher: { edit: "/teachers", api: "/api/v1.0/teachers" },
  class: { edit: "/classes", api: "/api/v1.0/classes" },
};

export function RowActionsMenu({
  ulid,
  name,
  resource,
  onDeleted,
}: RowActionsMenuProps) {
  const router = useRouter();
  // Context-bound modal/notification — picked up from antd `<App>` in root layout.
  const { modal, notification: notificationApi } = App.useApp();
  const paths = RESOURCE_PATHS[resource];

  function handleDelete() {
    modal.confirm({
      title: `Delete ${resource} ${name}?`,
      content: "This action cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      maskClosable: true,
      async onOk() {
        try {
          const res = await fetch(`${paths.api}/${ulid}`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": getCsrfToken() ?? "" },
          });
          if (res.status === 200 || res.status === 404) {
            // Success or silent 404 (second delete / race) — refresh the list.
            onDeleted();
            return;
          }
          if (res.status === 409) {
            // Form-teacher referential integrity guard (DELETE-Teacher).
            const body = (await res.json().catch(() => ({}))) as DeleteErrorEnvelope;
            notificationApi.error({
              message: "Cannot delete",
              description: body.error ?? "Conflict.",
              placement: "topRight",
              duration: 8,
            });
            return;
          }
          const body = (await res.json().catch(() => ({}))) as DeleteErrorEnvelope;
          notificationApi.error({
            message: "Delete failed",
            description: body.error ?? `Request failed (${res.status})`,
            placement: "topRight",
            duration: 8,
          });
        } catch {
          notificationApi.error({
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
    { key: "edit", label: "Edit" },
    { key: "delete", label: "Delete", danger: true },
  ];

  function onMenuClick(info: { key: string }) {
    if (info.key === "edit") {
      router.push(`${paths.edit}/${ulid}/edit`);
    } else if (info.key === "delete") {
      handleDelete();
    }
  }

  return (
    <Dropdown
      menu={{ items, onClick: onMenuClick }}
      trigger={["click"]}
      placement="bottomRight"
    >
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
