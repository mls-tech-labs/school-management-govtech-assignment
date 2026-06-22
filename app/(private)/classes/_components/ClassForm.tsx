"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notification } from "antd";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/Button";
import { FormTeacherSelect } from "./FormTeacherSelect";
import { LevelSelect } from "./LevelSelect";
import { getCsrfToken } from "@/lib/security/csrf-client";

export interface ClassFormProps {
  teachers: { ulid: string; name: string }[];
  levels: { ulid: string; name: string; active: boolean }[];
  initialValues?: {
    ulid: string;
    name: string;
    level: { ulid: string; name: string };
    formTeacher: { ulid: string; name: string };
    /** Captured on mount — used to detect concurrent edits in PUT 200. */
    modifiedAt?: string;
  };
}

function matchFieldError(message: string): [string, string] | null {
  const m = message.toLowerCase();
  if (m.includes("level")) return ["level", "Please select a valid class level."];
  if (m.includes("name")) return ["name", "Class name is required."];
  if (m.includes("formteacher") || m.includes("teacher")) {
    return ["formTeacher", "Please select a valid teacher."];
  }
  return null;
}

export function ClassForm({ teachers, levels, initialValues }: ClassFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialValues);
  const [level, setLevel] = useState(initialValues?.level.name ?? "");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [formTeacher, setFormTeacher] = useState(
    initialValues?.formTeacher.ulid ?? "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        setErrors({ formTeacher: "Please select a valid teacher." });
        setSubmitting(false);
        return;
      }
      const body = {
        level: { ulid: selectedLevel.ulid, name: selectedLevel.name },
        name,
        formTeacher: {
          ulid: selectedTeacher.ulid,
          name: selectedTeacher.name,
        },
      };
      const url = isEdit
        ? `/api/v1.0/classes/${initialValues!.ulid}`
        : "/api/v1.0/classes";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken() ?? "",
        },
        body: JSON.stringify(body),
      });
      if (res.status === 200 || res.status === 201) {
        if (isEdit && initialValues?.modifiedAt) {
          const data = (await res.json().catch(() => ({}))) as {
            previousModifiedAt?: string;
          };
          if (
            data.previousModifiedAt &&
            data.previousModifiedAt !== initialValues.modifiedAt
          ) {
            const t = new Date(data.previousModifiedAt);
            const hh = String(t.getHours()).padStart(2, "0");
            const mm = String(t.getMinutes()).padStart(2, "0");
            const ss = String(t.getSeconds()).padStart(2, "0");
            notification.warning({
              message: "Concurrent edit detected",
              description: `Note: this record was edited by another administrator at ${hh}:${mm}:${ss} — your changes are saved, but please verify.`,
              placement: "topRight",
              duration: 8,
            });
          }
        }
        router.push("/classes");
        return;
      }
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (res.status === 400) {
        const match = matchFieldError(data.error ?? "");
        if (match) {
          const [field, message] = match;
          setErrors({ [field]: message });
        } else {
          setFormError(data.error ?? "Please review the highlighted fields.");
        }
      } else if (res.status === 404) {
        if ((data.error ?? "").toLowerCase().includes("teacher")) {
          setErrors({ formTeacher: "Teacher not found." });
        } else {
          setFormError("Class not found. It may have been deleted.");
        }
      } else if (res.status === 409) {
        // PUT path: 409 = duplicate name or form-teacher collision.
        const m = (data.error ?? "").toLowerCase();
        if (m.includes("name")) {
          setErrors({ name: "Class name already in use." });
        } else if (m.includes("formteacher") || m.includes("assigned") || m.includes("teacher")) {
          setErrors({
            formTeacher: "This teacher is already the form teacher of another class.",
          });
        } else {
          setFormError(data.error ?? "This class conflicts with an existing record.");
        }
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
          {submitting
            ? isEdit ? "Saving…" : "Adding…"
            : isEdit ? "Save Class" : "Add Class"}
        </Button>
      </div>
    </form>
  );
}
