"use client";

import { useEffect, useState } from "react";
import { notification } from "antd";
import { LoadingState, ErrorState } from "@/components/StateViews";
import { TeacherForm } from "../../_components/TeacherForm";

/**
 * Edit Teacher page — the page is a React Server Component-style
 * client wrapper that fetches the existing teacher record from
 * `GET /api/v1.0/teachers/[ulid]` and renders the Add Teacher form
 * in edit mode (gated by the `initialValues` prop).
 *
 * Per `006-teachers-classes-mutations/spec.md` FR-002 + the
 * constitution v2.6.0 amendment: the data source for the Edit page
 * is the new single-resource GET endpoint. On 404, the user is
 * redirected to `/teachers` with an antd warning notification.
 */
export default function EditTeacherPage({
  params,
}: {
  params: Promise<{ ulid: string }>;
}) {
  const [subjects, setSubjects] = useState<
    { ulid: string; name: string; active: boolean }[] | null
  >(null);
  const [initialValues, setInitialValues] = useState<
    | {
        ulid: string;
        name: string;
        subject: { ulid: string; name: string };
        email: string;
        contactNumber: string;
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
        const [subjectsRes, teacherRes] = await Promise.all([
          fetch("/api/v1.0/subjects", { cache: "no-store" }),
          fetch(`/api/v1.0/teachers/${ulid}`, { cache: "no-store" }),
        ]);
        if (teacherRes.status === 404) {
          setNotFound(true);
          return;
        }
        if (!teacherRes.ok) {
          const body = await teacherRes.json().catch(() => ({}));
          throw new Error(
            body.error ?? `Request failed (${teacherRes.status})`,
          );
        }
        if (!subjectsRes.ok) {
          throw new Error("Could not load subjects");
        }
        const subjectsBody = (await subjectsRes.json()) as {
          data: { ulid: string; name: string; active: boolean }[];
        };
        const teacherBody = (await teacherRes.json()) as {
          ulid: string;
          name: string;
          subject: { ulid: string; name: string };
          email: string;
          contactNumber: string;
        };
        setSubjects(subjectsBody.data ?? []);
        setInitialValues({
          ...teacherBody,
          // Capture the form-load moment; the form-load `modifiedAt` is
          // approximated by `new Date().toISOString()` since the GET
          // response doesn't currently echo the row's `modified_at`.
          // The PUT 200 `previousModifiedAt` will always differ from
          // this if we want a useful comparison we should refetch
          // modified_at from the server. For now, leave undefined.
          modifiedAt: new Date().toISOString(),
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not load teacher");
      }
    })();
  }, [params]);

  if (notFound) {
    // Per FR-002 / Edge Cases: redirect to list with a flash warning.
    notification.warning({
      message: "Teacher not found",
      description:
        "The teacher you tried to edit no longer exists. Returning to the teachers list.",
      placement: "topRight",
      duration: 6,
    });
    if (typeof window !== "undefined") {
      window.location.replace("/teachers");
    }
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-bold m-0 mb-6">Edit Teacher</h1>
      {error ? (
        <ErrorState message={error} onRetry={() => location.reload()} />
      ) : subjects === null || initialValues === null ? (
        <LoadingState />
      ) : (
        <TeacherForm subjects={subjects} initialValues={initialValues} />
      )}
    </>
  );
}