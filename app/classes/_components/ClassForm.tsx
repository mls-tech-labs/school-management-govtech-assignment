"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/Button";
import { FormTeacherSelect } from "./FormTeacherSelect";
import { LevelSelect } from "./LevelSelect";

export interface ClassFormProps {
  teachers: { email: string; name: string }[];
  levels: { name: string; active: boolean }[];
}

function mapError(field: string, message: string): string {
  const lower = message.toLowerCase();
  if (field === "level" || lower.includes("level")) {
    return "Please select a valid class level.";
  }
  if (field === "name" || lower.includes("name")) {
    return "Class name is required.";
  }
  if (field === "teacherEmail" || lower.includes("teacheremail")) {
    return "Please select a valid teacher.";
  }
  return message;
}

export function ClassForm({ teachers, levels }: ClassFormProps) {
  const router = useRouter();
  const [level, setLevel] = useState("");
  const [name, setName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1.0/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, name, teacherEmail }),
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
        else if (m.includes("name")) next.name = mapError("name", data.error ?? "");
        else if (m.includes("teacheremail") || m.includes("teacher"))
          next.teacherEmail = mapError("teacherEmail", data.error ?? "");
        else setFormError(data.error ?? "Please review the highlighted fields.");
        setErrors(next);
      } else if (res.status === 404) {
        setFormError("Teacher not found.");
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
          value={teacherEmail}
          onChange={setTeacherEmail}
          error={errors.teacherEmail}
        />
        {formError ? (
          <div className="form-level-error" role="alert">
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
