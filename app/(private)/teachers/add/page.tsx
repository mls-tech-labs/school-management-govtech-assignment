"use client";
import { useEffect, useState } from "react";
import { LoadingState, ErrorState } from "@/components/StateViews";
import { TeacherForm } from "../_components/TeacherForm";

interface Subject {
  ulid: string;
  name: string;
  active: boolean;
}

export default function AddTeacherPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1.0/subjects", { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        const body = (await res.json()) as { data: Subject[] };
        setSubjects(body.data ?? []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not load subjects");
      }
    })();
  }, []);

  return (
    <>
      <h1 className="text-2xl font-bold m-0 mb-6">Add Teacher</h1>
      {error ? (
        <ErrorState message={error} onRetry={() => location.reload()} />
      ) : subjects === null ? (
        <LoadingState />
      ) : (
        <TeacherForm subjects={subjects} />
      )}
    </>
  );
}
