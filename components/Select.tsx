"use client";

export interface SelectProps {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  /** Each string is BOTH the label AND the value. Use a custom
   *  component when label and value diverge. */
  options: string[];
  required?: boolean;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function Select({
  label,
  name,
  value,
  onChange,
  options,
  required = false,
  error,
  placeholder = "Select an option",
  disabled = false,
}: SelectProps) {
  const isInvalid = Boolean(error);
  return (
    <div className="mb-4">
      <label htmlFor={name} className="block font-semibold mb-1">
        {label}
      </label>
      <div className="relative">
        <select
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          aria-invalid={isInvalid || undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          className={
            "w-full px-3 py-2 pr-9 border rounded bg-surface appearance-none focus:outline-none focus:ring-2 focus:ring-primary-600 " +
            (isInvalid
              ? "border-danger focus:ring-danger"
              : "border-surface-border") +
            (value ? "" : " text-gray-500")
          }
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
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
