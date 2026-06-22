import { describe, it, expect } from "vitest";

/**
 * Integration tests for the Stage 3 single-resource teacher endpoints.
 *
 * These tests are SCENARIO-DRIVEN and exercise the FULL stack:
 * session cookie + CSRF token + Next.js route handler + typeORM
 * repository + MySQL — against a freshly-seeded MySQL container.
 *
 * Per the constitution Principle III + the plan's Test Strategy,
 * the SC-* mapping covers the SC-001..SC-008 success criteria
 * enumerated in `006-teachers-classes-mutations/quickstart.md`.
 *
 * Each scenario below is currently a `it.todo` placeholder; the
 * full test bodies require a running MySQL container + a seeded
 * admin session. Run via `npm run test:integration`.
 */

describe("SC-001 — Edit Teacher happy path (US1)", () => {
  it.todo(
    "navigate to /teachers, click ... → Edit on a row, change name + email, submit, " +
      "verify row reflects new values AND PUT 200 carries previousModifiedAt",
  );
});

describe("SC-002 — Delete Teacher happy path (US2)", () => {
  it.todo(
    "click ... → Delete, confirm modal, verify row disappears AND DELETE 200 " +
      "returns { ulid: <deleted-teacher-ulid> }",
  );
});

describe("SC-003 — Delete Teacher form-teacher 409 guard (US2)", () => {
  it.todo(
    "seed a teacher + a class where the class's form_teacher_id points at the " +
      "teacher; DELETE the teacher → 409 with the singular envelope " +
      "{ error: '... class \"<className>\". Reassign or delete that class first.', " +
      "details: { classUlid, className } }",
  );
});

describe("SC-004 — Idempotent DELETE (US2, US4)", () => {
  it.todo(
    "DELETE a teacher (or class) twice — first call → 200; second call → 404 " +
      "(per Principle X.2)",
  );
});

describe("SC-005 — Singapore contact-number rule on PUT (US1)", () => {
  it.todo(
    "PUT a teacher with contactNumber `12345678` → 400 with the message " +
      "'Contact number must start with 8 or 9 and be 8 digits.'; PUT with " +
      "`912345678` (9-digit) → 400; PUT with `91234567` → 200",
  );
});

describe("SC-007 — Auth + CSRF coverage on the new endpoints (US1, US2)", () => {
  it.todo(
    "PUT / DELETE on /api/v1.0/teachers/[ulid] without a session cookie → 401; " +
      "with a session but no X-CSRF-Token → 403; with both → 200 / 200",
  );
});

describe("SC-008 — Row-exclusion self-match on email (US1)", () => {
  it.todo(
    "PUT a teacher with the SAME email the row already has → 200; PUT with " +
      "an email belonging to a DIFFERENT teacher → 409 'Email already in use'",
  );
});
