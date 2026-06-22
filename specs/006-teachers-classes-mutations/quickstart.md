# Quickstart: Teachers & Classes — UPDATE / DELETE Mutations (006)

**Date**: 2026-06-22
**Spec**: [./spec.md](./spec.md)
**Plan**: [./plan.md](./plan.md)
**Research**: [./research.md](./research.md)
**Data model**: [./data-model.md](./data-model.md)
**Contracts**: [./contracts/teachers.yaml](./contracts/teachers.yaml), [./contracts/classes.yaml](./contracts/classes.yaml)

This is a runnable validation guide. It walks through the
end-to-end happy paths of the Stage 3 mutation surface (Edit
Teacher, Edit Class, Delete Teacher, Delete Class), then the
error paths that pin down the contract: the form-teacher
referential integrity guard on DELETE-Teacher, the
form-teacher-collision guard on UPDATE-Class, the
concurrent-edit toast on UPDATE-Teacher, the restored
Singapore `^[89]\d{7}$` contact-number rule on UPDATE-Teacher,
and the auth + CSRF coverage on every state-changing call.
Every step is a real command and a real check. The guide
inherits the test setup (Vitest, three tiers) from
[001-teachers/quickstart.md](../001-teachers/quickstart.md)
and the auth setup from
[004-user-auth/quickstart.md](../004-user-auth/quickstart.md).

---

## Prerequisites

- Docker Desktop (Docker Engine 24+ and Compose v2).
- Node.js LTS (≥ 20) and npm for local unit / contract /
  integration test runs.
- A free port `3000` (Next.js dev server), `3306` (MySQL), and
  `6379` (Redis).
- The Stages 1 + 2 features are deployed: the
  `001-teachers` POST + GET endpoints, the `002-classes` POST
  + GET endpoints, the `004-user-auth` login flow (with a
  pre-seeded Administrator in the `users` table), and the
  `005-security-hardening` middleware chain (CORS + CSP +
  CSRF + XSS). The Stage 3 mutations layer on top of all
  four without modification.
- The MySQL schema includes the five tables (`subjects`,
  `teachers`, `levels`, `classes`, `users`) prepared by the
  user against the user-prepared MySQL container (per FR-016
  cross-cutting rule + the constitution Stage Scope → Stage 1
  / Stage 2 Out of Scope migration section). The `subjects`
  and `levels` reference tables are populated. The
  application is read/write at runtime only — there is no
  typeORM migration on boot.
- At least one row exists in `subjects` (e.g.,
  `01H000000000000000000000A1` = "Mathematics") and at least
  one row exists in `levels` (e.g.,
  `01H000000000000000000000B1` = "Primary 1") so the Edit
  forms can resolve their dropdowns.

---

## Setup

```bash
# 1. Clone the repo and enter it
git clone <repo-url> pvt-edu-admin-project
cd pvt-edu-admin-project

# 2. Install dependencies (uses package.json with caret
#    ranges, locked via package-lock.json)
npm install

# 3. Bring up MySQL + Redis + the app (Stages 1 + 2 + 3 share
#    the same docker-compose stack — no new services added by
#    006)
docker compose -f docker/docker-compose.yml up -d --build
docker compose -f docker/docker-compose.yml logs -f app
#   Look for: "Listening on http://localhost:3000"
#   (no migration log lines — the app does not run migrations
#    on boot per FR-016)

# 4. Log in as the pre-seeded Administrator
#    (cookie file saved to /tmp/admin-cookies.txt)
curl -i -c /tmp/admin-cookies.txt -X POST \
  http://localhost:3000/api/v1.0/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<the-seeded-password>"}'
# Expect: HTTP/1.1 200 OK
# Body:   {"ulid":"01H...","username":"admin","createdAt":"..."}
# Cookies: Set-Cookie: session=<opaque>; HttpOnly; Secure;
#          SameSite=Strict
#          Set-Cookie: csrfToken=<token>; (NOT HttpOnly; for
#          the double-submit pattern)

# 5. Capture the CSRF token from the cookie jar
CSRF_TOKEN=$(awk '/csrfToken/ {print $7}' /tmp/admin-cookies.txt)
echo "CSRF token: $CSRF_TOKEN"
```

