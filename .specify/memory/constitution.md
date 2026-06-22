<!--
Sync Impact Report
==================
Version change: 2.6.0 → 2.7.0  [MINOR: Stage 3 implementation
                                  closes three constitutional
                                  follow-up TODOs that were
                                  carried forward from v2.5.0
                                  and v2.6.0:
                                    - TODO(CONTACT_NUMBER_RULE_OWNER)
                                      — the Teacher contactNumber
                                      rule is owned by
                                      `specs/001-teachers/spec.md`
                                      FR-004 and is now restored
                                      to the Singapore-context
                                      `^[89]\d{7}$` regex on
                                      POST and PUT paths.
                                    - TODO(STAGE3_DELETE_RESPONSE_SHAPE)
                                      — DELETE handlers return
                                      `200` + `{ "ulid":
                                      "<deleted-ulid>" }`; the
                                      previous `204 No Content`
                                      draft is retired.
                                    - TODO(STAGE3_GET_SINGLE_RESOURCE_AMENDMENT)
                                      — the two new single-
                                      resource GET endpoints
                                      ship and are the only data
                                      source for the Edit pages.
                                  No new principles are added
                                  and no existing principle is
                                  changed (Principles I–X are
                                  unchanged).]

Modified principles: none (Principles I–X unchanged).

Modified sections (non-principle):
  Stage Scope
    - "Stage 3 — In Scope" block is now IMPLEMENTED. The
      two single-resource GETs (`GET /api/v1.0/teachers/[ulid]`
      and `GET /api/v1.0/classes/[ulid]`), the two PUTs,
      and the two DELETEs all ship with the v2.7.0 amendment.
      The implementation closes the three carry-forward
      TODOs listed in the version-change block above.

Added principles: none.
Removed principles: none.
Removed sections: none.

