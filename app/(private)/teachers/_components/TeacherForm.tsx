"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notification } from "antd";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { getCsrfToken } from "@/lib/security/csrf-client";

export interface TeacherFormProps {
  subjects: { ulid: string; name: string; active: boolean }[];
  initialValues?: {
    ulid: string;
    name: string;
    subject: { ulid: string; name: string };
    email: string;
    contactNumber: string;
    /** Captured on mount — used to detect concurrent edits in PUT 200. */
    modifiedAt?: string;
  };
}

// Match a wire-envelope error message to the field + user-facing copy.
// Order matters: contactNumber before subject before email before name
// (most specific substring first).
function matchFieldError(message: string): [string, string] | null {
  const m = message.toLowerCase();
  if (m.includes("contactnumber") || m.includes("pattern") || m.includes("start")) {
    return ["contactNumber", "This work contact number is invalid."];
  }
  if (m.includes("subject")) return ["subject", "Please select a valid subject."];
  if (m.includes("email")) return ["email", "This email address is invalid."];
  if (m.includes("name")) return ["name", "Name is required."];
  return null;
}

export function TeacherForm({ subjects, initialValues }: TeacherFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialValues);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [subject, setSubject] = useState(initialValues?.subject.name ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [contactNumber, setContactNumber] = useState(
    initialValues?.contactNumber ?? "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The dropdown shows names; the API wants the nested { ulid, name } object.
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
      const body = {
        name,
        subject: { ulid: selectedSubject.ulid, name: selectedSubject.name },
        email,
        contactNumber,
      };
      const url = isEdit
        ? `/api/v1.0/teachers/${initialValues!.ulid}`
        : "/api/v1.0/teachers";
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
        // Edit mode — concurrent-edit toast.
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
        router.push("/teachers");
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
      } else if (res.status === 409) {
        if (isEdit) {
          const m = (data.error ?? "").toLowerCase();
          if (m.includes("email")) {
            setErrors({ email: "This email address is already in use." });
          } else if (m.includes("subject")) {
            setErrors({ subject: "Please select a valid subject." });
          } else {
            setFormError(data.error ?? "Conflict — please review.");
          }
        } else {
          setFormError("A teacher with this email already exists.");
        }
      } else if (res.status === 415) {
        setFormError("Submission format was not accepted. Please try again.");
      } else if (res.status === 404) {
        setFormError("Teacher not found. It may have been deleted.");
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
          <div className="text-danger text-sm mt-2" role="alert">
            {formError}
          </div>
        ) : null}
      </div>
      <div className="flex flex-row justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={() => router.back()}>
          ← Back
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting
            ? isEdit ? "Saving…" : "Adding…"
            : isEdit ? "Save Teacher" : "Add Teacher"}
        </Button>
      </div>
    </form>
  );
}
