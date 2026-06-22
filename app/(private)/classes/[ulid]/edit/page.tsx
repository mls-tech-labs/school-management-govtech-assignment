"use client";

import { useEffect, useState } from "react";
import { notification } from "antd";
import { LoadingState, ErrorState } from "@/components/StateViews";
import { ClassForm } from "../../_components/ClassForm";

interface TeacherRef {
  ulid: string;
  name: string;
}

interface LevelRef {
  ulid: string;
  name: string;
  active: boolean;
}

interface ClassRecord {
  ulid: string;
  name: string;
  level: { ulid: string; name: string };
  formTeacher: { ulid: string; name: string };
  modifiedAt: string;
}

export default function EditClassPage({
  params,
}: {
  params: Promise<{ ulid: string }>;
}) {
  const [teachers, setTeachers] = useState<TeacherRef[] | null>(null);
  const [levels, setLevels] = useState<LevelRef[] | null>(null);
  const [initialValues, setInitialValues] = useState<ClassRecord | null>(null);
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
        const teachersBody = (await teachersRes.json()) as { data: TeacherRef[] };
        const levelsBody = (await levelsRes.json()) as { data: LevelRef[] };
        const classBody = (await classRes.json()) as Omit<ClassRecord, "modifiedAt">;
        setTeachers(
          (teachersBody.data ?? []).map((t) => ({ ulid: t.ulid, name: t.name })),
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
