"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/StateViews";
import { TeacherTable, TeacherRow } from "./_components/TeacherTable";

export default function TeachersPage() {
  const [data, setData] = useState<TeacherRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/v1.0/teachers", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const body = (await res.json()) as { data: TeacherRow[] };
      setData(body.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load teachers");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const isEmpty = data !== null && data.length === 0;

  return (
    <>
      {/*
        Per the `Teachers - Empty State.png` design, the page-header
        `+ Add Teacher` button is hidden when the table is empty —
        the centred empty card carries its own CTA instead. The button
        only renders above the populated table.
      */}
      {!isEmpty ? (
        <div className="flex items-center justify-between mt-2 mb-6">
          <h1 className="text-2xl font-bold m-0">Teachers</h1>
          <Link href="/teachers/add">
            <button
              type="button"
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded border-0 cursor-pointer"
            >
              + Add Teacher
            </button>
          </Link>
        </div>
      ) : (
        <h1 className="text-2xl font-bold mt-2 mb-6">Teachers</h1>
      )}
      {data === null && !error ? <LoadingState /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : isEmpty ? (
        <EmptyState
          message="There are no existing teachers yet."
          action={{ label: "Add Teacher", href: "/teachers/add" }}
        />
      ) : data ? (
        <TeacherTable teachers={data} onTeacherDeleted={() => void load()} />
      ) : null}
    </>
  );
}
