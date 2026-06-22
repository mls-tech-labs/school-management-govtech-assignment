"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/StateViews";
import { ClassTable, ClassRow } from "./_components/ClassTable";

export default function ClassesPage() {
  const [data, setData] = useState<ClassRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/v1.0/classes", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const body = (await res.json()) as { data: ClassRow[] };
      setData(body.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load classes");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const isEmpty = data !== null && data.length === 0;

  return (
    <>
      {!isEmpty ? (
        <div className="flex items-center justify-between mt-2 mb-6">
          <h1 className="text-2xl font-bold m-0">Classes</h1>
          <Link href="/classes/add">
            <button
              type="button"
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded border-0 cursor-pointer"
            >
              + Add Class
            </button>
          </Link>
        </div>
      ) : (
        <h1 className="text-2xl font-bold mt-2 mb-6">Classes</h1>
      )}
      {data === null && !error ? <LoadingState /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : isEmpty ? (
        <EmptyState
          message="There are no existing classes yet."
          action={{ label: "Add Class", href: "/classes/add" }}
        />
      ) : data ? (
        <ClassTable classes={data} onClassDeleted={() => void load()} />
      ) : null}
    </>
  );
}