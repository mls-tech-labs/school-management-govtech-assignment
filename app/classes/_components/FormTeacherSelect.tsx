"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface FormTeacherOption {
  value: string;
  label: string;
}

export interface FormTeacherSelectProps {
  teachers: { email: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

/**
 * Searchable Form Teacher combobox. A search input narrows the options
 * by teacher name or email (case-insensitive substring), and the select
 * confirms the row. Layout uses Tailwind utility classes (per
 * Constitution v2.3.0).
 *
 * Falls back to an empty-state card with a link to `/teachers/add` when
 * no teachers are registered.
 */
export function FormTeacherSelect({
  teachers,
  value,
  onChange,
  error,
}: FormTeacherSelectProps) {
  const [query, setQuery] = useState("");

  const options: FormTeacherOption[] = useMemo(
    () => teachers.map((t) => ({ value: t.email, label: t.name })),
    [teachers],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  if (teachers.length === 0) {
    return (
      <div className="mb-4">
        <label
          htmlFor="teacherEmail"
          className="block font-semibold mb-1"
        >
          Form Teacher
        </label>
        <div className="card flex flex-row items-center justify-between gap-2">
          <span>No existing teachers.</span>
          <Link
            href="/teachers/add"
            className="text-primary-600 font-semibold hover:underline"
          >
            Add a teacher
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label
        htmlFor="teacherEmail"
        className="block font-semibold mb-1"
      >
        Form Teacher
      </label>
      <input
        type="text"
        placeholder="Search teacher by name or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-3 py-2 border border-surface-border rounded mb-1 focus:outline-none focus:ring-2 focus:ring-primary-600"
        aria-label="Search teachers"
      />
      <select
        id="teacherEmail"
        name="teacherEmail"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full px-3 py-2 border border-surface-border rounded bg-surface focus:outline-none focus:ring-2 focus:ring-primary-600"
      >
        <option value="" disabled>
          Assign a form teacher
        </option>
        {filtered.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}