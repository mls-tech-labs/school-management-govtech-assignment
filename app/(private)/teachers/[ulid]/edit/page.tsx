"use client";

import { useEffect, useState } from "react";
import { notification } from "antd";
import { LoadingState, ErrorState } from "@/components/StateViews";
import { TeacherForm } from "../../_components/TeacherForm";

interface Subject {
  ulid: string;
  name: string;
  active: boolean;
}

interface TeacherRecord {
  ulid: string;
  name: string;
  subject: { ulid: string; name: string };
  email: string;
  contactNumber: string;
  modifiedAt: string;
}

export default function EditTeacherPage({
  params,
}: {
  params: Promise<{ ulid: string }>;
}) {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [initialValues, setInitialValues] = useState<TeacherRecord | null>(null);
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
          throw new Error(body.error ?? `Request failed (${teacherRes.status})`);
        }
        if (!subjectsRes.ok) throw new Error("Could not load subjects");

        const subjectsBody = (await subjectsRes.json()) as { data: Subject[] };
        const teacherBody = (await teacherRes.json()) as Omit<TeacherRecord, "modifiedAt">;
        setSubjects(subjectsBody.data ?? []);
        setInitialValues({
          ...teacherBody,
          // Approximation — GET response doesn't echo modified_at; the
          // concurrent-edit toast compares to this value.
          modifiedAt: new Date().toISOString(),
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not load teacher");
      }
    })();
  }, [params]);

  if (notFound) {
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
