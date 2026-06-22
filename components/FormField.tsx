"use client";

export interface FormFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "tel" | "number" | "password";
  placeholder?: string;
  required?: boolean;
  error?: string;
  autoComplete?: string;
}

export function FormField({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  error,
  autoComplete,
}: FormFieldProps) {
  const isInvalid = Boolean(error);
  return (
    <div className="mb-4">
      <label htmlFor={name} className="block font-semibold mb-1">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={isInvalid || undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className={
          "w-full px-3 py-2 border rounded bg-surface focus:outline-none focus:ring-2 focus:ring-primary-600 " +
          (isInvalid
            ? "border-danger focus:ring-danger"
            : "border-surface-border")
        }
      />
      {error ? (
        <div
          id={`${name}-error`}
          className="text-danger text-sm mt-1"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
