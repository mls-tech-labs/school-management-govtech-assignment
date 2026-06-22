# Specification Quality Checklist: Teachers & Classes — UPDATE / DELETE Mutations

**Purpose**: Validate specification completeness and quality before proceeding to planning.
**Created**: 2026-06-22
**Feature**: [specs/006-teachers-classes-mutations/spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - The spec references the project's locked stack (TypeScript / Next.js / Joi / MySQL / typeORM / antd / Tailwind) by reference to the constitution and the existing 001/002/003 specs, consistent with the project-wide convention. New technical details (the `details` envelope extension, the per-row `...` menu, the DELETE confirmation modal) are introduced as user-observable behaviors, not as code-level prescriptions.
- [x] Focused on user value and business needs
  - The four user stories each open with a "Why this priority" paragraph that connects the story to a real admin-tool outcome (correcting bad data, recovering from out-of-date records, the form-teacher referential-integrity guard, idempotent retry safety).
- [x] Written for non-technical stakeholders
  - Acceptance scenarios are written in plain language; HTTP status codes appear only where they are the user-observable contract (e.g., "the API returns HTTP 409 Conflict" is the contract the UI consumes, not an implementation note).
- [x] All mandatory sections completed
  - User Scenarios & Testing, Requirements (Functional + Key Entities), Success Criteria, Assumptions, and Clarifications are all populated. No placeholder sections.

## Requirement Completeness

- [x] No `[NEEDS CLARIFICATION]` markers remain
  - All four clarification questions (Edit UX shape, DELETE modal copy, 409 envelope extension, UPDATE idempotency semantics) and the contact-number restoration were resolved during the Clarifications session on 2026-06-22. No `[NEEDS CLARIFICATION]` markers are present in the spec body.
- [x] Requirements are testable and unambiguous
  - FR-001 through FR-015 each describe a single capability with explicit inputs, outputs, and conditions. Where ambiguity could exist (e.g., what `details` carries on the 409 envelope), the spec names the field shape and example values explicitly.
- [x] Success criteria are measurable
  - SC-001 (under 30 seconds), SC-002 (under 5 seconds), SC-003 (100% of DELETE-Teacher against form teachers return 409 with the named envelope), SC-004 (100% of second DELETEs return 404 silently), SC-005 (100% of UPDATE-Teacher with bad contact number rejected), SC-006 (100% of UPDATE-Class form-teacher collision rejected), SC-007 (100% auth and CSRF coverage), SC-008 (100% error envelope coverage) — every criterion is a percentage, a time bound, or a contract.
- [x] Success criteria are technology-agnostic (no implementation details)
  - SC criteria name user-observable outcomes (the row disappears, the notification appears, the list refreshes silently). HTTP status codes are the user-observable contract for the API consumer; they are not implementation details in this codebase (the project's existing 001/002/003 specs treat them as the API contract).
- [x] All acceptance scenarios are defined
  - User Story 1 has 5 acceptance scenarios; User Story 2 has 5; User Story 3 has 6; User Story 4 has 5 — covering happy paths, validation rejections, race conditions, network failures, and the form-teacher collision case.
- [x] Edge cases are identified
  - Six edge cases are listed: direct-URL navigation to a missing `ulid`, deactivated subject, same form teacher on the same class, concurrent delete race, leading-digit contact number rejection, expired CSRF token.
- [x] Scope is clearly bounded
  - The Stage 3 In Scope block (from the constitution v2.5.0) is referenced explicitly in FR-015 and the Assumptions section. Stage 3 Out of Scope items (bulk, soft delete, PATCH, cascading delete, new entities, FK migration of audit columns) are reflected in the spec by omission — the spec does not propose any of them.
- [x] Dependencies and assumptions identified
  - The Assumptions section names 11 assumptions: desktop-only menu, existing tables reused, Edit form reuses Add form components, no single-resource GET, antd Modal.confirm, Tailwind destructive token, test file reuse, `details` envelope is additive, single-query form-teacher check, CSRF helper reuse, constitution v2.5.0 is the upstream input.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
  - Each FR has at least one matching SC or acceptance scenario: FR-001/FR-004 → Stories 1-4 + SC-001/SC-002; FR-002/FR-003 → Stories 1 and 3 acceptance scenarios; FR-005 → Stories 2 and 3 acceptance scenarios + SC-005/SC-006; FR-006 → Stories 2 and 4 acceptance scenarios + SC-004; FR-007/FR-008 → Stories 1 and 3 acceptance scenarios; FR-009/FR-010 → Stories 2 and 4 acceptance scenarios + SC-003/SC-004; FR-011 → SC-007; FR-012 → SC-008; FR-013 → SC-005; FR-014 → implicit in FR-007/FR-008/FR-009/FR-010; FR-015 → Assumptions + propagation contract.
- [x] User scenarios cover primary flows
  - Stories 1 and 2 cover Teacher edit + delete; Stories 3 and 4 cover Class edit + delete. The cross-cutting 409 path on DELETE-Teacher is the canonical failure mode for Principle X.1 and is covered in Story 2 acceptance scenarios 3 + SC-003. The form-teacher collision on UPDATE-Class is the canonical failure mode for Principle X.3 and is covered in Story 3 acceptance scenario 4 + SC-006.
- [x] Feature meets measurable outcomes defined in Success Criteria
  - SC-001/SC-002 set the user-perceived latency budgets (30s edit, 5s delete). SC-003/SC-004 set the API-contract invariants (form-teacher guard, idempotent DELETE). SC-005/SC-006 set the per-field validation coverage. SC-007/SC-008 set the security and error-envelope coverage.
- [x] No implementation details leak into specification
  - The spec names the API contract (PUT/DELETE on `/api/v1.0/teachers/[ulid]` and `/api/v1.0/classes/[ulid]`), the UI components (per-row `...` menu, antd `Modal.confirm`), the route paths (`/teachers/[ulid]/edit`, `/classes/[ulid]/edit`), and the helper (`lib/security/csrf-client.ts → getCsrfToken()`) — all of which are project-locked conventions, not new architectural decisions. The implementation strategy (how the form-teacher check is implemented as a single indexed query) is documented in the Assumptions as a known-good default but is not a hard constraint on `plan.md`.

## Notes

- Items marked `[x]` are confirmed against the spec as written on 2026-06-22 (re-validated after the DELETE-Teacher 409 envelope one-to-one simplification — Session 2026-06-22 (DELETE-Teacher 409 envelope — one-to-one simplification) sub-session; the Q6 simplification improves testability of the 409 envelope shape and removes the unreachable N > 5 truncation logic; no checklist item regresses).
- The spec's `Clarifications` section (Session 2026-06-22) resolves six pre-implementation questions that were not present in the user's description: the Edit form's UX shape (separate page), the DELETE modal's copy and button styling, the 409 envelope's optional `details` extension (original Q3 — superseded by Q6 singular shape), the strict vs loose idempotency semantics of UPDATE, the single-resource fetch pivot (Q2 re-answer per constitution v2.6.0), and the DELETE-Teacher 409 envelope one-to-one simplification (Q6 — singular `classUlid` / `className` matching the DB's `UNIQUE INDEX uq_classes_form_teacher_id` constraint). These resolutions are baked into the spec body (FR-002/FR-003/FR-004/FR-005/FR-009/User Story 2 acceptance scenario 3/SC-003/Key Entities) so `/speckit-clarify` does not need to re-ask them.
- The propagation follow-up (FR-015) flags the per-spec Clarifications sessions needed in `001-teachers/spec.md`, `002-classes/spec.md`, and `003-backend-api-db/spec.md` as Stage 3 follow-up TODOs. Those amendments are downstream of this spec and are not part of the `/speckit-plan` scope for `006-teachers-classes-mutations`; they are propagated in a separate workflow step (see the constitution v2.5.0 Sync Impact Report). The Q6 propagation is now complete — `002-classes/spec.md` (Session 2026-06-22 Stage 3 propagation Q2 wording + Edge Cases bullet + new Clarifications sub-session) and `003-backend-api-db/spec.md` (FR-012 example + Session 2026-06-22 Stage 3 propagation Q3 / Q4 superseded + new Clarifications sub-session) mirror the singular envelope; `001-teachers/spec.md` does not reference the DELETE-Teacher 409 envelope and needs no propagation.
- Pre-existing project conventions (TypeScript strict, Next.js Route Handlers, Joi validation, typeORM, antd, Tailwind, MySQL, CSRF middleware, session middleware) are inherited from the constitution and the existing specs and are not re-litigated here. The plan.md / tasks.md for this feature will reference the existing `001-teachers/plan.md` and `002-classes/plan.md` for the shared stack.