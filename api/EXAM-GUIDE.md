# Exam Guide API (Doc 1 Phase 1)

Recruitment-cycle-scoped content: eligibility, important dates, document requirements,
application steps/mistakes, and fee rules — the "when does this exam open, am I eligible, how do
I apply" domain. Introduced by migration
`backend/src/main/resources/db/migration/V17__exam_guide_phase1.sql`. Background:
`reports/23-exam-guide-phase1/exam-guide-phase1.md`. Selection process, exam pattern and
syllabus are deliberately *not* part of this model — they already exist
(`ExamStructureService`, `exam_subjects`/`topics`) and are reused rather than duplicated.

Unlike the rest of the app, the mobile Exam Guide screen (`mobile/src/app/exam-guide.tsx`,
fetching via `mobile/src/api/examGuide.ts`) is **live-fetch only** — there is no local SQLite
table or delta-sync pipeline for this content yet (see the comment at the top of
`examGuide.ts`). That's a deliberate Phase-1 scope decision, not an oversight: it means no
offline access to guide content and no "last updated" staleness indicator, both flagged as
follow-up work in the report.

## Key model facts

- **`is_current` — one-per-exam, DB-enforced.** A recruitment cycle is admin-flagged current
  via a partial unique index (`uq_recruitment_cycles_current ON recruitment_cycles (exam_code)
  WHERE is_current`), not derived from dates/status. This is deliberate: an admin who has just
  entered next year's cycle needs the *old* one to keep serving the app until they're ready to
  flip the switch, not the instant a date field makes the new one "look current." Creating or
  updating a cycle with `current: true` calls `clearCurrentForExam` first to atomically demote
  any existing current cycle for that exam.
- **`is_demo` — a permanent column, not a seeding note.** Every `recruitment_cycles` row carries
  a real `is_demo` boolean (V17), distinct from Epic L's synthetic curation (which had to invent
  a marker in a spare text column because nothing in that schema distinguished synthetic rows).
  `ExamGuideDemoSeeder` sets it `true` on the one demo cycle it creates (SSC CGL, "2027 (Demo)"),
  and **every consumer — mobile and admin — must render it as a visible "Demo" badge**, never
  silently. This is not cleared by purging or by time; it persists until an admin explicitly
  replaces the cycle with real content (a V18+ concern).
- **404-when-no-current-cycle is the normal state, not an edge case.** `GET
  /api/exams/{code}/guide` throws `NoSuchElementException` → 404 when the exam has no cycle
  flagged current, and *most exams have none yet* — only SSC CGL currently does, via the demo
  seeder. `getAllGuides`/`GET /api/exam-guides` instead just omits such exams from its list
  (no error). Mobile's `getExamGuide` wrapper explicitly catches the 404 and returns `null` for a
  "not yet available" empty state rather than surfacing an error screen.

## Endpoints — `ExamGuideController` (public reads)

