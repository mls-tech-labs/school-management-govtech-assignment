"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/Button";
import { FormTeacherSelect } from "./FormTeacherSelect";
import { LevelSelect } from "./LevelSelect";
import { getCsrfToken } from "@/lib/security/csrf-client";

/**
 * The Add Class form expects teachers with `ulid` (per
 * `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
 * — POST/GET reference object shape) so the form can build the
 * nested `formTeacher: { ulid, name }` body that the API expects.
 */
export interface ClassFormProps {
  teachers: { ulid: string; name: string }[];
  levels: { ulid: string; name: string; active: boolean }[];
}

function mapError(field: string, message: string): string {
  const lower = message.toLowerCase();
  if (
    field === "level" ||
    field === "level.ulid" ||
    lower.includes("level")
  ) {
    return "Please select a valid class level.";
  }
  if (field === "name" || lower.includes("name")) {
    return "Class name is required.";
  }
  if (
    field === "formTeacher" ||
    field === "formTeacher.ulid" ||
    lower.includes("formteacher") ||
    lower.includes("teacher")
  ) {
    return "Please select a valid teacher.";
  }
  return message;
}

/**
 * Add Class form. The wire shape submitted to
 * `POST /api/v1.0/classes` is the nested `{ ulid, name }` shape
 * per Session 2026-06-20 — both `level` and `formTeacher` are
 * nested objects. The form keeps flat `level` and `formTeacher`
 * display values (the user picks by name in the dropdown) and
 * looks up the corresponding `ulid` at submit time.
 */
export function ClassForm({ teachers, levels }: ClassFormProps) {
  const router = useRouter();
  const [level, setLevel] = useState("");
  const [name, setName] = useState("");
  const [formTeacher, setFormTeacher] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Lookup the selected row so we can build the nested wire payload.
  const selectedLevel = levels.find((l) => l.name === level);
  const selectedTeacher = teachers.find((t) => t.ulid === formTeacher);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      if (!selectedLevel) {
        setErrors({ level: "Please select a valid class level." });
        setSubmitting(false);
        return;
      }
      if (!selectedTeacher) {
        setErrors({
          formTeacher: "Please select a valid teacher.",
        });
        setSubmitting(false);
        return;
      }
      const res = await fetch("/api/v1.0/classes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken() ?? "",
        },
        body: JSON.stringify({
          level: { ulid: selectedLevel.ulid, name: selectedLevel.name },
          name,
          formTeacher: {
            ulid: selectedTeacher.ulid,
            name: selectedTeacher.name,
          },
        }),
      });
      if (res.status === 201) {
        router.push("/classes");
        return;
      }
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (res.status === 400) {
        const m = (data.error ?? "").toLowerCase();
        const next: Record<string, string> = {};
        if (m.includes("level")) next.level = mapError("level", data.error ?? "");
        else if (m.includes("name"))
          next.name = mapError("name", data.error ?? "");
        else if (
          m.includes("formteacher") ||
          m.includes("teacher")
        )
          next.formTeacher = mapError(
            "formTeacher",
            data.error ?? "",
          );
        else setFormError(data.error ?? "Please review the highlighted fields.");
        setErrors(next);
      } else if (res.status === 404) {
        setErrors({
          formTeacher: "Teacher not found.",
        });
      } else if (res.status === 409) {
        setFormError(data.error ?? "This class conflicts with an existing record.");
      } else {
        setFormError(data.error ?? "Could not save the class. Please try again.");
      }
    } catch {
      setFormError("Network error. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled = submitting || teachers.length === 0;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="card">
        <LevelSelect
          levels={levels}
          value={level}
          onChange={setLevel}
          error={errors.level}
        />
        <FormField
          label="Class Name"
          name="name"
          value={name}
          onChange={setName}
          placeholder="Class Name"
          required
          error={errors.name}
        />
        <FormTeacherSelect
          teachers={teachers}
          value={formTeacher}
          onChange={setFormTeacher}
          error={errors.formTeacher}
        />
        {formError ? (
          <div className="text-danger text-sm mt-2" role="alert">
            {formError}
          </div>
        ) : null}
      </div>
      <div className="flex flex-row justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={() => router.back()}>
          ← Back
        </Button>
        <Button type="submit" variant="primary" disabled={submitDisabled}>
          {submitting ? "Adding…" : "Add Class"}
        </Button>
      </div>
    </form>
  );
}
