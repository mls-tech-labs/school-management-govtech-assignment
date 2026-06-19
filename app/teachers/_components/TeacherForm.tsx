"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";

export interface TeacherFormProps {
  subjects: { name: string; active: boolean }[];
}

/**
 * Maps Joi's machine-readable error message to the design's friendly
 * English copy. The server envelope keeps Joi's text so the API contract
 * stays testable; the form renders the design copy for the administrator.
 */
function mapError(field: string, message: string): string {
  const lower = message.toLowerCase();
  if (field === "email" || lower.includes("email")) {
    return "This email address is invalid.";
  }
  if (field === "contactNumber" || lower.includes("contactnumber") || lower.includes("pattern")) {
    return "This work contact number is invalid.";
  }
  if (field === "subject" || lower.includes("subject")) {
    return "Please select a valid subject.";
  }
  if (field === "name" || lower.includes("name")) {
    return "Name is required.";
  }
  return message;
}

export function TeacherForm({ subjects }: TeacherFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const subjectOptions = subjects.map((s) => s.name);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1.0/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, email, contactNumber }),
      });
      if (res.status === 201) {
        router.push("/teachers");
        return;
      }
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (res.status === 400) {
        // Field-level: Joi message references the field path, e.g.
        // `"contactNumber" must match pattern...`. We map by message key.
        const m = (data.error ?? "").toLowerCase();
        const next: Record<string, string> = {};
        if (m.includes("name")) next.name = mapError("name", data.error ?? "");
        else if (m.includes("subject")) next.subject = mapError("subject", data.error ?? "");
        else if (m.includes("email")) next.email = mapError("email", data.error ?? "");
        else if (m.includes("contactnumber") || m.includes("pattern"))
          next.contactNumber = mapError("contactNumber", data.error ?? "");
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
          options={subjectOptions}
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
          <div className="form-level-error" role="alert">
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
