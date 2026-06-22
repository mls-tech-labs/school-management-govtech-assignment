"use client";

export interface FormTeacherSelectProps {
  teachers: { ulid: string; name: string }[];
  /** Teacher ulid (the server-side lookup key). */
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

export function FormTeacherSelect({
  teachers,
  value,
  onChange,
  error,
}: FormTeacherSelectProps) {
  const isInvalid = Boolean(error);

  if (teachers.length === 0) {
    return (
      <div className="mb-4">
        <label htmlFor="formTeacher" className="block font-semibold mb-1">
          Form Teacher
        </label>
        <div className="card flex flex-row items-center justify-between gap-2">
          <span>No existing teachers.</span>
          <a
            href="/teachers/add"
            className="text-primary-600 font-semibold hover:underline"
          >
            Add a teacher
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label htmlFor="formTeacher" className="block font-semibold mb-1">
        Form Teacher
      </label>
      <div className="relative">
        <select
          id="formTeacher"
          name="formTeacher"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          aria-invalid={isInvalid || undefined}
          aria-describedby={error ? "formTeacher-error" : undefined}
          className={
            "w-full px-3 py-2 pr-9 border rounded bg-surface appearance-none focus:outline-none focus:ring-2 focus:ring-primary-600 " +
            (isInvalid
              ? "border-danger focus:ring-danger"
              : "border-surface-border") +
            (value ? "" : " text-gray-500")
          }
        >
          <option value="" disabled>
            Assign a form teacher
          </option>
          {teachers.map((t) => (
            <option key={t.ulid} value={t.ulid}>
              {t.name}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
        >
          ▾
        </span>
      </div>
      {isInvalid ? (
        <div
          id="formTeacher-error"
          className="text-danger text-sm mt-1"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