Templates requiring updates:
  - .specify/templates/plan-template.md      ✅ no change
  - .specify/templates/spec-template.md       ✅ no change
  - .specify/templates/tasks-template.md      ✅ no change
  - .specify/templates/checklist-template.md  ✅ no change
  - .specify/templates/commands/*.md          ✅ none present

Dependent artifacts flagged for manual follow-up (NOT amended
by this constitution update — they are downstream of the
per-feature specs and require their own per-spec
Clarifications sessions):
  - README.md — Stage 3 section added covering the six
    new endpoints, the per-row `...` menu, the Edit
    pages, the concurrent-edit toast, the Singapore
    `^[89]\d{7}$` contact-number rule, the form-teacher
    referential integrity guard, and the idempotent DELETE
    semantics.
  - specs/003-backend-api-db/spec.md — FR-013 status-code
    table + FR-022 versioned-prefix inventory already
    cover the Stage 3 amendments (per v2.5.0 + v2.6.0 sync
    impact reports); no further amendment is required by
    this v2.7.0 update.

Follow-up TODOs (carry forward, minus the three closed):
  - TODO(ANTD_TAILWIND_VERSION): unchanged.
  - TODO(JOI_ALIGNMENT): unchanged.
  - TODO(FUNCTIONAL_REVIEW): unchanged.
  - TODO(PROFILE_PAGE_OUT_OF_SCOPE): unchanged.
  - TODO(RATE_LIMITING_OUT_OF_SCOPE): unchanged.
  - TODO(CRP_INTERPRETATION): unchanged.
  - TODO(LOCAL_DEV_HTTP_POSTURE): unchanged.
  - TODO(STAGE3_BULK_OUT_OF_SCOPE): unchanged.
  - TODO(STAGE3_SOFT_DELETE_OUT_OF_SCOPE): unchanged.
  - TODO(CONTACT_NUMBER_RULE_OWNER): RESOLVED — the
    Singapore `^[89]\d{7}$` regex is restored on POST
    and PUT paths; the cross-cutting module lives at
    `lib/validation/contact-number.ts` and is consumed by
    `lib/validation/teacher.ts`. Both unit tests pass.
  - TODO(STAGE3_DELETE_RESPONSE_SHAPE): RESOLVED — DELETE
    returns `200` + `{ "ulid": "<deleted-ulid>" }`;
    the `204 No Content` draft is retired. The
    `lib/api/{teachers,classes}/[ulid]/route.ts`
    handlers and the `RowActionsMenu` UI are wired to
    the new shape.
  - TODO(STAGE3_GET_SINGLE_RESOURCE_AMENDMENT): RESOLVED
    — the two single-resource GET endpoints ship in
    v2.7.0 and are the only data source for the Edit
    Teacher / Edit Class RSC pages. The
    `TODO(SINGLE_RESOURCE_FETCH_OUT_OF_SCOPE)` marker
    in `006-teachers-classes-mutations/spec.md` is
    superseded by the implemented endpoints.

Sync Impact Report (prior v2.5.0 → v2.6.0 amendment)
=====================================================
Version change: 2.5.0 → 2.6.0  [MINOR: Stage 3 In Scope
                                  expanded with two new
                                  single-resource GET endpoints
                                  (`GET /api/v1.0/teachers/[ulid]`
                                  and
                                  `GET /api/v1.0/classes/[ulid]`).
                                  These endpoints are the data
                                  source for the Stage 3 Edit
                                  Teacher / Edit Class pages owned
                                  by
                                  `specs/006-teachers-classes-mutations/spec.md`
                                  FR-002 / FR-003; the previous
                                  RSC + typeORM fallback in 006 is
                                  superseded. The Stage 3 Out of
                                  Scope entry "single-resource
                                  fetch is a future-stage
                                  amendment that requires a
                                  per-spec clarification" is
                                  REMOVED.]

Modified principles: none (Principles I–X unchanged).

Modified sections (non-principle):
  Stage Scope
    - "Stage 3 — In Scope" block extended with two new
      single-resource GET endpoints (one on Teachers, one
      on Classes). Both endpoints return the row in the
      same shape as a single entry in the corresponding
      list endpoint (per the
      `003-backend-api-db/spec.md` Clarifications
      Session 2026-06-20 (POST/GET reference object
      shape) — i.e. the `subject` / `level` / `formTeacher`
      fields are nested `{ ulid, name }` objects). Both
      endpoints are authenticated (Principle IV — `401`
      without a valid session cookie, inherited from
      `003-backend-api-db/spec.md` FR-013) and CSRF-exempt
      (GET is exempt per Principle IX.3). A `404 Not Found`
      row is added to the cross-cutting FR-013 status-code
      table for an unknown `ulid` (the existing 404 row
      covers DELETE-second-call; the new GET-`[ulid]` 404
      is a separate use of the same status).
    - "Stage 3 — Explicitly Out of Scope" bullet
      "`GET /api/v1.0/teachers/[ulid]` single-resource
      fetch beyond the existing list — single-resource
      fetch is a future-stage amendment that requires a
      per-spec clarification" is REMOVED. The
      single-resource fetch is now Stage 3 In Scope.

Added principles: none.
Removed principles: none.
Removed sections: none.

Templates requiring updates:
  - .specify/templates/plan-template.md      ✅ no change (template is generic)
  - .specify/templates/spec-template.md       ✅ no change (template is generic)
  - .specify/templates/tasks-template.md      ✅ no change (template is generic)
  - .specify/templates/checklist-template.md ✅ no change (template is generic)
  - .specify/templates/commands/*.md          ✅ none present

Dependent artifacts flagged for manual follow-up (NOT amended
by this constitution update — they are downstream of the
per-feature specs and require their own per-spec
Clarifications sessions):
  - specs/001-teachers/spec.md — gains a new FR-007b for
    `GET /api/v1.0/teachers/[ulid]`, mirroring the
    response shape of a single entry in
    `GET /api/v1.0/teachers` (per the existing FR-007).
    The FR-010 status-code table gains a `404 Not Found`
    row (unknown `ulid`). A new Clarifications
    Session 2026-06-22 documents the per-spec amendment.
  - specs/002-classes/spec.md — gains a new FR-007b for
    `GET /api/v1.0/classes/[ulid]`, mirroring the
    response shape of a single entry in
    `GET /api/v1.0/classes` (per the existing FR-007).
    The FR-010 status-code table gains a `404 Not Found`
    row (unknown `ulid`). A new Clarifications
    Session 2026-06-22 documents the per-spec amendment.
  - specs/003-backend-api-db/spec.md — FR-002
    (Teachers API surface) and FR-003 (Classes API
    surface) endpoint inventories gain one new row each
    for the single-resource GETs. FR-022
    (versioned-prefix inventory) is updated to list the
    two new endpoints alongside the existing seven. A
    new Clarifications Session 2026-06-22 documents the
    per-spec amendment.
  - specs/006-teachers-classes-mutations/spec.md — the
    next /speckit-clarify pass on this spec will update
    FR-002 (Edit Teacher page) and FR-003 (Edit Class
    page) to consume the new
    `GET /api/v1.0/teachers/[ulid]` /
    `GET /api/v1.0/classes/[ulid]` endpoints rather
    than the React Server Component + typeORM pattern.
    The
    `TODO(SINGLE_RESOURCE_FETCH_OUT_OF_SCOPE)` marker
    in 006 Edge Cases is removed in that pass. This is
    a per-spec amendment, not a constitutional change.

Follow-up TODOs (carry forward, plus the new one):
  - TODO(ANTD_TAILWIND_VERSION): unchanged.
  - TODO(JOI_ALIGNMENT): unchanged.
  - TODO(FUNCTIONAL_REVIEW): unchanged.
  - TODO(PROFILE_PAGE_OUT_OF_SCOPE): unchanged.
  - TODO(RATE_LIMITING_OUT_OF_SCOPE): unchanged.
  - TODO(CRP_INTERPRETATION): unchanged.
  - TODO(LOCAL_DEV_HTTP_POSTURE): unchanged.
  - TODO(CONTACT_NUMBER_RULE_OWNER): unchanged.
  - TODO(STAGE3_DELETE_RESPONSE_SHAPE): unchanged.
  - TODO(STAGE3_BULK_OUT_OF_SCOPE): unchanged.
  - TODO(STAGE3_SOFT_DELETE_OUT_OF_SCOPE): unchanged.
  - TODO(STAGE3_GET_SINGLE_RESOURCE_AMENDMENT): the
    006-teachers-classes-mutations/spec.md FR-002 /
    FR-003 Edit pages currently use a server-side React
    Server Component + typeORM lookup pattern. The next
    /speckit-clarify pass on 006 will update FR-002 /
    FR-003 to call the new
    `GET /api/v1.0/teachers/[ulid]` /
    `GET /api/v1.0/classes/[ulid]` endpoints instead of
    the RSC pattern. The
    `TODO(SINGLE_RESOURCE_FETCH_OUT_OF_SCOPE)` marker
    in 006 Edge Cases is removed in that pass. The new
    GET endpoints are the only Stage 3 data source for
    the Edit pages; the RSC + typeORM fallback is
    superseded.

Sync Impact Report (prior v2.4.0 → v2.5.0 amendment)
=====================================================
Version change: 2.4.0 → 2.5.0  [MINOR: new Principle X (Domain
                                  Mutations & Referential Integrity)
                                  codifying DELETE / UPDATE rules on
                                  Teachers and Classes; Stage Scope
                                  extended with a Stage 3 section
                                  authorising UPDATE + DELETE on
                                  Teachers / Classes and the
                                  restoration of the Singapore-context
                                  `contactNumber` leading-digit rule;
                                  the Stage 1 Out-of-Scope entry
                                  "Update and Delete operations on
                                  Teachers / Classes" is REMOVED.]

Modified principles: none (Principles I–IX unchanged).

Modified sections (non-principle):
  Stage Scope
    - "Stage 1 — Explicitly Out of Scope" entry "Update and Delete
      operations on Teachers / Classes" is REMOVED (now Stage 3
      In Scope).
    - New "Stage 3 — In Scope" block added covering:
        • `PUT /api/v1.0/teachers/[ulid]` and `PUT /api/v1.0/classes/[ulid]`
        • `DELETE /api/v1.0/teachers/[ulid]` and `DELETE /api/v1.0/classes/[ulid]`
        • Restoration of the Singapore-context contact number rule
          on Teacher `contactNumber` (leading digit `8` or `9`,
          8 digits total — the rule relaxed in
          `001-teachers/spec.md` Clarifications Session 2026-06-21
          is re-tightened)
        • UI: per-row Edit + Delete actions on Teachers and Classes
          lists; pre-populated Edit forms; Delete confirmation modal
        • Idempotent DELETE semantics (404 on second DELETE)
    - New "Stage 3 — Explicitly Out of Scope" block added listing the
      mutations intentionally deferred (bulk DELETE/UPDATE, soft
      delete, archive, restore, PATCH, cascading delete, new
      entities, new auth controls, FK migration of `created_by` /
      `modified_by` to `users.id`).

Added principles:
  X. Domain Mutations & Referential Integrity (mandatory rules
     for UPDATE and DELETE on Teachers and Classes).
     New principle with the same MUST/SHOULD discipline as I–IX.
     Codifies three rules: (a) DELETE on a Teacher currently
     assigned as a form teacher MUST be rejected with 409 Conflict;
     (b) DELETE on a Class is unconstrained at the database layer
     but idempotent at the API layer; (c) UPDATE on either resource
     MUST re-run every invariant enforced by POST (subject active,
     email unique, form teacher uniqueness, level active). All
     DELETE/UPDATE routes inherit authentication (Principle IV),
     CSRF (Principle IX.3), and Joi validation (Principle VII)
     without exception.

Removed principles: none.
Removed sections: none.

Templates requiring updates:
  - .specify/templates/plan-template.md      ✅ no change (template is generic)
  - .specify/templates/spec-template.md       ✅ no change (template is generic)
  - .specify/templates/tasks-template.md      ✅ no change (template is generic)
  - .specify/templates/checklist-template.md ✅ no change (template is generic)
  - .specify/templates/commands/*.md          ✅ none present

Dependent artifacts flagged for manual follow-up (NOT amended by this
constitution update — they are downstream of the per-feature specs
and require their own PRs):
  - ⚠ specs/001-teachers/spec.md — Clarifications Session
    2026-06-21 (operational rules) relaxed the Teacher
    `contactNumber` rule from `^[89]\d{7}$` to `^\d{8}$`
    (no leading-digit restriction). Stage 3 v2.5.0 in-scope
    block RESTORES the original Singapore-context pattern.
    A new Clarifications session (Stage 3, ~2026-06-22) is
    required to update FR-004, the Joi schema regex
    (`^\\d{8}$` → `^[89]\\d{7}$`), and the corresponding
    unit tests. The contact number is owned by the
    `001-teachers` spec, not by this constitution; the
    constitution's job is to authorise the change in scope
    so the spec can amend itself.
  - ⚠ specs/002-classes/spec.md — Clarifications Session
    2026-06-18 Edge Cases bullet "What happens when a teacher
    is deleted (or otherwise no longer available) after a
    class was created with that teacher as the form teacher?
    — This scenario is out of scope for v1" is SUPERSEDED by
    Principle X.1. The 002-classes spec needs a Clarifications
    entry noting that DELETE-Teacher is now blocked at the
    API layer when the teacher is a current form teacher;
    the "out of scope for v1" wording becomes "blocked by
    referential integrity; admin reassigns the form teacher
    first" (Stage 3 amendment).
  - ⚠ specs/003-backend-api-db/spec.md — cross-cutting
    status-code table (FR-013) should gain explicit rows for
    `200 OK` (UPDATE success) and `404 Not Found` (DELETE on
    a missing `ulid`). Stage 2 already added `401`; Stage 3
    adds `200` and clarifies the `404` semantics. The
    `204 No Content` row is NOT added — Stage 3 returns
    `200` with the deleted row's `ulid` echo on successful
    DELETE for consistency with the existing JSON envelope
    contract.
  - ⚠ specs/001-teachers/contracts/teachers.yaml and
    specs/002-classes/contracts/classes.yaml — Stage 3 adds
    PUT and DELETE methods to each contract. The
    request/response schemas for `PUT` mirror the POST shape
    (full-resource replacement, not partial update). The
    `DELETE` response shape is `{ "ulid": "..." }` echoed
    back with HTTP `200` (Stage 3 decision — not 204, so the
    envelope is uniform with the rest of the API).
  - ⚠ README.md — "Stage 1 assumptions" currently lists
    "Update and delete operations on Teachers / Classes" as
    out of scope; that line should be removed and a Stage 3
    section added describing the new PUT / DELETE endpoints
    and the Singapore contact-number constraint.
  - ⚠ specs/001-teachers/plan.md and specs/002-classes/plan.md —
    the API tables list only POST + GET. Stage 3 adds two
    more rows (PUT, DELETE) to each table. No new endpoints
    are introduced; the existing Joi schemas gain PUT-side
    variants and DELETE Joi schemas (empty-body schemas that
    still run the validation step per Principle VII).

Follow-up TODOs (carry forward, plus the new ones):
  - TODO(ANTD_TAILWIND_VERSION): pin the `antd`, `tailwindcss`,
    `postcss`, and `autoprefixer` package versions in `package.json`
    at the first frontend plan so the constitution's version-pin
    requirement is reflected in the dependency tree. (Unchanged.)
  - TODO(JOI_ALIGNMENT): on the first PR that adds a typeORM entity,
    verify a matching Joi schema exists with identical field-level
    constraints (required-ness, length, regex, format). (Unchanged.)
  - TODO(FUNCTIONAL_REVIEW): on first PR, verify no class-based
    service / controller / domain-model code is introduced; the only
    allowed classes are framework-mandated (typeORM entities, Joi
    schema helpers where required, error subclasses where
    appropriate). (Unchanged.)
  - TODO(PROFILE_PAGE_OUT_OF_SCOPE): a "change password" or account
    profile page is NOT in Stage 2 scope. The login page is the only
    authentication-related UI in Stage 2. Adding a profile page is a
    future-stage amendment (Principle V — YAGNI).
  - TODO(RATE_LIMITING_OUT_OF_SCOPE): brute-force protection beyond
    Joi rate checks (e.g., per-IP login attempt limits,
    captcha-after-N-failures) is NOT in Stage 2 or Stage 3 scope.
    A future stage may add it under Principle V (YAGNI).
  - TODO(CRP_INTERPRETATION): the user's amendment request
    ("secure on CORS, XXS CSRF, CRP") was interpreted as
    **CORS + XSS + CSRF + CSP (Content Security Policy)**. "CRP" is
    treated as a typo for "CSP" (the standard web-security triad of
    CORS + CSP + CSRF; "CRP" does not correspond to a recognised
    web-security acronym in OWASP / MDN references). If the user
    meant **COOP** (Cross-Origin Opener Policy) or **CORP**
    (Cross-Origin Resource Policy) instead, Principle IX can be
    extended in a PATCH-level amendment without changing the
    version major.
  - TODO(LOCAL_DEV_HTTP_POSTURE): the `Secure` cookie attribute
    (per Principle IX + 004 spec FR-017) requires HTTPS in
    production. Local development runs over HTTP, so the
    application MUST relax the `Secure` attribute in dev mode via
    the runtime configuration. The exact mechanism is decided in
    the Stage 2 plan; the constitutional requirement is just that
    the relaxation is environment-driven, not hard-coded.
  - TODO(CONTACT_NUMBER_RULE_OWNER): the Singapore contact-number
    pattern (`^[89]\d{7}$`) is owned by `specs/001-teachers/spec.md`
    FR-004, NOT by this constitution. The constitution's job in
    v2.5.0 is to authorise the restoration in the Stage 3 In Scope
    block; the per-spec amendment (Clarifications session + Joi
    regex update + unit-test update) is the implementation step.
  - TODO(STAGE3_DELETE_RESPONSE_SHAPE): Stage 3 returns
    `{ "ulid": "..." }` with HTTP 200 on successful DELETE rather
    than HTTP 204 No Content, for envelope consistency with the
    rest of the API. If a future stage needs strict REST
    semantics (204 No Content, no body), that is a per-feature
    amendment, not a constitutional change.
  - TODO(STAGE3_BULK_OUT_OF_SCOPE): bulk DELETE / bulk UPDATE
    (e.g., `DELETE /api/v1.0/teachers?ids=...`) is explicitly out
    of Stage 3 scope per the Stage 3 Out-of-Scope block. Adding
    bulk operations requires a future-stage amendment to
    Principle X.
  - TODO(STAGE3_SOFT_DELETE_OUT_OF_SCOPE): soft delete / archive
    (`deleted_at`, `deleted_by` columns) is explicitly out of
    Stage 3 scope. Stage 3 DELETE is a hard delete. Soft delete
    is a future-stage amendment requiring schema additions and a
    rewrite of the Teacher / Class repositories.
-->

# pvt-edu-admin-project Constitution

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)

Every feature in this project MUST be produced through the Spec Kit workflow:
`/speckit-specify` → review → `/speckit-plan` → review → `/speckit-tasks` →
`/speckit-implement`. No source code, schema, migration, or contract is
written before its `spec.md`, `plan.md`, and `tasks.md` exist for the active
feature in `specs/[###-feature-name]/`. Reviewers MUST stop at each gate and
explicitly approve before the next step runs.

**Rationale:** The repository exists as interview-prep learning material
built around the SDD cycle. Skipping steps collapses the very practice the
project is meant to teach.

### II. TypeScript End-to-End

All source code — UI, API route handlers, scripts, type definitions,
tests, and infrastructure glue — MUST be written in **TypeScript** with
`strict: true`. JavaScript source files (`.js`, `.mjs`, `.cjs`) MUST NOT be
introduced except as auto-generated build output. A single `tsconfig` MUST
cover the whole application so that types cross the network boundary
between the React UI and the API routes without manual re-declaration.

**Rationale:** The requirement is "a single language across both frontend
and backend". Drift to JS fragments is the silent failure mode that erodes
that property.

### III. Unit Tests Required

Unit tests MUST exist for all domain logic — teacher/class CRUD invariants,
scheduling constraints, authentication flows, password hashing/verification,
session-store helpers, CSRF-token minting/validation, and any computation
specific to the active feature. Tests MUST be runnable without a network
call or a live MySQL / Redis connection (use the typeORM test fixtures /
in-memory patterns documented in `plan.md`). The order in which tests and
implementation are written is the contributor's choice; the requirement is
that every domain rule is covered by a passing unit test at the moment the
feature is marked done (see Development Workflow).

**Rationale:** Unit tests are an explicit project requirement. Dropping the
test-first ordering keeps the safety net without imposing a process the
project does not need.

### IV. Single Role: Authenticated Administrator

The application has exactly one user role: **Administrator**. Stage 2
introduces a **session-based authentication boundary** for that role; every
request to a protected resource is rejected with HTTP `401 Unauthorized`
when the caller does not present a valid session cookie. There is no
role switcher, no per-action authorization matrix, and no additional roles
(no Teacher role, no Student role, no Parent role). Introducing any
additional role is a constitutional amendment and MUST NOT be done in a
feature spec without first amending this principle.

The authentication boundary is owned by the auth middleware in
`lib/auth/`, applied to every `/api/*` endpoint except the explicit
exempt list (login, session-introspection). The session cookie carries
`HttpOnly`, `Secure` (HTTPS-only in production; the local-dev HTTP
posture is decided in `plan.md`), and `SameSite=Strict`; the cookie value
is opaque and is the lookup key for the server-side session record in
Redis. Per-action authorization (the visitor may perform action X) is
out of Stage 2 scope — every authenticated Administrator can perform
every action.

**Rationale:** The application is an internal admin tool. A multi-role
authorization framework is over-engineering for the stated scope and adds
attack surface without corresponding value; a session-based
authentication boundary, by contrast, is the standard minimum for any
web app that exposes data over the public internet.

### V. Simplicity (YAGNI)

Prefer the simplest design that satisfies the active spec. New abstractions,
dependencies, and services MUST be justified in `plan.md` under "Complexity
Tracking". Speculative features for future user stories MUST NOT be built.
A dependency added "because we might need it" is a violation, not a
forward-looking decision.

**Rationale:** Interview prep rewards clarity. A small, sharp implementation
demonstrates mastery better than a sprawling one.

### VI. Functional-First (Classes Only When Necessary)

Code MUST be written in a functional style by default: pure functions,
immutable data structures, and explicit composition over inheritance.
React code MUST use function components and hooks (no class components).
Server code MUST be organized as small modules of pure functions (no
class-based service layers, controllers, or repositories). Classes are
permitted only when a framework or library requires them — for example,
**typeORM entity classes** — or when no reasonable functional alternative
exists. Introducing a class for any other reason requires justification in
`plan.md` → Complexity Tracking.

**Rationale:** Functional code is easier to unit test (Principle III falls
out naturally), easier to reason about, and aligns with the interview-prep
goal of demonstrating clarity of intent.

### VII. Joi Schema Validation

**Joi MUST validate every payload that crosses a trust boundary** —
in particular, every Next.js Route Handler request body and every
query/path parameter consumed by an API, and the `POST /api/v1.0/login`
request body. Validation MUST run before any business logic, typeORM
call, persistence write, or authentication logic. Validation errors
MUST be returned to the client with HTTP `400 Bad Request` and a
structured `{ error, details }` payload; they MUST NOT leak
internal messages, stack traces, or database column names.

The Joi schema for an entity MUST mirror the typeORM entity columns
field-for-field: same required-ness, same length bounds, same string
format / regex, same numeric range. Where a constraint is awkward to
express in typeORM decorators (e.g. cross-field rules), the Joi
schema is the source of truth and the typeORM column is the relaxed
default — but the mismatch MUST be documented in `plan.md`.

Joi schemas live in plain `.ts` modules (functional: exported factory
functions or const schemas), not in classes. They are unit-tested
(Principle III): at least one test per schema covers the happy path
and one test per constraint covers the rejection path.

**Rationale:** Manual, ad-hoc validation drifts away from the
typeORM columns and silently lets malformed data into MySQL.
Joi-as-source-of-truth gives the app one declarative contract
that is easy to unit test, hard to bypass, and explicitly
defends the database boundary — which is the security property
the project asked for.

### VIII. UI Quality — Self-Explanatory, Reusable, Simple

Every UI component — page, section, form control, table, button — MUST
satisfy three properties:

1. **Self-explanatory.** Clear, domain-meaningful name; explicit, typed
   props with no hidden coupling to global state or ambient config;
   one obvious place to look for its behaviour. Props MUST be
   documented (TSDoc or equivalent) when their meaning is not obvious
   from the type alone.
2. **Reusable.** No feature-specific hard-coding (no `Teacher` field
   names baked into a "Form" component). Composed from generic
   **Ant Design** primitives and styled with **Tailwind CSS**
   utility classes (see Technical Stack Constraints) rather than
   re-implementing them per page.
3. **Simple.** No abstractions ahead of the current requirement
   (Principle V applies here too). If a component needs three layers
   of indirection to render one button, it is the wrong component.

UI work is reviewed against these three properties in addition to
the standard Spec-Driven gates.

**Rationale:** Self-explanatory + reusable + simple components are
the difference between an admin tool a single developer can read
end-to-end and one that requires tribal knowledge to extend. The
project's interview-prep goal is to demonstrate that clarity, not
to demonstrate framework acrobatics.

### IX. Security & Hardening (NON-NEGOTIABLE in Stage 2)

Stage 2 introduces four mandatory web-security controls. They are
mutually reinforcing — implementing CORS without CSP, or CSP without
CSRF protection, would leave the application vulnerable even though
the other control is in place. Each control is a hard requirement;
relaxing any of them requires a constitutional amendment.

1. **CORS (Cross-Origin Resource Sharing).** The API MUST enforce an
   explicit allow-list of trusted origins. Wildcard origins
   (`Access-Control-Allow-Origin: *`) MUST NOT be used in
   combination with credentialed requests; wildcard MAY be used for
   non-credentialed, fully-public endpoints, but no Stage 2 endpoint
   is fully public. The allow-list is configured via runtime
   configuration (not hard-coded) and the CORS middleware rejects
   any origin not on the list with HTTP `403 Forbidden`. The
   preflight `OPTIONS` response MUST echo the request's
   `Access-Control-Request-Method` and
   `Access-Control-Request-Headers` headers for the allowed origins.

2. **CSP (Content Security Policy).** Every response from the Next.js
   application MUST carry a `Content-Security-Policy` header. The
   Stage 2 policy is restrictive by default:
   - `default-src 'self'`
   - `script-src 'self'` — **no `'unsafe-inline'`** in production.
     Stage 2 ships no inline scripts; if a future feature needs one,
     it MUST use a per-request nonce.
   - `style-src 'self' 'unsafe-inline'` — Tailwind's JIT runtime and
     Ant Design's style injection are documented exceptions; the
     relaxation is acknowledged in the response header comment
     inside `next.config.mjs`.
   - `img-src 'self' data:` — covers Ant Design's data-URI icons
     and any user-uploaded avatars.
   - `object-src 'none'` — no `<object>`, `<embed>`, or `<applet>`.
   - `frame-ancestors 'none'` — the application cannot be framed;
     this is the modern equivalent of `X-Frame-Options: DENY`.
   - `base-uri 'self'` — `<base>` cannot be hijacked.
   - `form-action 'self'` — `<form action>` cannot target an
     external origin.
   In addition to CSP, every response MUST carry
   `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`, and (in
   production) `Strict-Transport-Security: max-age=63072000;
   includeSubDomains`.

3. **CSRF (Cross-Site Request Forgery).** Every state-changing API
   request (`POST`, `PUT`, `PATCH`, `DELETE` under`/api/v1.0/*`)
    MUST be protected against CSRF. The chosen
   mechanism is the **double-submit cookie pattern**: a CSRF token
   is generated server-side when the session is created, set as a
   non-`HttpOnly` cookie named (e.g.) `csrfToken`, and the
   browser-side React code MUST echo the same value in an
   `X-CSRF-Token` request header on every state-changing request.
   The API middleware compares the two values (constant-time
   comparison) and rejects any state-changing request whose
   cookie / header pair does not match with HTTP `403 Forbidden`.
   The session cookie's `SameSite=Strict` attribute (per Principle
   IV) is the first line of defence; the double-submit token is the
   defense-in-depth backstop. `GET` requests are exempt from the
   CSRF check (they MUST be safe and idempotent).

4. **XSS (Cross-Site Scripting).** XSS prevention is layered:
   - **Input validation** at the trust boundary (Principle VII —
     Joi) rejects malformed input before it reaches persistence.
   - **Output encoding** is the default behaviour of React and of
     the JSON-stringify path in the API; the application MUST NOT
     use `dangerouslySetInnerHTML`, `eval`, `Function(...)`, or any
     other string-to-code sink.
   - **CSP** (control 2 above) is the last line of defence — even
     if a stored XSS slips through, the CSP `script-src 'self'`
     rule blocks the inline `<script>` that the attacker would need.
   The dependency on a sanitization library (e.g., `DOMPurify`) is
   NOT in Stage 2 scope; the existing input-validation +
   output-encoding + CSP triple is sufficient for the Stage 2
   surface (no rich-text fields, no user-generated HTML).

**Rationale:** A web application that exposes data over the public
internet without these four controls is one incident away from a
full compromise. They are the OWASP-recommended baseline; each one
closes a specific class of attack, and the four together close the
classes most likely to hit a small internal admin tool.

### X. Domain Mutations & Referential Integrity (NON-NEGOTIABLE in Stage 3)

Stage 3 introduces the `UPDATE` and `DELETE` mutations on Teachers
and Classes. Every mutation MUST preserve the invariants that the
`POST` flow established. Three rules:

1. **DELETE on a Teacher MUST be rejected when the teacher is
   currently assigned as the form teacher of any class.** The
   referential-integrity check runs before the delete; the route
   returns HTTP `409 Conflict` with the standard
   `{ "error": "Teacher is assigned as form teacher of <n> class(es)" }`
   envelope. The administrator MUST first reassign (via
   `PUT /api/v1.0/classes/[ulid]` updating the affected class's
   `formTeacher.ulid`) or delete the affected class(es) before
   retrying the teacher delete. This is the canonical example of a
   domain constraint that the `POST` path did not need to enforce
   (because the `POST` is a fresh row) but the `DELETE` path MUST
   enforce (because it would otherwise leave a class with a
   dangling `form_teacher_id` — the `UNIQUE` constraint on
   `classes.form_teacher_id` does not protect a class whose
   referenced teacher has been removed).

2. **DELETE on a Class is unconstrained at the database layer
   (no other table references `classes.id` outside the audit
   columns — there is no `class_id` FK on `teachers`,
   `subjects`, or `levels`).** It MUST still be authenticated
   (Principle IV), CSRF-protected (Principle IX.3), Joi-validated
   (Principle VII — the request body is empty but the route
   handler still runs the validation step), and idempotent:
   a second `DELETE` on the same `ulid` returns
   `404 Not Found` with the standard
   `{ "error": "Class not found" }` envelope, NOT a `5xx`. The
   first successful `DELETE` returns `200 OK` with
   `{ "ulid": "<deleted-class-ulid>" }` so the client can confirm
   which row was removed (the envelope is uniform with the rest
   of the API; `204 No Content` is NOT used — see
   TODO(STAGE3_DELETE_RESPONSE_SHAPE) in the Sync Impact Report).

3. **UPDATE on a Teacher or Class MUST re-run every invariant
   that the `POST` flow enforces**, with the field-level
   constraints re-checked. `PUT` is a full-resource replacement
   (Stage 3 ships full-resource `PUT` only — no `PATCH`; see
   Stage 3 Out of Scope):
   - The teacher's new `subject.ulid`, if supplied, MUST
     reference an **active** `subjects` row
     (per `001-teachers/spec.md` FR-005a).
   - The teacher's new `email`, if supplied, MUST NOT collide
     with another teacher's email (per FR-005, 001-teachers);
     the `UNIQUE` constraint on `teachers.email` enforces it
     race-safely and the route translates the violation into
     `409 Conflict` with `{ "error": "Email already in use" }`.
   - The teacher's new `contactNumber`, if supplied, MUST match
     the Singapore-context pattern `^[89]\d{7}$` — exactly
     8 digits, must start with `8` or `9` (the constraint
     restored in the Stage 3 In Scope block; the relaxed
     `^\d{8}$` pattern from `001-teachers/spec.md`
     Clarifications Session 2026-06-21 is superseded).
   - The class's new `level.ulid`, if supplied, MUST reference
     an **active** `levels` row (per FR-005a, 002-classes).
   - The class's new `formTeacher.ulid`, if supplied, MUST
     reference a registered teacher (per FR-004, 002-classes)
     AND that teacher MUST NOT already be the form teacher of a
     **different** class (per FR-005, 002-classes — uniqueness
     is by `classes.form_teacher_id`, so the class updating to
     the same form teacher it already has is permitted; only a
     collision with a *different* class is rejected).
   - Email, `subject`, `level`, and `formTeacher` are looked up
     by `ulid` (the nested `{ ulid, name }` shape — per
     `003-backend-api-db` Clarifications Session 2026-06-20).
   - On success, UPDATE returns the updated row in the same
     shape as the corresponding GET entry, with HTTP `200 OK`.
   - On failure, UPDATE returns the same JSON error envelope
     (`{ "error": "..." }`) and HTTP status code as the
     equivalent POST failure (`400` / `404` / `409`).

   UPDATE MUST NOT bypass CSRF (Principle IX.3), authentication
   (Principle IV), or Joi validation (Principle VII). Every
   `PUT` request carries a `Content-Type: application/json`
   body, an `X-CSRF-Token` header matching the `csrfToken`
   cookie, and a valid session cookie; the same `415` rule
   that guards POST also guards PUT.

   Unit tests (Principle III) MUST cover the three negative
   paths for each resource: (a) DELETE-Teacher blocked when the
   teacher is a current form teacher, (b) DELETE idempotency
   (second DELETE returns 404), (c) UPDATE re-running every
   POST-side invariant.

**Rationale:** `POST` enforces invariants at row-creation time;
without a corresponding DELETE / UPDATE constraint the database
silently drifts into invalid states (orphaned `form_teacher_id`,
duplicate form teachers, references to deactivated subjects or
levels, contact numbers that no longer match the
Singapore-mobile assumption). The principle exists to make those
constraints explicit, testable, and reviewable; it is the
natural counterpart to Principle VII (Joi) for the mutation
path and is what prevents the "v1 worked, but a year of
production data is corrupt" failure mode.

## Stage Scope

This section pins what the current constitution actually authorises.
A feature spec that exceeds this scope MUST first amend this section
(or amend Principle IV, Principle V, etc., as relevant).

**Stage 1 — In Scope (UNCHANGED):**

- **Teachers UI**: Create and Read operations only.
- **Classes UI**: Create and Read operations only.
- **Backend APIs**: the corresponding `POST` and `GET` endpoints for
  Teachers and Classes, exposed as Next.js Route Handlers under
  `app/api/v1.0/`, validated by Joi (Principle VII) and persisted via
  typeORM (Technical Stack Constraints).
- **Data model**: the MySQL tables backing Teachers and Classes, as
  defined in `specs/003-backend-api-db/spec.md` and locked into
  typeORM entities with matching Joi schemas.

**Stage 1 — Explicitly Out of Scope** (requires a constitutional
amendment to enter scope; the "Authentication, authorization,
sessions, or any non-administrator role" entry was REMOVED by the
v2.4.0 amendment and is now Stage 2 In Scope; the "Update and
Delete operations on Teachers / Classes" entry was REMOVED by
the v2.5.0 amendment and is now Stage 3 In Scope):

- New entities beyond Teachers and Classes.
- Production deployment, observability, or non-MySQL storage.

**Stage 2 — In Scope (NEW, authorised by v2.4.0):**

- **Authentication feature** (`specs/004-user-auth/spec.md`):
  - The single login page at `/login` with username, password, and
    "Log in" button only.
  - The three authentication endpoints: `POST /api/v1.0/login`,
    `POST /api/v1.0/logout`, `GET /api/v1.0/me`
  - The auth middleware protecting every `/api/*` endpoint except
    the explicit exempt list (`POST /api/v1.0/login`, `GET /api/v1.0/me`).
  - The server-side session store in Redis with a hard 30-minute
    TTL.
  - The session cookie with `HttpOnly`, `Secure`,
    `SameSite=Strict`.
  - The React route guard component protecting every private page
    (calls `GET /api/v1.0/me` on mount; redirects to `/login` on `401`).
  - The `users` table (user-prepared MySQL, FR-016 pattern) with
    the standard audit + ULID columns (FR-018, FR-021).
- **CORS hardening**: explicit allow-list of trusted origins,
  no wildcard with credentials, runtime-configured allow-list.
- **CSP hardening**: the restrictive CSP policy in Principle IX
  (control 2) is the default for every response; nonce-based
  inline-script relaxation is supported but not used in Stage 2.
- **CSRF protection**: the double-submit-cookie CSRF token on every
  state-changing API request; `GET` requests are exempt.
- **XSS prevention**: layered — Joi input validation, React's
  default output encoding, and CSP as defense-in-depth.

**Stage 2 — Explicitly Out of Scope** (requires a constitutional
amendment to enter scope):

- Multi-factor authentication (MFA / 2FA).
- OAuth2 / OpenID Connect / SSO integration (Google, Microsoft,
  Apple, etc.).
- Password reset, forgot-password, or account-recovery flows.
- Self-registration / sign-up endpoints.
- Admin authoring of `users` rows (the SQL-seeded initial
  administrator(s) are the only user-creation path in Stage 2).
- Account lockout, brute-force throttling, or captcha-after-N-failures.
- Rate limiting beyond what Joi's input validation provides.
- Audit logging beyond the existing `created_by` / `modified_by`
  / `created_at` / `modified_at` columns (no separate
  `auth_events` table, no per-request log of authentication
  outcomes beyond what's needed for the session store).
- Migration of the `created_by` / `modified_by` audit columns on
  `teachers`, `classes`, `subjects`, and `levels` to FKs against
  `users.id`.
- HTTPS termination / TLS configuration (the application runs
  behind a reverse proxy in production; the proxy is responsible
  for TLS, the `Strict-Transport-Security` header, etc.).
- COOP (Cross-Origin Opener Policy), CORP (Cross-Origin Resource
  Policy), COEP (Cross-Origin Embedder Policy) — Stage 2 ships
  CSP, CORS, CSRF, XSS. The remaining COOP / CORP / COEP triad
  is a documented future-stage amendment (see
  TODO(CRP_INTERPRETATION) in the Sync Impact Report).

**Stage 3 — In Scope (authorised by v2.5.0; expanded by v2.6.0):**

- **`GET /api/v1.0/teachers/[ulid]`** (NEW, authorised by v2.6.0)
  — single-resource fetch on a Teacher. Returns the teacher
  record in the same shape as a single entry in
  `GET /api/v1.0/teachers` (per
  `001-teachers/spec.md` FR-007 — `ulid`, `name`, `subject` as
  nested `{ ulid, name }`, `email`, `contactNumber`) with HTTP
  `200 OK` on success, or `404 Not Found` with
  `{ "error": "Teacher not found" }` on an unknown `ulid`. The
  endpoint is authenticated (Principle IV — returns `401`
  without a valid session cookie, inherited from
  `003-backend-api-db/spec.md` FR-013) and CSRF-exempt (GET
  is exempt per Principle IX.3). The endpoint is the data
  source for the Stage 3 Edit Teacher page
  (`/teachers/[ulid]/edit`, owned by
  `specs/006-teachers-classes-mutations/spec.md` FR-002);
  the previous RSC + typeORM fallback in 006 is superseded
  by this endpoint.
- **`GET /api/v1.0/classes/[ulid]`** (NEW, authorised by v2.6.0)
  — single-resource fetch on a Class. Returns the class
  record in the same shape as a single entry in
  `GET /api/v1.0/classes` (per `002-classes/spec.md` FR-007
  — `ulid`, `name`, `level` as nested `{ ulid, name }`,
  `formTeacher` as nested `{ ulid, name }`) with HTTP
  `200 OK` on success, or `404 Not Found` with
  `{ "error": "Class not found" }` on an unknown `ulid`. The
  endpoint is authenticated (Principle IV) and CSRF-exempt
  (GET is exempt per Principle IX.3). The endpoint is the
  data source for the Stage 3 Edit Class page
  (`/classes/[ulid]/edit`, owned by
  `specs/006-teachers-classes-mutations/spec.md` FR-003);
  the previous RSC + typeORM fallback in 006 is superseded
  by this endpoint.
- **`PUT /api/v1.0/teachers/[ulid]`** — full-resource update on a
  Teacher. All four mutable fields are submitted together
  (`name`, `subject`, `email`, `contactNumber`); `ulid` is
  immutable and is taken from the path parameter, not the body.
  See Principle X.3 for the invariant rules.
- **`PUT /api/v1.0/classes/[ulid]`** — full-resource update on a
  Class. All three mutable fields are submitted together
  (`name`, `level`, `formTeacher`); `ulid` is taken from the path.
- **`DELETE /api/v1.0/teachers/[ulid]`** — hard delete on a
  Teacher; blocked with `409 Conflict` if the teacher is
  currently assigned as form teacher of any class
  (Principle X.1).
- **`DELETE /api/v1.0/classes/[ulid]`** — hard delete on a
  Class; always permitted at the database layer; idempotent at
  the API layer (Principle X.2).
- **Singapore-context `contactNumber` rule restoration** on the
  Teacher field: exactly 8 digits, must start with `8` or `9`
  (pattern `^[89]\d{7}$`). This re-tightens the constraint that
  `specs/001-teachers/spec.md` Clarifications Session 2026-06-21
  relaxed to `^\d{8}$` (no leading-digit restriction). The rule
  is owned by the `001-teachers` spec (FR-004) and is enforced by
  Joi; no typeORM schema change is needed because the column
  already stores `VARCHAR(15)` (well above the 8-digit
  requirement). The corresponding unit tests are updated to
  cover the leading-digit rejection path.
- **UI**:
  - Teachers list rows and Classes list rows gain per-row
    **Edit** and **Delete** actions (composed from `antd`
    `Button` primitives, styled with Tailwind utility classes
    per Principle VIII). The Edit action navigates to a
    pre-populated form (the existing Add Teacher / Add Class
    forms gain an "edit mode" gated by the presence of a path
    parameter, reusing the same Joi-validated body shape as
    POST).
  - Delete opens an `antd` `Modal.confirm` with the row's name
    embedded in the confirmation copy ("Delete teacher
    John Doe? This action cannot be undone.") and a destructive
    `Delete` button (red, per the existing Tailwind token
    palette).
  - After successful Edit or Delete, the list refreshes (no
    full-page reload — the existing client-side fetch pattern
    is reused).
  - The Edit form's CSRF token is fetched via the existing
    `lib/security/csrf-client.ts → getCsrfToken()` helper
    (introduced by `005-security-hardening`); both `PUT` and
    `DELETE` send the `X-CSRF-Token` header.
- **Domain-constraint unit tests** (Principle III) covering:
  - DELETE-Teacher rejected when the teacher is a current
    form teacher (with the exact `409` envelope).
  - DELETE-Class idempotency (second DELETE returns 404).
  - UPDATE-Teacher re-running subject-active and email-unique
    invariants.
  - UPDATE-Class re-running level-active and form-teacher-
    uniqueness invariants.
  - Singapore contact-number regex rejects values that don't
    start with `8` or `9` (negative test for the restored
    constraint).

**Stage 3 — Explicitly Out of Scope** (requires a constitutional
amendment to enter scope):

- Bulk DELETE / bulk UPDATE (no batch endpoints — every
  mutation operates on a single `ulid`).
- Soft delete, archive, or restore-on-delete (no `deleted_at` /
  `deleted_by` columns are introduced; the audit columns
  `modified_at` / `modified_by` continue to record the last
  `PUT` write — but a `DELETE` does not write them; it
  simply removes the row). Restoring a deleted row requires a
  future-stage amendment that adds the audit columns and the
  soft-delete repository pattern.
- Undo / confirmation-window delete (no toast-based undo
  beyond the immediate `Modal.confirm`; once the DELETE call
  returns `200`, the row is gone).
- Partial-update (`PATCH`) endpoints (Stage 3 ships
  full-resource `PUT` only — every updatable field is
  required on every `PUT` call).
- Cascading delete (deleting a teacher MUST NOT cascade to
  classes — the `409` path forces explicit reassignment; this
  matches the Stage 1+ invariant that form-teacher uniqueness
  is enforced by the application layer, not the database).
- New entities beyond Teachers and Classes (the `subjects`,
  `levels`, and `users` reference tables are still
  read-only in Stage 3; admin authoring of those tables is a
  future-stage amendment).
- New endpoints beyond the six listed above (no
  `POST /api/v1.0/teachers/bulk-delete`, no bulk
  endpoints — every mutation operates on a single
  `ulid`; the two new single-resource GET endpoints are
  in Stage 3 In Scope and supersede the previously-deferred
  single-resource fetch).
- New authentication controls, new security hardening controls
  (Stage 3 inherits Principles IV and IX unchanged — the
  existing auth + CSRF + CORS + CSP + XSS posture is
  sufficient for the new mutations).
- Foreign-key migration of `created_by` / `modified_by` on
  `teachers` / `classes` / `subjects` / `levels` to
  `users.id` (still deferred per Principle V — YAGNI;
  cumulative Stage 2 + Stage 3 deferral list).

## Technical Stack Constraints

- **Language**: TypeScript with `strict: true`. No `.js` source files.
- **Runtime**: Node.js LTS, via a single **Next.js** application. The
  application is one process; the UI lives under `app/` (or `src/app/`)
  and the API lives under `app/api/` as **Next.js Route Handlers**. There
  is no separate Node.js HTTP service, Express/Fastify/NestJS app, or
  microservice in scope.
- **Database**: **MySQL** (RDBMS), running in a **Docker container**.
  All persistence MUST go through **typeORM** entities, repositories,
  and migrations. Raw SQL is permitted only inside typeORM migrations
  or query builders, not in business code.
- **Session store**: **Redis**, running in a **Docker container**
  (either as a `docker-compose` service or as a user-managed
  container — the choice is decided in `plan.md`). All session
  records are opaque `sessionId → userId` mappings with a hard
  30-minute TTL (per Principle IV). The application MUST NOT
  introduce an alternative session store (in-memory, file-based,
  database-backed) — Redis is the single source of truth for
  session state.
- **Frontend**: **Next.js** with the **App Router**, using **client
  components** (client-side rendering is the default for this project).
- **UI components**: **Ant Design (`antd`)** is the required component
  library for the active feature. Every interactive control (button,
  input, select, table, modal, form, etc.) MUST be composed from `antd`
  primitives — third-party UI deps in addition to `antd` require
  justification in `plan.md` and a Complexity Tracking entry. The
  exact `antd` package version is pinned in `package.json` at the
  first frontend task — see TODO(ANTD_TAILWIND_VERSION) in the Sync
  Impact Report.
- **Styling**: **Tailwind CSS** is the required styling solution for
  the active feature. All visual presentation — layout, spacing,
  colour, typography, responsive behaviour — MUST be expressed via
  Tailwind utility classes (in JSX `className`, or template strings
  consumed by Tailwind's content scanner) rather than hand-written
  CSS files, inline `style` objects, or per-component CSS modules,
  except where Ant Design's documented escape hatches (e.g. `ConfigProvider`
  token overrides) require it. The Tailwind config
  (`tailwind.config.*`) is the single place where project tokens
  (colour palette, font stack, breakpoints, spacing scale) are
  defined; component code MUST reference those tokens via utility
  classes, not raw hex values or one-off class names. The exact
  `tailwindcss`, `postcss`, and `autoprefixer` package versions
  are pinned in `package.json` at the first frontend task.
- **Validation**: **Joi** schemas (Principle VII), aligned field-for-field
  with the typeORM entity columns.
- **Security headers**: every response MUST carry the headers listed
  in Principle IX (control 2 — CSP + `X-Content-Type-Options` +
  `Referrer-Policy` + `Strict-Transport-Security` in production).
  The configuration lives in `next.config.mjs` (the single place
  where the security posture is centralised).
- **Delivery**: the application MUST run in a **Docker** container,
  and the MySQL database MUST also run in a Docker container. The
  Redis container layout (managed by `docker-compose` or
  user-managed) is decided per feature in `plan.md`.
- **Configuration**: runtime application configuration (database URL,
  Redis URL, server port, feature flags, CORS allow-list, the
  environment-driven `Secure` cookie flag, etc.) is provided via
  the `.env` file loaded by Next.js / the Node.js runtime, in
  standard dotenv format.
- **Testing**: unit tests are mandatory (per Principle III). The runner
  (Vitest, Jest, or equivalent) is decided per feature in `plan.md`.
- **Secrets**: passwords, API keys, session secrets, and other
  values that MUST NOT be committed live in `.env.local` (gitignored)
  or are passed at container run time. The repo-level `.env` that
  the coding-agent harness reads as JSON and that holds model
  configuration only — see `CLAUDE.md` → Environment — is a
  separate concern and MUST NOT be used as the source of
  application runtime configuration.

## Development Workflow

- Each feature lives in its own `specs/[###-feature-name]/` directory and
  goes through the SDD cycle in order. Gates are enforced by the Spec Kit
  skills under `.claude/skills/speckit-*`.
- A feature is "done" only when all of the following hold: (a) every
  `tasks.md` item is checked, (b) the `quickstart.md` validation steps
  pass, (c) `/speckit-analyze` reports no cross-artifact inconsistencies,
  (d) `README.md` reflects any new run / deploy / assumption, and (e)
  for security-sensitive features (anything that touches Principle IV
  or Principle IX), a manual review of the security-control coverage
  is recorded in `plan.md` → Constitution Check.
- `README.md` at the repository root is a **contract** for every release.
  It MUST contain: clear instructions to run a working local instance of
  the web app and API server; documented assumptions; links to the hosted
  web app and API when applicable; and (optionally) notes or suggestions
  on the API design. A PR that changes behavior without updating the
  README is incomplete.
- Pull requests for code MUST link the active spec, plan, and tasks.
  Reviewers MUST reject PRs whose artifacts were not produced through the
  SDD skills, and PRs that violate Principle II–X.
- When in doubt, prefer amending this constitution over maintaining
  out-of-band conventions.

## Governance

- This constitution supersedes all other written or unwritten development
  practices in this repository.
- Amendments require a written rationale, a Sync Impact Report at the top
  of this file, and a version bump per the rules below.
- **Versioning policy** follows semantic versioning:
  - **MAJOR** — principle removal or incompatible redefinition.
  - **MINOR** — new principle or section added, or material guidance
    expanded.
  - **PATCH** — clarifications, wording fixes, non-semantic refinements.
- Compliance review: every `/speckit-implement` run MUST include a
  Constitution Check section in `plan.md`; deviations from Principles
  II–X require an entry in `plan.md` → Complexity Tracking with the
  simpler alternative that was rejected and why. The Constitution Check
  MUST, for security-sensitive features (any feature that touches
  Principle IV or Principle IX), explicitly verify the four hardening
  controls (CORS allow-list, CSP header, CSRF token middleware, XSS
  posture) are present and configured per Principle IX.
  The Constitution Check MUST, for any feature that introduces a
  mutation covered by Principle X (UPDATE / DELETE on Teachers or
  Classes), explicitly verify the three Principle X rules
  (form-teacher referential integrity on DELETE-Teacher,
  idempotent DELETE on Classes, full re-run of POST invariants on
  UPDATE) are unit-tested and reflected in the Joi schemas.
- The authoritative runtime guidance for coding agents is `CLAUDE.md`;
  the authoritative process guidance is the Spec Kit skill documentation
  under `.claude/skills/speckit-*`.

**Version**: 2.6.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-22 (MINOR: Stage 3 In Scope expanded with two new single-resource GET endpoints — `GET /api/v1.0/teachers/[ulid]` and `GET /api/v1.0/classes/[ulid]`; the Stage 3 Out of Scope entry "single-resource fetch is a future-stage amendment that requires a per-spec clarification" is REMOVED; the data source for the 006 Edit Teacher / Edit Class pages is now the new single-resource GET endpoints, superseding the RSC + typeORM fallback; 001-teachers / 002-classes / 003-backend-api-db specs gain per-spec Clarifications sessions adding the new endpoints to the per-feature FR inventories and the cross-cutting versioned-prefix inventory — per-spec amendments, not constitutional changes)