After step 5, the app is on `http://localhost:3000`, the
session cookie is in `/tmp/admin-cookies.txt`, and the CSRF
token is in `$CSRF_TOKEN`. All subsequent `curl` commands
include both cookies (via `-b /tmp/admin-cookies.txt`) and
the `X-CSRF-Token: $CSRF_TOKEN` header.

---

## Scenario 1 — Edit a teacher (UI happy path)

**Goal**: verify `FR-001`, `FR-002`, `FR-006`, `FR-007`,
`FR-016`, and `SC-001`. Per Clarifications Session 2026-06-22
(contact-number rule restoration), the Singapore `^[89]\d{7}$`
regex applies on both POST and PUT.

1. Open `http://localhost:3000/teachers` in a browser.
2. The Teachers list is rendered. A new rightmost **Actions**
   column shows a per-row `...` button for every row (per
   006 spec FR-001). The button has
   `aria-label="Row actions"`.
3. Click the `...` button on the Alice Tan row. A small
   dropdown menu appears with **Edit** and **Delete** items
   (composed from the `antd` `Dropdown` primitive, styled
   with Tailwind utility classes).
4. Click **Edit**. The browser navigates to
   `/teachers/[ulid]/edit` (a React Server Component). The
   `page.tsx` calls
   `GET /api/v1.0/teachers/[ulid]` with the `ulid` path
   parameter (per 006 spec FR-002 + the constitution v2.6.0
   amendment) and passes the resolved record to the existing
   Add Teacher form component in "edit mode" (gated by the
   presence of the path parameter).
5. The Edit Teacher form is rendered **pre-populated** with
   Alice Tan's current `name`, `subject` (resolved from
   `subject.ulid` via `uq_subjects_ulid`), `email`, and
   `contactNumber`. No client-side blank / loading state is
   shown during the data population step (the RSC shell
   waits for the GET before rendering).
6. Change `contactNumber` from `91234567` to `98765432`. Click
   **Save**.
7. The page submits `PUT /api/v1.0/teachers/[ulid]` with the
   form body (full-resource replacement: every mutable
   field is submitted). The route handler re-runs every
   POST-side invariant: subject-active (the new `subject.ulid`
   is still active), email-unique (the new `email` is the
   same as the old `email` — the row-exclusion self-match
   rule allows the no-op), contact-number regex (`98765432`
   matches `^[89]\d{7}$` — accepted).
8. The route returns `200 OK` with the updated row plus the
   `previousModifiedAt` sibling field. The
   `use-edit-submit` hook compares the form-load `modifiedAt`
   (captured from the GET response) to the
   `previousModifiedAt` value (returned by the PUT 200
   response). If they are equal (this is the only writer),
   the concurrent-edit toast does **not** fire. The hook
   navigates the browser to `/teachers` and the list
   refreshes client-side (no full-page reload).
9. The Teachers list now shows Alice Tan with
   `contactNumber = 98765432`. The whole flow finishes in
   well under 30 s (`SC-001`).

**Acceptance check**:
- The per-row `...` menu appears on every Teachers-list row
  (per FR-001).
- The Edit Teacher form is pre-populated on first paint (no
  client-side blank / loading state).
- The Singapore `^[89]\d{7}$` regex is enforced on PUT (per
  FR-013).
- The PUT 200 response includes the `previousModifiedAt`
  sibling field (per FR-007).
- The list refreshes client-side after the successful save
  (per FR-006).

---

## Scenario 2 — Edit a teacher (API happy path)

**Goal**: verify `FR-007` and the `200` / `400` / `401` /
`403` / `404` / `409` status codes. The CSRF token is sent
via the `X-CSRF-Token` header (per Principle IX.3, owned by
`005-security-hardening`).

