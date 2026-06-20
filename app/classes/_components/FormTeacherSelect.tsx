"use client";

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
        <label
          htmlFor="teacherEmail"
          className="block font-semibold mb-1"
        >
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
      <label
        htmlFor="teacherEmail"
        className="block font-semibold mb-1"
      >
        Form Teacher
      </label>
      <div className="relative">
        <select
          id="teacherEmail"
          name="teacherEmail"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          aria-invalid={isInvalid || undefined}
          aria-describedby={error ? "teacherEmail-error" : undefined}
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
            <option key={t.email} value={t.email}>
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
          id="teacherEmail-error"
          className="text-danger text-sm mt-1"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}