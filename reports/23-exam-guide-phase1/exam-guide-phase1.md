# Exam Guide — Phase 1 (backend, admin, mobile)

Implements Phase 1 of the "SARKARITAAYARI — EXAM GUIDE / EXAM INTELLIGENCE MODULE" spec
("Doc 1"), per the earlier decision: build it all, seed content **labelled as demo in the
UI itself**, so nothing unverified can ever look official.

---

## 1. What Doc 1's own audit found, before writing code

Recorded here because it changed the shape of the work:

- **Doc 1 assumes a Roadmap module that does not exist.** §22, §71 and §72's target
  navigation all reference "Roadmap" as an existing screen. The app's tabs are Home /
  Practice / Mock Test / Progress / More. Nowhere does this implementation invent a
  Roadmap screen to satisfy that assumption — it was simply wrong about the app.
- **§40's "Footer Module" is a web pattern**, proposed for an app whose only navigation
  is a bottom tab bar. Not built.
- **Phase 2 (§16–§19: pattern, syllabus, PYQ trends, difficulty) is already ~70% built**
  by Epic L and V11 — `exam_subjects`, `topics.parent_id`, `exam_topics`, `topic_trend`,
  `topic_priority`, `exam_stages`/`exam_papers`/`paper_sections`. This implementation
  reuses all of it rather than duplicating a second content model for the same facts —
  Doc 1's own §59/§70 explicitly says not to.
- **Phase 1 is genuinely greenfield.** Before this work, `exams` had five columns
  (`code, name, image_url, is_active, display_order`, plus V11's `difficulty`/`badge`).
  There was no recruitment-cycle, date, eligibility, fee, document, application-step or
  source table at all.

So this pass built exactly Phase 1 (§69): discovery, overview, status, dates, eligibility,
before-you-apply/documents, fees, how-to-apply, official notification. Selection process,
exam pattern and syllabus are **not duplicated** — they're the existing Epic L/V3 model,
linked to from here.

---

## 2. Data model (migration `V17__exam_guide_phase1.sql`)

Everything below is scoped to a `recruitment_cycles` row, not to the exam itself — the
spec's own §33 "Information Versioning" principle: eligibility, dates, fees and documents
change every year, and showing last year's fee on this year's application is exactly the
failure mode §61 warns about.

| Table | Purpose |
|---|---|
| `recruitment_cycles` | One year's/round's version of an exam. `is_current` (admin-set, one per exam via a partial unique index) decides what mobile shows; `is_demo` is a **persistent** flag, not a one-time seeding note |
| `exam_sources` | §32's citation table — one row per notification/website/calendar, reused across every fact it backs |
| `eligibility_rules` | 1:1 per cycle (the `@Id` **is** the cycle id) |
| `important_dates` | The §7 timeline, `is_official` distinguishing "Expected" from confirmed |
| `document_requirements` + `user_document_status` | The §11 document catalogue and each signed-in user's Ready/Missing/Not-Applicable against it |
| `application_steps` / `application_mistakes` | §12/§13, kept as two tables because mistakes aren't tied to one step |
| `fee_rules` | §14, one row per category per cycle |

`user_document_status` uses a synthetic `VARCHAR(80)` id
(`"{userId}:{documentRequirementId}"`), **not** a JPA `@IdClass` composite key — per
**ADR-005** (`reports/architecture-decisions.md`), a composite key caused real 500s on
`user_bookmarks` via `isNew()` misbehaving for a derived identifier. Same convention as
`UserBookmark` and `UserTopicProgress`.

---

## 3. Backend API

**Public** (`ExamGuideController`) — deliberately unauthenticated for reads, same rule as
`exam-structures` and `topic-intelligence`: withholding dates/eligibility/fees would
defeat the point of a guide meant to help someone decide whether to apply.

- `GET /api/exams/{examCode}/guide` — the current cycle's full guide. 404 (not an error
  screen) when the exam has no current cycle configured — the normal state for 10 of 11
  exams right now.
- `GET /api/exam-guides` — every active exam's current-cycle guide in one response, for a
  future device sync.
