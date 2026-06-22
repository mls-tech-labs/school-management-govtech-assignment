import { describe, it, expect } from "vitest";

/**
 * Integration tests for the Stage 3 single-resource class endpoints.
 *
 * These tests are SCENARIO-DRIVEN and exercise the FULL stack:
 * session cookie + CSRF token + Next.js route handler + typeORM
 * repository + MySQL — against a freshly-seeded MySQL container.
 *
 * Per the constitution Principle III + the plan's Test Strategy.
 */

describe("SC-006 — Edit Class happy path + form-teacher collision (US3)", () => {
  it.todo(
    "seed two classes pointing at the same form teacher (the UNIQUE index " +
      "uq_classes_form_teacher_id is the backstop); PUT class A to a different " +
      "teacher → 200; PUT class B to class A's form teacher → 409 " +
      "'Teacher already assigned'",
  );
});

describe("SC-004 — Idempotent DELETE on classes (US4)", () => {
  it.todo(
    "DELETE a class twice — first call → 200; second call → 404 " +
      "(per Principle X.2)",
  );
});

describe("SC-007 — Auth + CSRF coverage on the new endpoints (US3, US4)", () => {
  it.todo(
    "PUT / DELETE on /api/v1.0/classes/[ulid] without a session cookie → 401; " +
      "with a session but no X-CSRF-Token → 403; with both → 200 / 200",
  );
});

describe("SC-008 — Row-exclusion self-match on formTeacher + name (US3)", () => {
  it.todo(
    "PUT a class with the SAME form teacher it already has → 200; PUT with a " +
      "name belonging to a DIFFERENT class → 409 'Class name already in use'",
  );
});
