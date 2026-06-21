"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";

export interface TeacherFormProps {
  subjects: { ulid: string; name: string; active: boolean }[];
}

function mapError(field: string, message: string): string {
  const lower = message.toLowerCase();
  if (field === "email" || lower.includes("email")) {
    return "This email address is invalid.";
  }
  if (field === "contactNumber" || lower.includes("contactnumber") || lower.includes("pattern")) {
    return "This work contact number is invalid.";
  }
  if (
    field === "subject" ||
    field === "subject.ulid" ||
    lower.includes("subject")
  ) {
    return "Please select a valid subject.";
  }
  if (field === "name" || lower.includes("name")) {
    return "Name is required.";
  }
  return message;
}

/**
 * Add Teacher form. The wire shape submitted to
 * `POST /api/v1.0/teachers` is the nested `{ ulid, name }` shape
 * per `003-backend-api-db/spec.md` Clarifications, Session
 * 2026-06-20 (POST/GET reference object shape). The form keeps a
 * flat `subject` (the user picks a subject by name in the dropdown)
 * and looks up the corresponding `ulid` at submit time.
 */
export function TeacherForm({ subjects }: TeacherFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The dropdown shows names; the API wants the nested { ulid, name }
  // object so the server can resolve by `ulid` against
  // `uq_subjects_ulid`. We look up the selected subject here.
  const selectedSubject = subjects.find((s) => s.name === subject);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      if (!selectedSubject) {
        setErrors({ subject: "Please select a valid subject." });
        setSubmitting(false);
        return;
      }
      const res = await fetch("/api/v1.0/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subject: { ulid: selectedSubject.ulid, name: selectedSubject.name },
          email,
          contactNumber,
        }),
      });
      if (res.status === 201) {
        router.push("/teachers");
        return;
      }
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (res.status === 400) {
        const m = (data.error ?? "").toLowerCase();
        const next: Record<string, string> = {};
        if (m.includes("name")) next.name = mapError("name", data.error ?? "");
        else if (m.includes("subject"))
          next.subject = mapError("subject", data.error ?? "");
        else if (m.includes("email"))
          next.email = mapError("email", data.error ?? "");
        else if (m.includes("contactnumber") || m.includes("pattern"))
          next.contactNumber = mapError(
            "contactNumber",
            data.error ?? "",
          );
        else setFormError(data.error ?? "Please review the highlighted fields.");
        setErrors(next);
      } else if (res.status === 409) {
        setFormError("A teacher with this email already exists.");
      } else if (res.status === 415) {
        setFormError("Submission format was not accepted. Please try again.");
      } else {
        setFormError(data.error ?? "Could not save the teacher. Please try again.");
      }
    } catch {
      setFormError("Network error. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="card">
        <FormField
          label="Name"
          name="name"
          value={name}
          onChange={setName}
          placeholder="Name"
          required
          error={errors.name}
          autoComplete="name"
        />
        <Select
          label="Subject"
          name="subject"
          value={subject}
          onChange={setSubject}
          options={subjects.map((s) => s.name)}
          placeholder="Select a subject"
          required
          error={errors.subject}
        />
        <FormField
          label="Email Address"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="Email address"
          required
          error={errors.email}
          autoComplete="email"
        />
        <FormField
          label="Work Contact Number"
          name="contactNumber"
          value={contactNumber}
          onChange={setContactNumber}
          placeholder="Work contact number"
          required
          error={errors.contactNumber}
          autoComplete="tel"
        />
        {formError ? (
          <div
            className="text-danger text-sm mt-2"
            role="alert"
          >
            {formError}
          </div>
        ) : null}
      </div>
      <div className="flex flex-row justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={() => router.back()}>
          ← Back
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Adding…" : "Add Teacher"}
        </Button>
      </div>
    </form>
  );
}