- `PUT /api/user/documents/{id}/status` — the one signed-in write this phase exposes
  (Ready/Missing/Not-Applicable). A present-but-invalid token still 401s; only a **missing**
  header is treated as "browsing anonymously".

**Admin** (`ExamGuideAdminController`) — full CRUD for all seven resource types, admin
token required on every write, matching §58.

One combined `ExamGuideResponse` per exam, not the eight separate endpoints Doc 1's own
§59 sketch lists (`/dates`, `/eligibility`, `/documents`, ...) — every section renders on
the same screen, exactly the same reasoning `ExamStructureResponse` already uses for
stage/paper/section.

---

## 4. Two real bugs found and fixed while building this

**1. `MultipleBagFetchException` on the mobile sync-all query.** The first version of
`RecruitmentCycleRepository.findCurrentCyclesForActiveExams()` fetch-joined two
collections (`importantDates` and `feeRules`) in one JPQL query — the exact class of bug
`ExamStageRepository`'s own comment warns against, and I made it anyway. Caught
immediately by actually calling `/api/exam-guides` rather than trusting the code once it
compiled. Fixed by fetch-joining only the exam and leaving the five child lists to
`hibernate.default_batch_fetch_size` (already configured at 500), the same tradeoff
`ExamStageRepository.findStructuresForActiveExams` documents.

**2. A pre-existing, previously-undiscovered encoding bug — not introduced this session,
but found by it.** `pom.xml` had no `project.build.sourceEncoding`, so `javac` on this
Windows machine compiles source files using the platform default charset (Cp1252), not
UTF-8. A real `—` (em dash, 3 UTF-8 bytes: `E2 80 94`) in a string literal gets decoded as
three separate Cp1252 characters (`â`, `€`, `”`), compiled into the constant as those three
wrong codepoints, and round-trips through JDBC as visible mojibake by the time it reaches
the API.

This is not cosmetic or new. `grep` for em-dash string literals in **already-shipped**
files turned up:
- `AuthService.java:126` — `"Session expired — please sign in again"`, a real 401 body
  every signed-out user could hit.
- `TopicIntelligenceService.java:485,497` — two admin-facing override-validation messages.
- `AdminBootstrapRunner.java:53` — a `log.warn`, log-only, lowest severity.

**Fixed globally** by adding `<project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>`
to `pom.xml` (plus the reporting-output counterpart). One line fixes all four pre-existing
sites and every future one — no source file needed editing, since the em dash was always
correct UTF-8 on disk; only javac's *reading* of it was wrong. Verified: recompiled,
purged and re-seeded the demo cycle, and every em dash in the eligibility text and step
warnings now renders correctly.

---

## 5. Synthetic demo data (`ExamGuideDemoSeeder`)

One demo cycle, SSC CGL "2027 (Demo)", covering every section: eligibility (age 18–32,
category relaxations), 8 important dates, 7 documents (including an `IF_APPLICABLE` row),
8 application steps with warnings, 7 common mistakes, 7 fee rows.

Unlike Epic L's synthetic seeder — which had to invent a marker in a spare text column
because nothing in that schema distinguished synthetic rows — `recruitment_cycles` was
**designed from the start** with a persistent `is_demo` column. Every consumer (mobile +
admin) renders it as a visible badge; nothing here can silently look official. Sources
cited are `ADMIN_ESTIMATE`, never a fabricated official notification.

Same two-gate shape as `SyntheticCurationController`: admin token +
`app.exam-guide.demo-seed-enabled=true` (default false, enabled in local dev only).
`POST /api/admin/exam-guide-demo/seed` / `.../purge` — purge cascades everything except
the sources it created, which are deleted by name prefix (`"[Demo] "`) since sources are
meant to be reusable across cycles and aren't owned by the cycle's cascade.

---

## 6. Admin console

`pages/ExamGuide.jsx` (reached via a new "Guide" button next to "Structure" on the Exams
list) — one recruitment cycle selected at a time; everything below it (eligibility, dates,
documents, steps, mistakes, fees) belongs to that cycle. `pages/ExamSources.jsx` — a flat
CRUD list for citations, following `Languages.jsx`'s exact shape.

