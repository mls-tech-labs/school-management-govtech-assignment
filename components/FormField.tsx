"use client";
import { Form, Input } from "antd";

export interface FormFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "tel" | "number";
  placeholder?: string;
  required?: boolean;
  error?: string;
  autoComplete?: string;
}

/**
 * Shared, feature-agnostic form field. Wraps the Ant Design (`antd`)
 * `<Form.Item>` + `<Input>` primitives and is styled with Tailwind CSS
 * utility classes (per Constitution v2.3.0).
 *
 * Per Principle VIII (Self-Explanatory, Reusable, Simple), this component
 * has no feature-specific knowledge — `TeacherForm` and `ClassForm` are
 * the only callers, both passing plain prop values.
 */
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
      <Form.Item
        label={label}
        htmlFor={name}
        required={required}
        validateStatus={isInvalid ? "error" : undefined}
        help={error}
        className="mb-0"
      >
        <Input
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
          className="w-full"
        />
      </Form.Item>
      {error ? (
        <div id={`${name}-error`} className="sr-only" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