### GET /api/exams/{examCode}/guide
**Purpose:** One exam's current-cycle guide — eligibility, dates, documents, application steps/mistakes, fees, and the sources backing them.
**Auth:** none required; personalized when a valid Bearer token is presented (each document's `userStatus` is then populated), anonymous otherwise. A header that *is* present but invalid/expired still throws 401 — silently degrading to anonymous would mask a real bug as an empty personalization.
**Request:** none
**Response:** `ExamGuideResponse { examCode, examName, recruitmentCycleId, cycleName, status, notificationDate, applicationStart, applicationEnd, examStart, examEnd, vacancyCount, notificationUrl, demo, lastVerifiedAt, eligibility, importantDates[], documents[], applicationSteps[], applicationMistakes[] (string list), fees[], sources[] }`
**Errors:** 401 only if an Authorization header is present but invalid/expired, 404 if the exam has no current recruitment cycle (see above)
**Business rules:** `sources` is a flattened, de-duplicated list resolved once at the end (each fact carries only a `sourceId`) rather than nesting the full source object into every date/document/fee row, since the same 1-3 sources typically back most of a cycle's facts.
**Consumers:** Mobile (`getExamGuide` in `mobile/src/api/examGuide.ts`, live-fetch, no cache)

### GET /api/exam-guides
**Purpose:** Every active exam's current-cycle guide in one response.
**Auth:** none required; same personalization rule as above
**Request:** none
**Response:** `ExamGuideResponse[]`
**Errors:** none exam-specific (exams with no current cycle are simply absent from the list, not an error)
**Business rules:** Documented in the controller as "what mobile syncs," but as of this writing **no caller was found** in `mobile/src/api/*.ts` or `admin/src/api.js` — mobile fetches per-exam via `getExamGuide` instead. Worth flagging: this bulk endpoint appears unused by either client right now.
**Consumers:** none found (see note above)

### GET /api/exams/{examCode}/recruitment-cycles/history
**Purpose:** Every *non-current* (past) cycle for this exam — spec §63 "Notification History."
**Auth:** none (past dates/vacancy counts are historical fact, not sensitive)
**Request:** none
**Response:** `RecruitmentCycleHistoryEntry[] { recruitmentCycleId, cycleName, status, notificationDate, applicationStart, applicationEnd, examStart, examEnd, vacancyCount }` — deliberately lighter than the admin `RecruitmentCycleResponse` shape: no `current`/`demo` flags a past cycle can't meaningfully carry, and no write-side fields
**Errors:** 404 exam not found
**Business rules:** Cycles are never deleted when superseded, so this is what lets a user actually see them. Ordered newest-first by creation.
**Consumers:** Mobile (`getCycleHistory` in `mobile/src/api/examGuide.ts`, from the `exam-guide-history` screen)

### PUT /api/user/documents/{documentRequirementId}/status
**Purpose:** Marks one document Ready/Missing/Not-Applicable for the signed-in user (spec §11).
**Auth:** user (Bearer token, via `authService.requireUser`)
**Request:** `UserDocumentStatusRequest { status: "READY" | "MISSING" | "NOT_APPLICABLE" }`
**Response:** 204 No Content
**Errors:** 401 not signed in, 404 document requirement not found, 400 invalid status value (unmatched enum throws on `valueOf`)
**Business rules:** Upserts a `user_document_status` row keyed by `{userId}:{documentRequirementId}`. This is the one signed-in write Exam Guide Phase 1 exposes; everything else in this controller is a public read.
**Consumers:** Mobile (`setDocumentStatus` in `mobile/src/api/examGuide.ts`)

## Endpoints — `ExamGuideAdminController` (admin CRUD)

Every endpoint below requires **admin** auth (Bearer token + ADMIN role via
`authService.requireAdmin`) and returns 401/403 accordingly on missing/non-admin auth — omitted
from each entry below for brevity. All are consumed by the admin console (`admin/src/pages/ExamGuide.jsx`, `admin/src/pages/ExamSources.jsx`, via wrapper functions in `admin/src/api.js`) unless noted otherwise.

### Recruitment cycles

#### POST /api/recruitment-cycles
**Purpose:** Creates a recruitment cycle for an exam.
**Request:** `RecruitmentCycleRequest { examCode, cycleName, status, notificationDate, applicationStart, applicationEnd, examStart, examEnd, vacancyCount, notificationUrl, current, demo, lastVerifiedAt }`
**Response:** 201 + `RecruitmentCycleResponse` (adds `id`, `examName`)
**Errors:** 400 if a cycle with the same name already exists for this exam (case-insensitive), 404 exam not found
**Business rules:** If `current: true`, every other cycle for the exam is atomically demoted first (`clearCurrentForExam`), enforcing the one-current-per-exam invariant.

#### PUT /api/recruitment-cycles/{id}
**Purpose:** Updates a recruitment cycle.
**Request:** `RecruitmentCycleRequest` (same shape)
**Response:** `RecruitmentCycleResponse`
**Errors:** 404 cycle not found, 400 moving the cycle to a different exam (`examCode` must match the existing cycle's exam), 400 renaming to a name already used by another cycle of the same exam
**Business rules:** Same current-cycle demotion as create when `current: true`.

#### GET /api/exams/{examCode}/recruitment-cycles
**Purpose:** Lists every cycle (current, past, demo) for one exam — the admin-side counterpart to the public history endpoint.
**Response:** `RecruitmentCycleResponse[]`, newest-first
**Errors:** 404 exam not found

#### DELETE /api/recruitment-cycles/{id}
**Purpose:** Deletes a cycle.
**Response:** 204
**Errors:** 404 cycle not found
**Business rules:** Cascades to every cycle-scoped table (eligibility, dates, documents, steps, mistakes, fees) via `ON DELETE CASCADE` declared in V17 — a deliberate "start over" action.

### Exam sources

#### POST /api/exam-sources
**Purpose:** Creates a citable source (official notification, website, calendar, notice, or admin estimate).
**Request:** `ExamSourceRequest { sourceName, sourceType, url, publicationDate, lastVerifiedAt }` — `sourceType` one of `OFFICIAL_NOTIFICATION | OFFICIAL_WEBSITE | OFFICIAL_CALENDAR | OFFICIAL_NOTICE | ADMIN_ESTIMATE`
**Response:** 201 + `ExamSourceResponse`
**Errors:** 400 invalid `sourceType`

#### PUT /api/exam-sources/{id}
**Purpose:** Updates a source.
**Response:** `ExamSourceResponse`
**Errors:** 404 source not found, 400 invalid `sourceType`

#### GET /api/exam-sources
**Purpose:** Lists every source, alphabetical by name (not exam-scoped — sources are shared/reusable).
**Response:** `ExamSourceResponse[]`

#### DELETE /api/exam-sources/{id}
**Purpose:** Deletes a source.
**Response:** 204
**Errors:** 404 source not found
**Business rules:** Every cycle-scoped fact table references sources with `ON DELETE SET NULL`, so deleting a cited source does not fail — it just un-cites it everywhere.

### Eligibility (one-to-one per cycle)

#### PUT /api/recruitment-cycles/{cycleId}/eligibility
**Purpose:** Creates or replaces the single eligibility rule for a cycle.
**Request:** `EligibilityRuleRequest { minimumAge, maximumAge, ageCutoffDate, qualification, nationality, genderRequirement, categoryRelaxation (map of category → relaxation years), specialRequirements, sourceId }`
**Response:** `EligibilityRuleResponse`
**Errors:** 404 cycle not found
**Business rules:** True upsert — `eligibility_rules.recruitment_cycle_id` is the primary key (not a surrogate id), so there is exactly one row per cycle by construction.

#### GET /api/recruitment-cycles/{cycleId}/eligibility
**Purpose:** Reads the cycle's eligibility rule.
**Response:** 200 + `EligibilityRuleResponse`, or 204 No Content if none is set yet

### Important dates

#### POST /api/recruitment-cycles/{cycleId}/important-dates
**Purpose:** Adds one important date (notification, application window, admit card, exam stage, answer key, result, etc.) to a cycle.
**Request:** `ImportantDateRequest { eventType, title, startDate, endDate, official, displayOrder, sourceId }`
**Response:** 201 + `ImportantDateResponse`
**Errors:** 404 cycle not found, 400 invalid `eventType`

#### PUT /api/important-dates/{id}
**Purpose:** Updates one important date.
**Response:** `ImportantDateResponse`
**Errors:** 404 date not found, 400 invalid `eventType`

#### GET /api/recruitment-cycles/{cycleId}/important-dates
**Purpose:** Lists a cycle's dates, ordered by `displayOrder`.
**Response:** `ImportantDateResponse[]`
**Errors:** 404 cycle not found

#### DELETE /api/important-dates/{id}
**Purpose:** Deletes one date.
**Response:** 204
**Errors:** 404 date not found

### Document requirements

#### POST /api/recruitment-cycles/{cycleId}/document-requirements
**Purpose:** Adds one required/conditional document to a cycle's checklist.
**Request:** `DocumentRequirementRequest { documentName, required, applicableFor, format, maxSizeKb, dimensions, instructions, displayOrder, sourceId }` — `required` one of `YES | NO | IF_APPLICABLE`
**Response:** 201 + `DocumentRequirementResponse`
**Errors:** 404 cycle not found, 400 invalid `required` value

#### PUT /api/document-requirements/{id}
**Purpose:** Updates one document requirement.
**Response:** `DocumentRequirementResponse`
**Errors:** 404 not found, 400 invalid `required` value

#### GET /api/recruitment-cycles/{cycleId}/document-requirements
**Purpose:** Lists a cycle's document checklist, ordered by `displayOrder`.
**Response:** `DocumentRequirementResponse[]`
**Errors:** 404 cycle not found

#### DELETE /api/document-requirements/{id}
**Purpose:** Deletes one document requirement.
**Response:** 204
**Errors:** 404 not found
**Business rules:** Cascades to `user_document_status` rows referencing it.

### Application steps

#### POST /api/recruitment-cycles/{cycleId}/application-steps
**Purpose:** Adds one numbered step to a cycle's "how to apply" walkthrough.
**Request:** `ApplicationStepRequest { stepNumber, title, description, warning, officialUrl }`
**Response:** 201 + `ApplicationStepResponse`
**Errors:** 404 cycle not found, 400 if `stepNumber` is already used for this cycle

#### PUT /api/application-steps/{id}
**Purpose:** Updates one step.
**Response:** `ApplicationStepResponse`
**Errors:** 404 not found

#### GET /api/recruitment-cycles/{cycleId}/application-steps
**Purpose:** Lists a cycle's steps, ordered by `stepNumber`.
**Response:** `ApplicationStepResponse[]`
**Errors:** 404 cycle not found

#### DELETE /api/application-steps/{id}
**Purpose:** Deletes one step.
**Response:** 204
**Errors:** 404 not found

### Application mistakes

#### POST /api/recruitment-cycles/{cycleId}/application-mistakes
**Purpose:** Adds one common-mistakes entry (a flat list, not tied to any one step — several mistakes span the whole application).
**Request:** `ApplicationMistakeRequest { mistake, displayOrder }`
**Response:** 201 + `ApplicationMistakeResponse`
**Errors:** 404 cycle not found

#### PUT /api/application-mistakes/{id}
**Purpose:** Updates one mistake entry.
**Response:** `ApplicationMistakeResponse`
**Errors:** 404 not found

#### GET /api/recruitment-cycles/{cycleId}/application-mistakes
**Purpose:** Lists a cycle's mistakes, ordered by `displayOrder`.
**Response:** `ApplicationMistakeResponse[]`
**Errors:** 404 cycle not found

#### DELETE /api/application-mistakes/{id}
**Purpose:** Deletes one mistake entry.
**Response:** 204
**Errors:** 404 not found

### Fee rules

#### POST /api/recruitment-cycles/{cycleId}/fee-rules
**Purpose:** Adds one category's fee rule to a cycle.
**Request:** `FeeRuleRequest { category, amountRupees, exempted, notes, displayOrder, sourceId }` — `category` is an open vocabulary (e.g. `GENERAL`, `OBC`, `SC`, `ST`, `FEMALE`, `PWBD`, `EX_SERVICEMEN`; different exams recognise different sets)
**Response:** 201 + `FeeRuleResponse`
**Errors:** 404 cycle not found, 400 if a fee rule for this category already exists for the cycle

#### PUT /api/fee-rules/{id}
**Purpose:** Updates one fee rule.
**Response:** `FeeRuleResponse`
**Errors:** 404 not found

#### GET /api/recruitment-cycles/{cycleId}/fee-rules
**Purpose:** Lists a cycle's fee rules, ordered by `displayOrder`.
**Response:** `FeeRuleResponse[]`
**Errors:** 404 cycle not found

#### DELETE /api/fee-rules/{id}
**Purpose:** Deletes one fee rule.
**Response:** 204
**Errors:** 404 not found

## Endpoints — `ExamGuideDemoSeedController` (mounted under `/api/admin/exam-guide-demo`)

Same two-gate shape as Epic L's `SyntheticCurationController`: admin token **and**
`app.exam-guide.demo-seed-enabled=true` (config default `false`; not present in
`application.yml` at all, so it relies entirely on the code default). Seeds/purges exactly one
demo cycle: SSC CGL, "2027 (Demo)", with `is_demo = true` and fully invented (but plausible)
eligibility, dates, documents, application steps/mistakes and fees, sourced to
`ExamSourceType.ADMIN_ESTIMATE` — never disguised as a real official notification.

**Note on consumers:** `admin/src/api.js` defines wrapper functions
(`getExamGuideDemoSeedStatus`, `seedExamGuideDemoData`, `purgeExamGuideDemoData`), but no admin
page was found calling any of them — like Epic L's synthetic-curation endpoints, these appear to
be operational tools invoked directly (curl/Postman) rather than wired into the admin UI.

### GET /api/admin/exam-guide-demo/status
**Purpose:** Reports whether demo seeding is currently possible.
**Auth:** admin
**Request:** none
**Response:** `{ enabled: boolean }`
**Errors:** 401, 403
**Consumers:** none found (unused wrapper function exists in `admin/src/api.js`)

### POST /api/admin/exam-guide-demo/seed
**Purpose:** Creates the demo SSC CGL cycle plus its eligibility/dates/documents/steps/mistakes/fees.
**Auth:** admin
**Request:** none
**Response:** `{ recruitmentCycleId, examCode: "SSC_CGL", cycleName: "2027 (Demo)", demo: true }`
**Errors:** 401, 403, 500 (`IllegalStateException`, not mapped to a specific status) if disabled by config, or if a "2027 (Demo)" cycle already exists for SSC_CGL (purge first)
**Business rules:** Setting this cycle current demotes any existing current SSC_CGL cycle first. Unlike Epic L's synthetic seeder (which throws a mapped `ForbiddenException`/403 when disabled), this seeder throws a plain `IllegalStateException` when the flag is off — worth flagging as an inconsistency, since it likely surfaces as an unmapped 500 rather than a clean 403.
**Consumers:** none found (unused wrapper function exists in `admin/src/api.js`)

### POST /api/admin/exam-guide-demo/purge
**Purpose:** Removes the demo cycle (and, via cascade, its eligibility/dates/documents/steps/mistakes/fees) plus the demo-prefixed sources it created.
**Auth:** admin
**Request:** none
**Response:** `{ cyclesRemoved: number, sourcesRemoved: number }`
**Errors:** 401, 403
**Business rules:** Cycle deletion cascades everything cycle-scoped in one statement (V17's `ON DELETE CASCADE`). Sources are deleted explicitly by matching the `"[Demo] "` name prefix, since sources aren't owned by the cycle's cascade (they're meant to be reusable across cycles).
**Consumers:** none found (unused wrapper function exists in `admin/src/api.js`)
