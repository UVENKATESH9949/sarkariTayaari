# Content Model Redesign — Phase 3: Mobile Foundation

**Status:** ✅ done, verified on-device end-to-end against the real Neon-backed backend.
**Scope:** local schema rework to mirror the Phase 1 backend redesign, plus wiring Practice to real synced data. Also closes what remained of Sprint 4's original TICKET-401/402/403/404 — see "Relationship to Sprint 4" below. Synthesized from `offline-exam-app-requirements.md` §5, Phase 3 and "Phase 3 continued" — no report file existed for this phase until now.

---

## The gap

Phase 1 (backend) and Phase 2 (admin) had already moved off the flat `topic`/`exam_type` string model onto real `exams`/`subjects`/`topics` tables. The mobile app's local SQLite schema still had the *old* shape, and — separately — Practice's screens (Subject/Topic/Level/Quiz) were still running entirely on hardcoded mock arrays (`constants/subjects.ts`'s fake counts, a hardcoded `TOPICS_BY_SUBJECT`, and 4 hardcoded questions in `quiz.tsx`), even after sessions and bookmarks had already been wired to real local SQLite. A mock test built on top of that mock content would have been pointless.

## Relationship to Sprint 4

Sprint 4's original tickets (401–405, "Practice Flow") were written before the Content Model Redesign existed, against the old flat model. Phase 3/4 didn't implement them as originally scoped — it replaced the plan:
- **TICKET-401** (a single flat question-list screen, filtered by exam/topic) → **superseded**: replaced by the Subject → Topic → Level drill-down built in Phase 4.
- **TICKET-403** (a separate topic/difficulty filter UI) → **superseded**: each drill-down screen *is* the filter now; there was never a separate filter UI to build.
- **TICKET-402** (quiz/practice screen: show, submit, reveal explanation) → **done**, reached via the new drill-down instead of directly from a flat list.
- **TICKET-404** (store user attempts locally) → **done** — `practice_sessions`/`practice_session_results`.
- **TICKET-405** (offline banner) → done separately, this session — see `reports/06-bookmark-sync-and-offline-indicator/offline-indicator.md`.

## What changed

### Local schema (`mobile/src/db/schema.ts`)
Reworked to mirror the backend exactly: new `exams`/`subjects`/`topics` tables, plus `question_exams` (many-to-many, replacing the old flat `questions.exam_type` string). `questions` now carries `subject_id`/`topic_id` FKs instead of a flat `topic` string.

`sync_meta` collapsed to a single global row (`key: "global"`) — sync is no longer scoped per-exam, so there's exactly one "last synced at" timestamp for the whole app, not one per exam type.

A new local-only `followed_exams` table (exam code + optional target date) was added for a future countdown feature, not wired to any UI at this point.

**Migrations squashed, not incrementally diffed.** The two pre-redesign local migrations were deleted and regenerated as one fresh baseline rather than fighting `drizzle-kit generate`'s interactive rename prompts (it cannot distinguish "renamed column" from "dropped + added column" non-interactively, and the shape changed too much for the distinction to matter anyway). This was judged safe specifically because the local SQLite DB is a synced read cache with no real user data in it yet — the same reasoning would not apply once the app had shipped to real users.

### API layer and sync engine
`api/questions.ts`'s `QuestionResponse` type and `syncQuestions()` updated to the real shape (`subjectId`/`subjectName`/`topicId`/`topicName`/`examCodes`/`premium`, no more `examType` sync parameter). New `api/reference.ts` for `GET /api/exams` / `/api/subjects` / `/api/topics`.

`initialSync.ts`/`deltaSync.ts`/`writeQuestions.ts` reworked: a new `writeReferenceData()` upserts exams/subjects/topics before every sync (small enough dataset that refetch-and-upsert-the-whole-set is simpler than a real delta for this data). `upsertQuestion()` rebuilds each question's `question_exams` rows wholesale (delete-then-reinsert) since the server always sends the full `examCodes` list per question — simpler and just as correct as diffing. `SyncContext.tsx` no longer hardcodes `SSC_CGL`.

### Practice wired to real data (`mobile/src/db/practiceContent.ts`)
New real Drizzle query layer: `getSyncedExams()`, `getSubjectStats()`, `getTopicStats()`, `getDifficultyCounts()`, `getPracticeQuestions()` — all against the local `exams`/`subjects`/`topics`/`questions`/`question_exams`/`question_translations` tables, optionally scoped to one exam or unscoped for "All Government Exams." `getPracticeQuestions()` shuffles via `ORDER BY RANDOM()`.

All five Practice screens rewired to this layer: `practice/index.tsx` lists real synced exams instead of a hardcoded 6-exam grid; `subjects.tsx`/`topics.tsx`/`levels.tsx` show real question counts and disable anything with zero matching questions instead of showing a misleading count; `quiz.tsx` loads real questions with a loading state and a defensive empty state, replacing its 4 hardcoded mock questions entirely.

## Real bugs found and fixed during this work

1. **A duplicate seed question had `correctAnswer` stored as a literal value (`"12"`) instead of a letter (`"A"`–`"D"`)** — a genuine content data-quality inconsistency, not a client bug. Caught by actually playing a session and noticing the correct answer never highlighted green, not by code review. Rather than patch the one row, `getPracticeQuestions()`'s letter→index resolution was made defensive: try the letter mapping first, fall back to matching the value directly against the English options.
2. **A ~59-second first sync**, confirmed via manual `curl` timing (2 rows ≈ 2.9s, scaling roughly linearly) — N+1-style lazy loading of translations/exam-codes per question against the remote Neon DB. Backend-side, not a Phase 3 mobile bug, but surfaced by this verification. Fixed with `hibernate.default_batch_fetch_size: 50` plus a `JOIN FETCH` for `topic`+`subject` on the sync query. Verified: full 112-question sync went from ~59s to ~3.5s (~17x), full backend test suite re-run and passing.

## Verified

On-device, end-to-end, with the backend and Metro both actually running against the real Neon DB (not mocked or type-checked only):
- Cleared storage, confirmed the new squashed baseline migration applied without error.
- A real initial sync correctly wrote all 112 real questions plus real exams/subjects/topics into the new tables and recorded the global `sync_meta` row.
- Relaunched without clearing storage — confirmed it read that row back and skipped straight to Home instead of re-syncing.
- Played a full 9-question real Quiz session, correct/wrong highlighting confirmed against real explanations, genuinely random ordering confirmed across runs.
- **Exam-scoping validated as a side effect of investigating what looked like a second bug**: SSC CGL-scoped browsing showed slightly lower per-subject counts than "All Government Exams" (e.g. Reasoning 20 vs 22). Investigated fully (checked for stale data, duplicate rows, did a clean re-sync) before finding the real explanation: 3 leftover test questions tagged to other exam codes were correctly excluded when scoped, correctly included unscoped — confirming `question_exams` filtering worked exactly as designed, not a bug.

## Honest gaps in verification

- The 2-minute soft-timeout branch of the initial sync (unlock navigation, continue syncing in the background) could not be exercised with the ~112-row dataset available, since it completes in well under a minute. Deferred to a real load test at scale (TICKET-501, still not done as of this writing).
- Real interruption (network drop mid-sync) was not fault-injected during this phase specifically — see `reports/03-sprint-3-sync-engine/delta-sync.md` for that gap's status elsewhere.

## Still outstanding

- Real sub-topics per subject — every subject still had exactly one topic called "General" at the end of this phase (addressed only partially since; still not fully resolved as of `reports/TICKET-STATUS.md`).