```bash
# 2.1. Fetch the teacher record (the GET-by-ulid endpoint is
#      CSRF-exempt; no X-CSRF-Token header is required)
curl -i -b /tmp/admin-cookies.txt \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T
# Expect: HTTP/1.1 200 OK
# Body:   {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7T","name":"Alice Tan",
#          "subject":{"ulid":"01H000000000000000000000A1","name":"Mathematics"},
#          "email":"alice@example.com","contactNumber":"91234567"}

# 2.2. Update the teacher (PUT is CSRF-protected)
curl -i -b /tmp/admin-cookies.txt -X PUT \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "name": "Alice Tan",
    "subject": {
      "ulid": "01H000000000000000000000A1",
      "name": "Mathematics"
    },
    "email": "alice@example.com",
    "contactNumber": "98765432"
  }'
# Expect: HTTP/1.1 200 OK
# Body:   {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7T","name":"Alice Tan",
#          "subject":{"ulid":"01H000000000000000000000A1","name":"Mathematics"},
#          "email":"alice@example.com","contactNumber":"98765432",
#          "previousModifiedAt":"2026-06-22T10:15:30.000Z"}

# 2.3. Verify the row was updated
curl -i -b /tmp/admin-cookies.txt \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T
# Expect: HTTP/1.1 200 OK
# Body:   contactNumber is "98765432"
```

**Acceptance check**: 200 on PUT, the response body includes
the `previousModifiedAt` field, the `contactNumber` regex
`^[89]\d{7}$` is enforced (a value starting with `0`–`7` or
`10`–`99` would be rejected with `400`), and the
`content-type` is enforced (`415` on non-JSON).

---

## Scenario 3 — Singapore contact-number rule on PUT (negative test)

**Goal**: verify `FR-013`, `SC-005`. The Singapore
`^[89]\d{7}$` regex is restored on `Teacher.contactNumber`
for both POST and PUT (per Clarifications Session 2026-06-22
contact-number rule restoration). The error message on
rejection is `"Contact number must start with 8 or 9 and be
8 digits."`.

```bash
# 3.1. Try to update with a contact number that does not
#      start with 8 or 9
curl -i -b /tmp/admin-cookies.txt -X PUT \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "name": "Alice Tan",
    "subject": {
      "ulid": "01H000000000000000000000A1",
      "name": "Mathematics"
    },
    "email": "alice@example.com",
    "contactNumber": "12345678"
  }'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"Contact number must start with 8 or 9 and be 8 digits."}

# 3.2. Try a 9-digit value (rejected — exactly 8 digits required)
curl -i -b /tmp/admin-cookies.txt -X PUT \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "name": "Alice Tan",
    "subject": {
      "ulid": "01H000000000000000000000A1",
      "name": "Mathematics"
    },
    "email": "alice@example.com",
    "contactNumber": "912345678"
  }'
# Expect: HTTP/1.1 400 Bad Request
# Body:   {"error":"Contact number must start with 8 or 9 and be 8 digits."}
```

**Acceptance check**: 100% of UPDATE-Teacher submissions with
a `contactNumber` that does not match `^[89]\d{7}$` are
rejected with `400 Bad Request` and the standard error
envelope (per `SC-005`). The teacher is NOT updated (the
GET-by-ulid value in step 2.3 still shows the previous
`contactNumber`).

---

## Scenario 4 — DELETE-Teacher: form-teacher referential integrity (409)

**Goal**: verify `FR-009`, `Principle X.1`, and `SC-003`.
The DELETE-Teacher 409 envelope is the **singular object**
shape per Clarifications Session 2026-06-22 (DELETE-Teacher
409 envelope — one-to-one simplification): the `error`
string embeds the class name in double quotes; the
`details` extension carries `{ "classUlid", "className" }`
(both singular). The DB's `UNIQUE INDEX
uq_classes_form_teacher_id` guarantees at most one
affected class.

**Pre-condition**: Alice Tan is currently the form teacher
of at least one class. Use the Stage 1 POST-Classes flow to
create a class with Alice as the form teacher, OR use an
existing class from Stage 1 / Stage 2 testing.

```bash
# 4.1. Try to delete the form teacher — should be blocked
curl -i -b /tmp/admin-cookies.txt -X DELETE \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T \
  -H "X-CSRF-Token: $CSRF_TOKEN"
