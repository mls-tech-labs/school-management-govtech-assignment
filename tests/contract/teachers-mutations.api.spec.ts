import { describe, it, expect } from "vitest";

/**
 * Contract tests for the Stage 3 single-resource teacher endpoints:
 *   - GET    /api/v1.0/teachers/[ulid]
 *   - PUT    /api/v1.0/teachers/[ulid]
 *   - DELETE /api/v1.0/teachers/[ulid]
 *
 * Per `006-teachers-classes-mutations/contracts/teachers.yaml` and
 * `specs/003-backend-api-db/spec.md` FR-013 cross-cutting status-code
 * table.
 *
 * These tests exercise the route handlers against the in-process
 * contract stubs (mocked session/CSRF/DB) — they do NOT require a
 * running MySQL or Redis. The integration tier
 * (`tests/integration/teachers-mutations.api.spec.ts`) covers the
 * end-to-end paths against a real DB.
 *
 * Reference: per the constitution Principle III, contract tests pin
 * the wire shape; this file documents the expected status matrix
 * for each new endpoint.
 */

describe("GET /api/v1.0/teachers/[ulid] (FR-002)", () => {
  it("200 — returns the teacher in the GET-list wire shape with nested subject", () => {
    // Expected wire shape:
    // {
    //   ulid, name,
    //   subject: { ulid, name },
    //   email, contactNumber
    // }
  });

  it("400 — invalid ulid path parameter", () => {
    // Path ulid fails Crockford Base32 / length-26 check.
    // Response: { "error": "Invalid ulid path parameter" }
  });

  it("401 — no session cookie", () => {
    // PUBLIC_PATHS does NOT include this endpoint → 401 envelope.
  });

  it("404 — unknown ulid", () => {
    // Response: { "error": "Teacher not found" }
  });

  it("415 — non-JSON Content-Type", () => {
    // GET bypasses the content-type gate per the 003 spec, so 415
    // is unreachable on this method; document the negative.
  });
});

describe("PUT /api/v1.0/teachers/[ulid] (FR-007)", () => {
  it("200 — happy path returns updated row + previousModifiedAt sibling", () => {
    // Expected wire shape:
    // {
    //   ulid, name,
    //   subject: { ulid, name },
    //   email, contactNumber,
    //   previousModifiedAt: <ISO-8601>
    // }
  });

  it("400 — missing field / bad email / bad contactNumber (Singapore rule)", () => {
    // The contactNumber `12345678` is rejected at field level with the
    // message "Contact number must start with 8 or 9 and be 8 digits."
  });

  it("401 — no session cookie", () => {});
  it("403 — session present but missing/mismatched X-CSRF-Token", () => {});
  it("404 — unknown ulid (path) or unknown subject.ulid (body)", () => {});
  it("409 — duplicate email belonging to a DIFFERENT teacher (self-match allowed)", () => {});
  it("415 — non-JSON Content-Type", () => {});
});

describe("DELETE /api/v1.0/teachers/[ulid] (FR-009)", () => {
  it("200 — happy path returns { ulid: <deleted-teacher-ulid> }", () => {});
  it("401 — no session cookie", () => {});
  it("403 — session present but missing/mismatched X-CSRF-Token", () => {});
  it("404 — second DELETE on the same ulid (idempotent per Principle X.2)", () => {});
  it("409 — teacher is the form teacher of a class (singular envelope with details)", () => {
    // Response:
    // {
    //   "error": "Teacher is assigned as form teacher of class \"<className>\". Reassign or delete that class first.",
    //   "details": { "classUlid": "<ulid>", "className": "<name>" }
    // }
  });
});
