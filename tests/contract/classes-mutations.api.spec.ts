import { describe, it, expect } from "vitest";

/**
 * Contract tests for the Stage 3 single-resource class endpoints:
 *   - GET    /api/v1.0/classes/[ulid]
 *   - PUT    /api/v1.0/classes/[ulid]
 *   - DELETE /api/v1.0/classes/[ulid]
 *
 * Per `006-teachers-classes-mutations/contracts/classes.yaml` and
 * `specs/003-backend-api-db/spec.md` FR-013 cross-cutting status-code
 * table.
 */

describe("GET /api/v1.0/classes/[ulid] (FR-003)", () => {
  it("200 — returns the class in the GET-list wire shape with nested level + formTeacher", () => {
    // Expected wire shape:
    // {
    //   ulid,
    //   level: { ulid, name },
    //   name,
    //   formTeacher: { ulid, name }
    // }
  });

  it("400 — invalid ulid path parameter", () => {});
  it("401 — no session cookie", () => {});
  it("404 — unknown ulid", () => {});
});

describe("PUT /api/v1.0/classes/[ulid] (FR-008)", () => {
  it("200 — happy path returns updated row + previousModifiedAt sibling", () => {
    // Expected wire shape:
    // {
    //   ulid,
    //   level: { ulid, name },
    //   name,
    //   formTeacher: { ulid, name },
    //   previousModifiedAt: <ISO-8601>
    // }
  });

  it("400 — missing field / unknown level.ulid", () => {});
  it("401 — no session cookie", () => {});
  it("403 — session present but missing/mismatched X-CSRF-Token", () => {});
  it("404 — unknown ulid (path) or unknown level.ulid / formTeacher.ulid (body)", () => {});
  it("409 — duplicate name belonging to a DIFFERENT class (self-match allowed)", () => {});
  it("409 — formTeacher.ulid is the form teacher of a DIFFERENT class (self-match allowed)", () => {});
  it("415 — non-JSON Content-Type", () => {});
});

describe("DELETE /api/v1.0/classes/[ulid] (FR-010)", () => {
  it("200 — happy path returns { ulid: <deleted-class-ulid> }", () => {});
  it("401 — no session cookie", () => {});
  it("403 — session present but missing/mismatched X-CSRF-Token", () => {});
  it("404 — second DELETE on the same ulid (idempotent per Principle X.2)", () => {});
  // Note: no 409 path — no other table references classes.id outside the
  // audit columns (per Principle X.2).
});
