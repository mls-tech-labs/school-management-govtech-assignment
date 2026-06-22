"use client";

import { useEffect, useState } from "react";
import { notification } from "antd";
import { LoadingState, ErrorState } from "@/components/StateViews";
import { ClassForm } from "../../_components/ClassForm";

/**
 * Edit Class page — fetches the existing class record from
 * `GET /api/v1.0/classes/[ulid]` and renders the Add Class form in
 * edit mode (gated by the `initialValues` prop).
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-003 + the
 * constitution v2.6.0 amendment. On 404, the user is redirected to
 * `/classes` with an antd warning notification.
 */
export default function EditClassPage({
  params,
}: {
  params: Promise<{ ulid: string }>;
}) {
  const [teachers, setTeachers] = useState<
    { ulid: string; name: string }[] | null
  >(null);
  const [levels, setLevels] = useState<
    { ulid: string; name: string; active: boolean }[] | null
  >(null);
  const [initialValues, setInitialValues] = useState<
    | {
        ulid: string;
        name: string;
        level: { ulid: string; name: string };
        formTeacher: { ulid: string; name: string };
        modifiedAt: string;
      }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { ulid } = await params;
        const [teachersRes, levelsRes, classRes] = await Promise.all([
          fetch("/api/v1.0/teachers", { cache: "no-store" }),
          fetch("/api/v1.0/levels", { cache: "no-store" }),
          fetch(`/api/v1.0/classes/${ulid}`, { cache: "no-store" }),
        ]);
        if (classRes.status === 404) {
          setNotFound(true);
          return;
        }
        if (!classRes.ok) {
          const body = await classRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${classRes.status})`);
        }
        if (!teachersRes.ok || !levelsRes.ok) {
          throw new Error("Could not load form data");
        }
        const teachersBody = (await teachersRes.json()) as {
          data: { ulid: string; name: string }[];
        };
        const levelsBody = (await levelsRes.json()) as {
          data: { ulid: string; name: string; active: boolean }[];
        };
        const classBody = (await classRes.json()) as {
          ulid: string;
          name: string;
          level: { ulid: string; name: string };
          formTeacher: { ulid: string; name: string };
        };
        setTeachers(
          (teachersBody.data ?? []).map((t) => ({
            ulid: t.ulid,
            name: t.name,
          })),
        );
        setLevels(levelsBody.data ?? []);
        setInitialValues({
          ...classBody,
          modifiedAt: new Date().toISOString(),
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not load class");
      }
    })();
  }, [params]);

  if (notFound) {
    notification.warning({
      message: "Class not found",
      description:
        "The class you tried to edit no longer exists. Returning to the classes list.",
      placement: "topRight",
      duration: 6,
    });
    if (typeof window !== "undefined") {
      window.location.replace("/classes");
    }
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-bold m-0 mb-6">Edit Class</h1>
      {error ? (
        <ErrorState message={error} onRetry={() => location.reload()} />
      ) : teachers === null || levels === null || initialValues === null ? (
        <LoadingState />
      ) : (
        <ClassForm
          teachers={teachers}
          levels={levels}
          initialValues={initialValues}
        />
      )}
    </>
  );
}