# Expect: HTTP/1.1 409 Conflict
# Body:   {
#            "error": "Teacher is assigned as form teacher of class \"Class 1A\". Reassign or delete that class first.",
#            "details": {
#              "classUlid": "01HZX8K2D5Y3J8QF8W9B3N5PA0",
#              "className": "Class 1A"
#            }
#          }

# 4.2. Verify the teacher is still present
curl -i -b /tmp/admin-cookies.txt \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T
# Expect: HTTP/1.1 200 OK
# Body:   {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7T","name":"Alice Tan",...}
```

**Acceptance check**: 409 on DELETE, the singular envelope
shape (per `SC-003`), the `error` string embeds the class
name in double quotes, the `details.classUlid` is a valid
26-character ULID, the teacher is NOT deleted.

**UI surface**: when the admin clicks **Delete** in the
per-row menu and confirms the modal, the modal closes and
an antd error notification appears whose body reads
`"Assigned as form teacher of: Class 1A. Reassign or delete that class first."`
(matching the wire `error` string verbatim, per FR-005).
The destructive `Delete` button uses the project's existing
Tailwind destructive-action token (per FR-004); no new
design tokens are introduced.

---

## Scenario 5 — DELETE-Teacher success path (after reassignment)

**Goal**: verify `FR-009` success path and `SC-002`. After
the form teacher has been reassigned to a different
teacher (or the class has been deleted), the DELETE call
succeeds with `200 OK` and `{ "ulid": "<deleted-teacher-ulid>" }`.

```bash
# 5.1. Reassign the class's form teacher to a different
#      teacher (Bobby Lim)
curl -i -b /tmp/admin-cookies.txt -X PUT \
  http://localhost:3000/api/v1.0/classes/01HZX8K2D5Y3J8QF8W9B3N5PA0 \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "name": "Class 1A",
    "level": {
      "ulid": "01H000000000000000000000B1",
      "name": "Primary 1"
    },
    "formTeacher": {
      "ulid": "01HZX8K2D5Y3J8QF8W9B3N5P7U",
      "name": "Bobby Lim"
    }
  }'
# Expect: HTTP/1.1 200 OK
# Body:   {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5PA0","name":"Class 1A",...,
#          "formTeacher":{"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7U","name":"Bobby Lim"},
#          "previousModifiedAt":"..."}

# 5.2. Now DELETE the original teacher — should succeed
curl -i -b /tmp/admin-cookies.txt -X DELETE \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T \
  -H "X-CSRF-Token: $CSRF_TOKEN"
# Expect: HTTP/1.1 200 OK
# Body:   {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5P7T"}

# 5.3. Verify the teacher is gone
curl -i -b /tmp/admin-cookies.txt \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T
# Expect: HTTP/1.1 404 Not Found
# Body:   {"error":"Teacher not found"}
```

**Acceptance check**: 200 on the first DELETE (with the
deleted `ulid` echoed back), 404 on a subsequent GET (the
teacher is gone). The whole flow finishes in well under
5 s (`SC-002`).

---

## Scenario 6 — Idempotent DELETE (second DELETE returns 404 silently)

**Goal**: verify `Principle X.2` and `SC-004`. A second
DELETE on the same `ulid` returns `404 Not Found` with the
standard envelope; the UI refreshes the list silently (no
error notification on 404).

```bash
# 6.1. Second DELETE on the same ulid — should be idempotent
curl -i -b /tmp/admin-cookies.txt -X DELETE \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T \
  -H "X-CSRF-Token: $CSRF_TOKEN"
