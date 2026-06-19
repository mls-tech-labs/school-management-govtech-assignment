"use client";
import { Select as AntdSelect } from "antd";

export interface SelectProps {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  /**
   * The list of options shown in the dropdown. Each string is BOTH the
   * displayed label AND the value submitted. For cases where label and
   * value diverge (e.g., Form Teacher — name vs email), use a purpose-
   * built component rather than this generic Select.
   */
  options: string[];
  required?: boolean;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Searchable single-select dropdown for cases where the visible label
 * equals the submitted value (Subjects, Levels). Wraps the Ant Design
 * (`antd`) `<Select>` primitive with `showSearch`, styled with Tailwind
 * CSS utility classes (per Constitution v2.3.0).
 *
 * For the Form Teacher control (where label is the teacher's name and
 * value is the teacher's email), use `FormTeacherSelect` instead — it
 * carries the email/name mapping explicitly.
 */
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
      <label
        htmlFor={name}
        className="block font-semibold mb-1"
      >
        {label}
      </label>
      <AntdSelect
        id={name}
        value={value || undefined}
        onChange={onChange}
        options={options.map((o) => ({ value: o, label: o }))}
        showSearch
        placeholder={placeholder}
        disabled={disabled}
        status={isInvalid ? "error" : undefined}
        className="w-full"
      />
      {isInvalid ? (
        <div className="text-danger text-sm mt-1" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
