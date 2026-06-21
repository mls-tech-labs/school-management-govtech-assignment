"use client";
import { useEffect, useState } from "react";
import { LoadingState, ErrorState } from "@/components/StateViews";
import { ClassForm } from "../_components/ClassForm";

export default function AddClassPage() {
  // The wire shapes from `GET /api/v1.0/teachers` and
  // `GET /api/v1.0/levels` include `ulid` per FR-021; the Add Class
  // form needs `ulid` so it can build the nested `level: { ulid, name }`
  // and `formTeacher: { ulid, name }` body that the API expects (per
  // `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
  // — POST/GET reference object shape).
  const [teachers, setTeachers] = useState<
    { ulid: string; name: string }[] | null
  >(null);
  const [levels, setLevels] = useState<
    { ulid: string; name: string; active: boolean }[] | null
  >(null);
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
        // `GET /api/v1.0/teachers` returns
        // `{ data: [ { ulid, name, subject: { ulid, name }, email, contactNumber } ] }`
        // per Session 2026-06-20.
        const tBody = (await tRes.json()) as {
          data: { ulid: string; name: string }[];
        };
        const lBody = (await lRes.json()) as {
          data: { ulid: string; name: string; active: boolean }[];
        };
        setTeachers(
          (tBody.data ?? []).map((t) => ({ ulid: t.ulid, name: t.name })),
        );
        setLevels(lBody.data ?? []);
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