# Expect: HTTP/1.1 404 Not Found
# Body:   {"error":"Teacher not found"}
```

**UI surface**: when the admin clicks **Delete** in the
per-row menu on a row that was already deleted in another
browser tab, the API returns `404`. The modal closes, the
list refreshes (the row was already gone), and no error
notification is shown (per FR-006 — "On 404 specifically,
no error notification is shown (the row was already gone;
the user's intent is satisfied)"). The 404 is informational,
not an error.

---

## Scenario 7 — UPDATE-Class: form-teacher collision (409)

**Goal**: verify `FR-008`, `Principle X.3`, and `SC-006`.
Updating a class's `formTeacher.ulid` to a teacher who is
ALREADY the form teacher of a DIFFERENT class is rejected
with `409 Conflict` and a field-level error on the Form
Teacher control. Updating to the same form teacher the
class already has is **permitted** (the row-exclusion
self-match rule — no `form_teacher_id` change → no
violation).

**Pre-condition**: Bobby Lim is the form teacher of
"Class 1B". Alice Tan is the form teacher of "Class 1A"
(reassigned earlier, then re-deleted — re-create the
scenario by using Stage 1 POST-Classes to create a class
with Bobby as the form teacher, then POST a second class
with a different teacher, then try to PUT the second class
to use Bobby as the form teacher).

```bash
# 7.1. Try to assign Bobby (form teacher of Class 1B) to
#      Class 1A — should be rejected
curl -i -b /tmp/admin-cookies.txt -X PUT \
  http://localhost:3000/api/v1.0/classes/01HZX8K2D5Y3J8QF8W9B3N5PA0 \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "name": "Class 1A",
    "level": {
      "ulid": "01H000000000000000000000B1",
      "name": "Primary 1"
    },
    "formTeacher": {
      "ulid": "01HZX8K2D5Y3J8QF8W9B3N5P7U",
      "name": "Bobby Lim"
    }
  }'
# Expect: HTTP/1.1 409 Conflict
# Body:   {"error":"Teacher is already assigned as form teacher of another class"}

# 7.2. PUT with the SAME form teacher the class already has
#      — should be permitted (no form_teacher_id change)
curl -i -b /tmp/admin-cookies.txt -X PUT \
  http://localhost:3000/api/v1.0/classes/01HZX8K2D5Y3J8QF8W9B3N5PA0 \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "name": "Class 1A",
    "level": {
      "ulid": "01H000000000000000000000B1",
      "name": "Primary 1"
    },
    "formTeacher": {
      "ulid": "<current-form-teacher-ulid-of-Class-1A>",
      "name": "<current-form-teacher-name>"
    }
  }'
# Expect: HTTP/1.1 200 OK
# Body:   {"ulid":"01HZX8K2D5Y3J8QF8W9B3N5PA0","name":"Class 1A",..., "previousModifiedAt":"..."}
```

**Acceptance check**: 409 on the form-teacher collision
(per `SC-006`), 200 on the same-form-teacher self-match
(no `form_teacher_id` change → no violation).

---

## Scenario 8 — Auth + CSRF coverage on Stage 3 endpoints

**Goal**: verify `FR-011` and `SC-007`. Every Stage 3
PUT and DELETE call without a valid session cookie
returns `401 Unauthorized`; every call without a matching
`X-CSRF-Token` header returns `403 Forbidden`. Both
rejections happen **before** the route handler runs (per
the middleware order in `middleware.ts`).

```bash
# 8.1. PUT without a session cookie — 401 from withAuth
curl -i -X PUT \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"name":"Alice Tan","subject":{"ulid":"01H000000000000000000000A1","name":"Mathematics"},"email":"alice@example.com","contactNumber":"91234567"}'
# Expect: HTTP/1.1 401 Unauthorized

# 8.2. PUT with a session cookie but no CSRF token — 403 from withCsrf
curl -i -b /tmp/admin-cookies.txt -X PUT \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Tan","subject":{"ulid":"01H000000000000000000000A1","name":"Mathematics"},"email":"alice@example.com","contactNumber":"91234567"}'
# Expect: HTTP/1.1 403 Forbidden
# Body:   {"error":"CSRF token mismatch"}

# 8.3. GET single-resource is CSRF-exempt (per Principle IX.3)
curl -i -b /tmp/admin-cookies.txt \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T
# Expect: HTTP/1.1 200 OK
# (No X-CSRF-Token header was sent; the GET still succeeds.)