New `components/SectionTable.jsx` — a shared table+add-button+edit/delete shell, pulled
out once it became the third near-identical copy of `ExamStructure.jsx`'s inline
stage/paper/section table markup.

**Not click-tested in a real browser** — no browser-automation tool was available in this
session. Verified instead by: a clean `npm run build`, a clean `oxlint` (one pre-existing
warning, unrelated), and by exercising the identical backend endpoints these pages call,
directly, via curl (see §7). The one thing that check cannot catch is a wiring mistake
purely on the frontend side (e.g. a shadowed import, the exact bug a previous Epic L
session's `AdminTokenMintRunner` was built to catch) — flagged as the honest limit of this
verification, not glossed over.

---

## 7. Mobile

**Scope decision, stated rather than hidden: this is live-fetch only, no offline cache.**
Every other reference type in this app (exams, subjects, topics, exam structure) has a
local SQLite table and a sync-pipeline entry; Exam Guide does not, yet. Building that
second migration + delta-sync integration in the same pass would have doubled this
work's size for a feature that, on a real device, still has no real notification content
behind it in 10 of 11 exams. `src/api/examGuide.ts` says so in its own header comment.
**Cost of the decision:** no offline access to guide content (spec §44), and no
"last verified" staleness indicator beyond the one already in the payload.

**What shipped:**
- `src/app/exam-guide.tsx` — the landing page (spec §5): status pill, application-close
  countdown, quick facts (qualification/age/vacancies/fee), important-dates timeline,
  eligibility (with the required "final eligibility is determined by the official
  recruiting authority" disclaimer per §9), a tap-to-cycle Ready/Missing/Not-Applicable
  document checklist (signed-in only), how-to-apply steps with warnings, common mistakes,
  fees, and a **demo banner that cannot be dismissed or hidden** whenever `guide.demo` is
  true.
- Reached by tapping the exam card on Home (`app/(tabs)/index.tsx`), which now navigates
  to `/exam-guide` with the followed exam's code/name.
- 404 (no current cycle) renders a genuine empty state, not an error — the spec's own
  §54 distinction.

**Not done this pass**, stated explicitly: eligibility checker (interactive form, §9),
diagnostic test (§21), My Exams / follow / reminders (§29, Phase 3), notification
simplifier (§31, Phase 4), exam comparison (§27, Phase 4), Telugu translation of this
screen's own labels (the content itself — dates/fees/eligibility text — is English-only
from the server regardless, so translating only the surrounding labels would be a
partial, confusing translation; left as English-only rather than half-done).

---

## 8. Verified

| Check | Result |
|---|---|
| Backend `mvn compile` / `mvn clean compile` | clean |
| Backend full test suite (`mvn test`, all pre-existing classes) | reported complete, exit 0 |
| `GET /api/exams/SSC_CGL/guide` (anonymous) | 200, full nested payload, `demo: true`, `userStatus: null` |
| `GET /api/exam-guides` (sync-all) | 200, after fixing the `MultipleBagFetchException` |
| `GET /api/exams/SSC_CHSL/guide` (no cycle configured) | 404 — the mobile empty-state path |
| `PUT /api/user/documents/{id}/status` with no token | 401 |
| Em dashes in seeded eligibility/step text | garbled before the `pom.xml` fix, clean UTF-8 after purge+reseed |
| Admin `npm run build` | clean |
| Admin `oxlint` | 1 pre-existing warning, unrelated |
| Mobile `npx tsc --noEmit` | clean |
| Mobile `npx expo lint` | 9 problems, all pre-existing (introduced one via `useEffect(load, [load])` calling setState synchronously in the effect body — fixed by splitting into a pure `fetchGuide` and a separate `retry` event handler) |

**Not verified:** the admin pages in an actual browser, and the mobile screen on an actual
device/emulator — no browser-automation tool was available this session, and the running
Metro/backend were left uninterrupted mid another verification pass rather than
restarting them again for a click-test. Both are exercised solely through their backend
API surface, which is real and confirmed working end to end.
