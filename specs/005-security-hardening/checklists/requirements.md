# Specification Quality Checklist: Security Hardening (CORS, CSP, CSRF, XSS)

**Purpose**: Validate specification completeness and quality before
proceeding to planning.
**Created**: 2026-06-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - The spec names only project-wide inherited standards already
    fixed by the constitution (Next.js, React, TypeScript, Joi,
    typeORM, Redis, antd, Tailwind, `.env`). No new libraries or
    implementation choices are pinned.
- [x] Focused on user value and business needs
  - Each user story is framed as a concrete security outcome
    (e.g., "CORS allow-list rejects unauthorised origins",
    "CSP blocks injected inline scripts"). Operator and
    administrator workflows are named in User Stories 5 and 6.
- [x] Written for non-technical stakeholders
  - Acceptance scenarios use plain-language Given/When/Then.
    Technical depth is restricted to the Requirements and
    Success Criteria sections, which is unavoidable for a
    security feature.
- [x] All mandatory sections completed
  - Header, User Scenarios & Testing, Requirements, Success
    Criteria, and Assumptions are all present. A
    "Related specs & Constitutional alignment" section is
    added per the project convention (matches 004's structure).

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
  - None introduced. The constitution's Principle IX already
    pins the four controls, and the user explicitly asked for
    `.env`-driven configuration with minimal-but-necessary
    defaults. The plan phase will pin the exact `.env` keys
    and values; the spec pins the contract.
- [x] Requirements are testable and unambiguous
  - Each FR-001..FR-020 names a single observable assertion
    (header present, cookie absent/present, status code, JSON
    body discriminator). Each FR maps to at least one
    acceptance scenario or success criterion.
- [x] Success criteria are measurable
  - SC-001..SC-010 each name a verifiable outcome (status
    code, header presence/absence, `.env`-only reconfiguration,
    test-suite coverage).
- [x] Success criteria are technology-agnostic (no implementation details)
  - SC-001 mentions `.env` because the user explicitly asked
    for `.env`-driven configuration; `.env` is the
    project-wide standard (CLAUDE.md). The other success
    criteria reference observable HTTP behaviour (status codes,
    header names, JSON error discriminators), not frameworks.
- [x] All acceptance scenarios are defined
  - 6 user stories with 2-4 acceptance scenarios each;
    8 edge cases enumerated.
- [x] Edge cases are identified
  - Empty allow-list, non-allow-listed preflight, `Origin: null`,
    HEAD/OPTIONS bypass, auth-before-CSRF layering, login
    exemption, token rotation on login, CSP report-only mode,
    HSTS over HTTP.
- [x] Scope is clearly bounded
  - FR-016 + FR-017 pin "no new entities, no new endpoints".
    The Assumptions section names the controls that are NOT
    in this feature's scope (DOMPurify, MFA, OAuth, rate
    limiting). The constitution's Stage Scope + Stage 2
    Out-of-Scope block is the upstream authority.
- [x] Dependencies and assumptions identified
  - Related specs (001, 002, 003, 004) called out explicitly.
    Cross-cutting constitution principles (IV, VII, IX) called
    out. Inherited cross-cutting rules (ULID, audit columns,
    no migrations) called out in the Related specs section.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
  - FR-001..FR-005 (CORS) → User Story 1, SC-002, SC-003.
  - FR-003..FR-005 (CSP + companion headers) → User Story 2,
    SC-005.
  - FR-006..FR-008, FR-018 (CSRF) → User Story 3, SC-004.
  - FR-009..FR-011 (XSS) → User Story 4, SC-006.
  - FR-012..FR-014, FR-020 (`.env`-driven config) → User
    Story 5, SC-001, SC-008, SC-009.
  - FR-014 (dev/prod posture) → User Story 6.
  - FR-015 (unit-testable helpers) → SC-007.
  - FR-019 (back-compat with 001/002) → assumed carried into
    the plan phase for the React UI edit list.
- [x] User scenarios cover primary flows
  - All four hardening controls are covered as primary flows
    (P1). Configuration management and dev/prod posture are
    covered as P2/P3 supporting flows.
- [x] Feature meets measurable outcomes defined in Success Criteria
  - SC-001..SC-010 are each tied back to one or more FRs in
    the matrix above.
- [x] No implementation details leak into specification
  - No new libraries named. No new file paths named (those
    are `plan.md`'s job). No new API endpoints named (FR-017
    explicitly forbids them). Allowed references to inherited
    standards (Next.js, React, Joi, typeORM, Redis, `.env`)
    are inherited from the constitution and CLAUDE.md.

## Notes

- **First-pass validation, no iterations required.** All
  checklist items pass on the initial write. The user input
  was concrete enough (CORS, XSS, CSRF, CSP, `.env`-driven,
  minimal-but-necessary) that no clarification questions
  were needed; the constitution's Principle IX and the
  Stage 2 In Scope block pre-answered the design choices.
- **Items deferred to the plan phase** (not spec-phase
  concerns):
  - Exact `.env` key names and default values
    (`.env.example` will document them at implementation
    time; the spec pins the *contract* via FR-012 + FR-013).
  - Exact CSP nonce-generation strategy (the spec pins
    "no nonce in Stage 2, but `CSP_POLICY` env override
    supports a future nonce feature").
  - Exact CSRF token random source and encoding (the spec
    pins "≥ 128 bits, opaque, bound to session").
  - React UI edit list for sending `X-CSRF-Token` on
    state-changing calls (FR-019 names the contract;
    plan.md produces the precise file-level diff).
- Items marked incomplete require spec updates before
  `/speckit-clarify` or `/speckit-plan`. (None marked
  incomplete.)
