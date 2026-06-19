"use client";
import { useEffect, useState } from "react";
import { LoadingState, ErrorState } from "@/components/StateViews";
import { ClassForm } from "../_components/ClassForm";

export default function AddClassPage() {
  const [teachers, setTeachers] = useState<{ email: string; name: string }[] | null>(null);
  const [levels, setLevels] = useState<{ name: string; active: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tRes, lRes] = await Promise.all([
          fetch("/api/v1.0/teachers", { cache: "no-store" }),
          fetch("/api/v1.0/levels", { cache: "no-store" }),
        ]);
        if (!tRes.ok || !lRes.ok) {
          throw new Error("Could not load form data");
        }
        const tBody = (await tRes.json()) as { data: { email: string; name: string }[] };
        const lBody = (await lRes.json()) as { data: { name: string; active: boolean }[] };
        setTeachers(tBody.data);
        setLevels(lBody.data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not load form data");
      }
    })();
  }, []);

  return (
    <>
      <h1 className="text-2xl font-bold m-0 mb-6">Add Class</h1>
      {error ? (
        <ErrorState message={error} onRetry={() => location.reload()} />
      ) : teachers === null || levels === null ? (
        <LoadingState />
      ) : (
        <ClassForm teachers={teachers} levels={levels} />
      )}
    </>
  );
}