# 8.4. DELETE without a CSRF token — 403 from withCsrf
curl -i -b /tmp/admin-cookies.txt -X DELETE \
  http://localhost:3000/api/v1.0/teachers/01HZX8K2D5Y3J8QF8W9B3N5P7T
# Expect: HTTP/1.1 403 Forbidden
```

**Acceptance check**: 100% of Stage 3 PUT and DELETE calls
without a valid session cookie return `401 Unauthorized`;
100% without a matching `X-CSRF-Token` header return
`403 Forbidden`; GET single-resource is CSRF-exempt
(per `SC-007`).

---

## Scenario 9 — Concurrent-edit toast (UI)

**Goal**: verify `FR-016` and the `previousModifiedAt`
extension on PUT 200. Open the Edit Teacher page in two
browser tabs; the second tab's save fires the
concurrent-edit toast.

1. Open `http://localhost:3000/teachers` in two browser
   tabs. Both tabs load the same Teachers list.
2. In **Tab A**, click the `...` menu on the Alice Tan row,
   then **Edit**. The Edit Teacher form loads with the
   current `modifiedAt` value captured in the form's
   internal state (let's call it `formLoadTime.modifiedAt`).
3. In **Tab B**, click the `...` menu on the same Alice Tan
   row, then **Edit**. (Both tabs can have the form open
   simultaneously — this is the "concurrent edit" scenario
   the toast is designed to surface.)
4. In **Tab B**, change `contactNumber` to `81112233` and
   click **Save**. The PUT succeeds (last-write-wins per
   Principle X.3 strict-PUT semantics); the route returns
   `200 OK` with the updated row plus
   `previousModifiedAt = "<Tab B's pre-write value>"`. The
   `use-edit-submit` hook compares this to
   `formLoadTime.modifiedAt` — they **differ** (Tab B
   updated the row). The toast fires:
   `Note: this record was edited by another administrator at 10:15:30 — your changes are saved, but please verify.`
5. In **Tab A**, the form is still on the old values. Change
   `contactNumber` to `84445566` and click **Save**. The
   PUT succeeds; the response body includes
   `previousModifiedAt = "<Tab B's write time>"` (the
   pre-write value **before** Tab A's write, which is
   Tab B's write time). The `use-edit-submit` hook
   compares this to `formLoadTime.modifiedAt` — they
   differ (Tab B wrote between Tab A's load and Tab A's
   save). The toast fires.
6. The toast is informational only — the update has
   already been saved (per FR-016). The toast does NOT
   block navigation, MUST NOT trigger a re-fetch, and
   auto-dismisses after 8 seconds (or when the admin
   closes it manually).

**Acceptance check**: when a successful UPDATE returns
`200 OK` with a `previousModifiedAt` field that differs
from the form-load `modifiedAt`, the UI shows the
non-blocking antd warning notification. When the two are
equal (the form is the only writer), the toast does
**not** fire.

---

## Scenario 10 — Unit / contract / integration test runs

**Goal**: verify the Stage 3 coverage of the three Vitest
test tiers (per the test strategy in
[research.md §6.4](./research.md#64-test-strategy-vitest-three-tiers)).

```bash
# 10.1. Unit tier (no DB, no network, no auth)
npm run test:unit -- tests/unit/teachers/mutations.spec.ts
npm run test:unit -- tests/unit/classes/mutations.spec.ts
# Expect: all tests pass; coverage of the PUT + DELETE Joi
#         schemas, the repository methods, the form-teacher
#         guard query, and the leading-digit contact-number
#         rejection path on PUT

# 10.2. Contract tier (in-memory MySQL stub + ioredis-mock)
npm run test:contract -- tests/contract/teachers-mutations.api.spec.ts
npm run test:contract -- tests/contract/classes-mutations.api.spec.ts
# Expect: all tests pass; coverage of the 200 / 400 / 401 /
#         403 / 404 / 409 / 415 / 500 / 503 status matrix on
#         every new endpoint; coverage of the 409 envelope
#         shape on DELETE-Teacher (the singular
#         details.classUlid / details.className object);
#         coverage of the previousModifiedAt field on PUT 200

# 10.3. Integration tier (real MySQL + real Redis containers)
npm run test:integration -- tests/integration/teachers-mutations.api.spec.ts
npm run test:integration -- tests/integration/classes-mutations.api.spec.ts
# Expect: all tests pass; coverage of SC-001..SC-008
#         end-to-end; the DELETE-Teacher 409 path is tested
#         with a real classes row pointing at the teacher
#         under test; the form-teacher collision on
#         PUT-Class is tested with two pre-seeded classes
#         sharing the same form teacher
```

**Acceptance check**: all three tiers pass; no test is
flaky; the contract and integration suites cover the
full status matrix; the unit suite covers the
leading-digit contact-number rejection path on PUT (per
`SC-005`).

---

## Manual checks (dev-only, not testable)

These checks are documented as a manual sanity gate at
implementation time but are not enforceable by the test
suites. They are the kind of thing a reviewer would spot
during a code review of the implementation PR.

- The per-row `...` menu on the Teachers list and the
  Classes list is **reused** — there is a single
  `RowActionsMenu` component imported by both
  `TeacherTable.tsx` and `ClassTable.tsx`. Two copies
  would be a YAGNI violation.
- The destructive `Delete` button in the confirmation
  modal uses the project's existing Tailwind
  destructive-action token (per FR-004) — no new design
  tokens were added.
- The Edit Teacher form is a React Server Component that
  calls `GET /api/v1.0/teachers/[ulid]` from the `page.tsx`
  shell — no client-side blank / loading state during the
  data population step. URLs are shareable and bookmarkable.
- The `details.classUlid` in the DELETE-Teacher 409
  envelope is used by the antd error notification to
  deep-link the admin to `/classes/[ulid]/edit` (per
  FR-005). The notification body matches the wire `error`
  string verbatim — no array truncation logic, no `… and
  N more` suffix, no first-5-listing rule (per the
  Clarifications Session 2026-06-22 (DELETE-Teacher 409
  envelope — one-to-one simplification)).

---

## What "Done" looks like

A reviewer should be able to walk through the above
scenarios and verify each acceptance check. The Stage 3
feature is "done" when:

- `FR-001`..`FR-016` from the spec are reflected in the
  implementation.
- `SC-001`..`SC-008` from the spec are covered by the
  three test tiers.
- The six new endpoints are exposed under the
  `/api/v1.0/` version prefix (per FR-022, owned by
  `003-backend-api-db`).
- The two new RSC pages (`/teachers/[ulid]/edit`,
  `/classes/[ulid]/edit`) are reachable from the per-row
  `...` menu's **Edit** item and pre-populate the form on
  first paint.
- The Delete confirmation modal embeds the row's `name`
  and uses the project's Tailwind destructive-action
  token.
- The `details` extension on the DELETE-Teacher 409
  envelope is the singular object shape per the
  Clarifications Session 2026-06-22 (DELETE-Teacher 409
  envelope — one-to-one simplification).
- The `previousModifiedAt` sibling field is present on
  every PUT 200 response body and is consumed by the
  `use-edit-submit` hook for the concurrent-edit toast.
- The Singapore `^[89]\d{7}$` contact-number regex is
  enforced on both POST (001) and PUT (006) via the
  shared `lib/validation/contact-number.ts` module.
- The form-teacher referential integrity check on
  DELETE-Teacher is a single indexed query against
  `classes.form_teacher_id` (`O(log n)`, returns 0 or 1
  rows); the data-layer backstop is the `UNIQUE INDEX
  uq_classes_form_teacher_id` constraint.
- No new tables, no new typeORM migrations, no new
  runtime dependencies, no new devDependencies, no new
  design tokens, no new form components were introduced
  (per Principle V — YAGNI; per the constitution Stage
  Scope → Stage 3 In Scope block).
