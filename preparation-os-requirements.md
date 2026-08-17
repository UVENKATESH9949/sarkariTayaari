# SarkariTaiyaari — "Personal Preparation OS" — Advanced Features Requirements

**Project:** SarkariTaiyaari Mobile (Offline-Sync Edition)
**Doc version:** 1.0 (draft — feasibility/priority not yet decided, see Section 4)
**Companion to:** `offline-exam-app-requirements.md` (the base product — offline sync, content model, Practice, Mock Test, Progress, accounts). This document does not repeat that content; every epic below states what it reuses from it.

---

## 1. Vision

Today the app answers "let me practice some questions." The vision is for it to answer one question every morning:

> **"What exactly should I do today to increase my chances of getting a government job?"**

...and then handle the logistics around that (what to revise, when, how much time it takes, whether the user is even eligible for the exam, when the form closes) — not just serve a question bank. This is a reframe from **test-prep app** to **personal government-job-preparation OS**, built entirely on top of the existing offline-first architecture.

This document takes all 24 ideas raised in discussion, groups them into 11 buildable epics, and phases them so we can decide — later, deliberately, one epic at a time — which are worth building, in what order, and which get simplified, deferred, or dropped.

---

## 2. Design Principles (apply to every epic below)

1. **AI should be invisible.** No "🤖 AI-powered!" badges. The user should feel "this app understands me," not "this app is talking to a chatbot." Coaching copy is written as a human coach would write it — specific and short ("You keep missing ratio questions — let's fix that"), never a generic "Incorrect."
2. **You vs. your past self, not you vs. the leaderboard.** Every comparative stat defaults to a personal trend (this week vs. last week). Rank/percentile is opt-in and secondary, never the first thing shown.
3. **Offline-first extends to every new data type**, not just questions. Anything new — revision schedules, mistake notes, daily missions, current-affairs packs, exam-calendar dates — must survive the existing pattern: synced down in full, cached locally, fully usable offline, written back when connectivity returns. No epic gets to introduce a "requires internet" screen as a first-class experience; a degraded/cached view is the minimum bar.
4. **Reuse the sync/CRUD/admin conventions already in place**, don't invent new ones: server is source of truth for authored content, local SQLite is a read cache + write-back queue, admin gets CRUD before mobile gets a consumer screen, bulk-import for anything content-heavy, `updated_at`-driven delta sync, last-write-wins for mutable per-user state (mirrors `user_bookmarks`).
5. **Every new AI/cloud dependency is a cost line, not just an engineering task.** Flagged explicitly per epic (Section 4) so "is this possible" is answered with real numbers later, not vibes.

---

## 3. What already exists that this builds on

Confirmed from the current codebase, not assumed:

- **Accounts + auth** (`AuthController`, `UserToken`, mobile `authContext.tsx`) — real users, not anonymous devices. Unlocks everything in Epics I/J that needs "this data belongs to a person."
- **Write-back sync pattern**, twice-proven: `UserPracticeSession(Result)` / `UserMockAttempt(Result)` (append-only, push-only) and `UserBookmark` (mutable, tombstoned, last-write-wins on `updated_at`) — every new per-user table below reuses one of these two shapes, not a third.
- **`questions.is_premium`** — reserved, unused column already in the schema. Directly usable as the monetization gate for costlier features (AI Tutor, Question Scanner) without a schema change.
- **Multi-language content model** (`languages`, `question_translations`) — English mandatory, others incremental, already handles per-question bilingual text. Epic K extends this pattern to non-question copy; it does not need to invent multi-language storage from scratch.
- **The exam structure tree** (`exams → exam_stages → exam_papers → paper_sections → subjects/topics`) and `exam_subjects` syllabus mapping — anything that needs "which topics matter for this exam" already has a real answer, no new modeling needed.
- **`practice_sessions`/`practice_session_results` and `mock_test_attempts`/`mock_test_attempt_results`** — the raw signal for weakness detection, mistake books, and the readiness score already exists on-device. Epics A/B/C are primarily *new queries and screens over data already being collected*, not new capture.
- **Admin app CRUD conventions** (list/create/edit/bulk-import, active-only vs. `/all`, image upload via Cloudinary) — every new content type below (current affairs items, exam calendar dates, eligibility criteria) gets the same pattern, not a bespoke one.

---

## 4. Feasibility Legend

Used per-epic below so we can triage later without re-deriving this from scratch.

| Tag | Meaning |
|---|---|
| 🟢 Low | Pure aggregation/UI over data already captured, or a well-known deterministic algorithm. No new third-party service. |
| 🟡 Medium | New local/server schema and a real feature build, but no AI model dependency and no new runtime cost per use. |
| 🟠 High | Needs a new third-party service (LLM, OCR, TTS/STT) with a real per-use or per-month cost, and/or nontrivial ops (content curation pipeline). |
| 🔴 Very High | Needs a production LLM in the interaction loop (conversational, not one-shot), and/or new sensitive-data handling (voice/photo capture) with real privacy review needed. |

---

## 5. Roadmap Overview

| Phase | Epic | Feasibility | Depends on |
|---|---|---|---|
| 1 | A — Weakness Radar & Mistake Book | 🟢 | Existing session/attempt data only |
| 1 | E — 5-Minute Prep Sessions | 🟢 | Existing synced question pool only |
| 2 | B — Intelligent Revision Engine | 🟡 | Epic A (weakness signal), Epic A's mistake notes |
| 3 | C — Preparation Twin & Readiness v2 | 🟡 | Epics A + B; needs one new capture field (time-per-question) added early |
| 4 | D — Daily Mission & AI Coach | 🟡 (v1 rule-based) → 🟠 (v2 LLM copy) | Epics A + B + C all producing real signal |
| 5 | F — PYQ Intelligence & Question DNA | 🟡 (v1 admin-tagged) → 🔴 (v2 ML clustering) | Independent; new question metadata |
| 5 | G — Current Affairs Engine | 🟡 (v1 admin-authored) → 🟠 (v2 AI-assisted drafting) | Independent; new content domain |
| 6 | H — Multimodal Study (Audio / Voice Tutor / Scanner) | 🟠–🔴 | Independent; heaviest infra & cost |
| 7 | I — Motivation & Social | 🟡–🟠 | Accounts (have); Epic D for group "today's mission %" |
| 8 | J — Exam Logistics (Calendar / Eligibility / Application) | 🟡 | Independent; content-ops heavy, not engineering-heavy |
| — | K — Regional-Language Depth | 🟢–🟡 | Ongoing tail work inside every epic above, not a standalone phase |

Phases 1–4 form one coherent line (the "coach" — this is the centerpiece, build it in order). Phases 5–8 are independent tracks that can run in parallel to each other and to 1–4, in whatever order the business prioritizes.

---

## 6. Epic A — Weakness Radar & Mistake Book

**Source ideas:** #3 (Weakness Radar), #12 (Personal Mistake Book)
**Feasibility:** 🟢 Low — this is entirely a new query/aggregation layer plus two screens over data already sitting in `practice_session_results` / `mock_test_attempt_results`. No AI, no new sync category beyond one small mutable table.

### What it is

Instead of "Score: 72/100," show *why* marks were lost: a per-topic mistake breakdown ("Geometry 7, Percentage 5, Grammar 4...") ranked by impact, tapping through to a Learn → Practice → Revision → Mini-test loop for that one topic. Alongside it, a personal mistake book: after any session, the wrong questions land in one place, and the user can attach a short "why I got it wrong" / "correct concept" / "remember this" note. A "My Mistake Test" mode generates a test purely from previously-wrong questions.

### New data model

- Local `mistake_notes` table (question_id, user_note, concept_tag, created_at, updated_at, is_synced) — same mutable/tombstoned/last-write-wins shape as `bookmarks`.
- Server `user_mistake_notes` table, `POST /api/mistake-notes/sync` + `GET /api/mistake-notes` restore, mirroring `BookmarkController`/`BookmarkService` exactly.
- No new question-level capture needed — wrongness is already derivable from `practice_session_results.is_correct` / `mock_test_attempt_results.selected_index != correct_index`.

### Tickets

- **TICKET-1001**: Local query layer `db/weaknessRadar.ts` — aggregate wrong-count and accuracy by topic across all `practice_session_results` + `mock_test_attempt_results`, ranked by marks-lost impact (wrong count, or wrong × marks_wrong when mock-sourced).
- **TICKET-1002**: Weakness Radar screen — ranked topic list ("Your biggest opportunity: Geometry"), tap-through into a topic-scoped loop entry point (routes into existing Practice/Revision flows, no new quiz engine).
- **TICKET-1003**: Home card surfacing the single biggest weakness, matching the existing "Bookmarked / Wrong Answers" summary-card pattern already on Home.
- **TICKET-1004**: `mistake_notes` local table + `db/mistakeNotes.ts` CRUD layer.
- **TICKET-1005**: Backend `user_mistake_notes` table + `MistakeNoteController`/`Service` (`POST /api/mistake-notes/sync`, `GET /api/mistake-notes`), copied from `BookmarkController`/`BookmarkService`.
- **TICKET-1006**: Mistake Book screen — list of wrong questions with the note editor inline, reusing Revise's expandable-card pattern.
- **TICKET-1007**: "My Mistake Test" — generate a Practice-style session sourced entirely from `mistake_notes`/wrong questions instead of the random pool (reuses `getPracticeQuestions()`'s shape, swaps the source query).

**Sprint DoD:** A user can see which topics are costing them the most marks, ranked; can attach a note to any wrong question; can start a test made only of past mistakes; all of it works fully offline and syncs mistake notes across devices like bookmarks already do.

---

## 7. Epic B — Intelligent Revision Engine

**Source ideas:** #4 (spaced-repetition revision loop)
**Feasibility:** 🟡 Medium — a well-known algorithm (Leitner-box style: correct → interval grows, wrong → interval resets), a new schedule table, and a "due today" queue. No AI needed; this is a scheduling problem, not a modeling one.

### What it is

Learn → Practice → Test → detect weakness (Epic A) → **schedule revision** → re-test → long-term retention. A topic (or an individual mistake question) gets a next-due date; getting it right pushes the interval out (tomorrow → 3 days → 7 days → 30 days), getting it wrong resets it to the shortest interval. This turns the app into a memory system, not just a question bank.

### New data model

- Local `revision_schedule` table: `id`, `scope_type` (`topic` | `question`), `scope_id`, `interval_days`, `next_due_at`, `consecutive_correct`, `last_reviewed_at`, `updated_at`, `is_synced` — same mutable/last-write-wins shape as bookmarks/mistake notes, so it restores correctly on a new device.
- Server mirror `user_revision_schedule` + sync endpoints, same pattern as Epic A.

### Tickets

- **TICKET-1101**: `revision_schedule` local table + scheduling algorithm (`db/revisionEngine.ts`): fixed interval ladder (1 / 3 / 7 / 30 days) advancing on correct, resetting on wrong — matches the exact example given in the vision doc, simplest correct implementation before considering a full SM-2 ease-factor model.
- **TICKET-1102**: Hook into session completion — every Practice/Mock answer updates (or creates) the relevant `revision_schedule` row for its topic, and for the specific question if it came from the Mistake Book.
- **TICKET-1103**: "Due for revision today" query + a Revision queue screen — the actual re-test surface, sourced from due `revision_schedule` rows joined back to real synced questions.
- **TICKET-1104**: Backend `user_revision_schedule` sync (`POST /api/revision-schedule/sync`, `GET /api/revision-schedule`) — copy of the Bookmark/Mistake-Note pattern, so a reinstalled app restores exactly where the revision cycle left off.
- **TICKET-1105**: Home surfacing ("2 weak topics due for revision today"), feeding directly into Epic D's Daily Mission once that exists.

**Sprint DoD:** Getting a topic wrong schedules it for re-testing tomorrow; getting it right repeatedly pushes it out to 30 days; the due queue survives reinstall via sync; verified with a real multi-day scenario (can be tested by manipulating device date, same as any spaced-repetition feature).

---

## 8. Epic C — Preparation Twin & Exam Readiness v2

**Source ideas:** #2 (Preparation Twin), #19 ("Am I Ready?"), #20 (Predictive Preparation — trend/plateau detection)
**Feasibility:** 🟡 Medium — mostly aggregation, but needs **one new capture field** (time spent per question) that doesn't exist yet, and the "risk"/"plateau" framing needs a defined (simple, explainable) formula, not a model.

### What it is

The existing Progress tab already computes one number (overall accuracy). This epic turns it into a real multi-dimensional profile — Knowledge / Accuracy / Speed / Consistency / Revision-adherence — per subject, with explicit Strong/Weak/Risk callouts ("Current Affairs forgetting rate is high"), and over time, trend detection ("plateaued around 78–82 for 4 weeks — more mocks won't help, focus on Geometry + speed"). This *is* "Am I Ready?" — same underlying data, richer presentation — so it's built as one epic, not two.

### Why a new capture field is needed now

Speed cannot be computed without knowing how long each question took. Neither `practice_session_results` nor `mock_test_attempt_results` currently stores this. This is the one true prerequisite of this whole epic and should land as early as possible (ideally alongside Epic A/B work) so historical data starts accumulating before the Twin screen is built on top of it.

### New data model

- Add `time_taken_ms` (nullable, for existing-row backfill) to `practice_session_results` and `mock_test_attempt_results` (local + server mirrors).
- No new tables beyond that — Consistency (daily activity) is derivable from existing `completed_at` timestamps; Revision-adherence is derivable from Epic B's `revision_schedule` (on-time vs. overdue reviews).

### Tickets

- **TICKET-1201**: Add `time_taken_ms` to both result tables, mobile + backend, local migration + server migration; Quiz/Mock-Test screens start stamping it per question.
- **TICKET-1202**: Scoring formulas — Knowledge (accuracy on first attempt per topic), Speed (median time-per-question vs. a per-difficulty baseline), Consistency (active days / days since start, rolling 30-day window), Revision-adherence (Epic B reviews done on-time / due) — each formula documented and simple enough to explain to the user in one sentence, per Design Principle 1.
- **TICKET-1203**: Preparation Twin screen — the bar-chart-per-subject view plus Strong/Weak/Risk lists shown in the vision doc, replacing/extending the current single-number readiness card.
- **TICKET-1204**: Risk detection — flag a dimension as "at risk" when it's both weak and trending down over the last 2–3 sessions (simple slope check, not a model).
- **TICKET-1205**: Trend/plateau detection — rolling-window comparison over `mock_test_attempts` scores (needs enough history to be meaningful; gate the UI behind a minimum attempt count so it doesn't show noise as insight from 2 data points).

**Sprint DoD:** Progress shows five real dimensions per subject, not one aggregate number; a user with a genuinely flat mock-score trend sees a plateau callout with a concrete suggested focus area; verified against hand-computed values the same way the original readiness score was ("13 questions across 2 sessions → 77%").

---

## 9. Epic D — Daily Mission & AI Coach

**Source ideas:** #1 (AI Personal Coach), #24 (Daily Mission as the home screen)
**Feasibility:** 🟡 Medium for v1 (rule-based plan generation — genuinely achievable with zero LLM dependency) → 🟠 High for v2 (LLM-authored coaching copy/explanations layered on top). These are treated as one epic because Daily Mission *is* the coach's output surface — there's no separate "coach" to build behind it.

### What it is

On opening the app, instead of a tab bar of destinations, the user sees today's mission: a concrete, time-boxed list (X Quant questions, Y Reasoning, revise 2 weak topics, N current-affairs items, a mini-test) sized to their stated daily availability, regenerated tomorrow based on today's actual performance. This is the front door of the whole "Personal Preparation OS" reframe (Design Principle vision, Section 1).

### Why v1 doesn't need an LLM

The mission is a deterministic allocation problem: available minutes → split across (a) due revisions from Epic B, (b) weak topics from Epic A, (c) fresh syllabus coverage weighted by the exam's blueprint (`paper_sections.question_count` proportions, already real data per Section 7 of the base doc), (d) a current-affairs slice (once Epic G exists) and (e) a short mixed mini-test. This is assemblable today with existing data plus Epics A–C, entirely rule-based. An LLM only enters later, to phrase the daily message ("You keep missing ratio questions — let's fix that today") instead of a templated string — a copy-quality upgrade, not a capability the feature depends on. Ship v1 rule-based; layer v2 LLM copy in only once the plan-generation logic is trusted.

### New data model

- Local + server `user_preparation_profile`: target exam code, available minutes/day, self-reported current level, target date — captured once at onboarding, editable later. (`followed_exams.target_date` already exists locally; this generalizes it into a real onboarding profile.)
- Local `daily_missions` table: date, generated item list (JSON: type, topic/subject ref, count, estimated minutes, done flag), generated_at. One row per calendar day per device; regenerated if missing for "today."

### Tickets

- **TICKET-1301**: Onboarding flow — capture target exam, available time/day, self-rated level, target date into `user_preparation_profile` (local + synced, so it survives reinstall).
- **TICKET-1302**: Mission-generation engine (`mobile/src/coach/dailyMission.ts`) — deterministic allocator described above, capped to the user's stated available minutes, using Epics A/B/C signal where present and falling back to blueprint-proportional fresh coverage where it isn't (new user, day 1, no signal yet).
- **TICKET-1303**: Daily Mission home screen — replaces or fronts the current Home dashboard with the mission checklist + progress bar + "maintain your streak" framing; each item deep-links into the real existing screen that fulfills it (Practice/Quiz for topic drills, Epic B's revision queue, Mock Test for the mini-test).
- **TICKET-1304**: Streak logic — real, derived from consecutive days with a completed mission (the current Home streak is mock; this replaces it with the real thing, feeding Epic C's Consistency dimension too).
- **TICKET-1305**: Regeneration — tomorrow's mission is built from today's actual results (a wrong-heavy topic today gets weighted up tomorrow), not the same static template daily.
- **TICKET-1306 (v2, 🟠, LLM):** Coaching-copy layer — a small backend service (`AiCoachController`) that takes the *already-computed* mission/weakness data (never lets the model invent facts) and returns a short human-toned message. Explicitly scoped to phrasing only, not decision-making, to keep it cheap, fast, and impossible to hallucinate a wrong fact into.

**Sprint DoD:** A user with a stated 1h20m/day budget sees a mission that actually totals ~1h20m, drawn from real weak/due/fresh content in that proportion; completing it advances a real streak; the next day's mission visibly reflects yesterday's mistakes.

---

## 10. Epic E — 5-Minute Prep Sessions

**Source ideas:** #8
**Feasibility:** 🟢 Low — pure client-side query composition against the already-synced pool, no new schema at all.

### Tickets

- **TICKET-1401**: Time-budget picker ("I have 10 / 30 / 120 minutes") on Home or inside Daily Mission.
- **TICKET-1402**: Session composer — given a time budget, mixes current-affairs (once Epic G exists)/Reasoning/Quant/revision items proportionally (reuses the same allocator built for Epic D's mission generator — this is genuinely the same problem at a different entry point, so TICKET-1302's engine should be written generically enough to serve both from day one).
- **TICKET-1403**: A lightweight quiz-runner that accepts a pre-built mixed-subject question list (Quiz today assumes one topic/level; needs to accept an arbitrary ordered list instead).

**Sprint DoD:** Tapping "10 minutes" produces and runs a real mixed-subject session that finishes in roughly that time, without a separate topic/level drill-down.

---

## 11. Epic F — PYQ Intelligence & Question DNA

**Source ideas:** #5
**Feasibility:** 🟡 Medium for v1 (admin-tagged year + manually-grouped concepts) → 🔴 Very High for v2 (automatic clustering of "variations of the same concept" via text embeddings — genuine ML/NLP work, not a CRUD feature).

### What it is (v1, realistic)

Tag each question with its real source: which exam, which year, which paper (a genuine Previous-Year-Question, not an original). Once that exists, trend analysis ("Percentage: 8→11→7→13→12→15→14 questions across 2019–2025, trending up") is a straightforward group-by-year count — no ML required. "Question DNA" — grouping the ~40 questions that are really the same concept in different clothing — is deferred to v2 as an *admin-assigned* `concept_tag` per question (a human decision, cheap and correct) rather than attempting automatic clustering in v1.

### New data model

- `questions.pyq_exam_code` (nullable FK), `questions.pyq_year` (nullable int) — a question is either original content or a tagged PYQ, not a separate table (a PYQ is still a normal question in every other respect: subject, topic, translations, difficulty).
- `question_concepts` table (v1: admin-managed, id + label) + `questions.concept_id` (nullable FK) for the "same concept, different question" grouping.
- v2 only: embedding-based similarity, likely a background job producing *candidate* concept groupings for an admin to confirm — never auto-published without review, to avoid silently mis-grouping unrelated questions.

### Tickets

- **TICKET-1501**: Schema + admin fields — `pyq_exam_code`/`pyq_year` on the question form and bulk-import shape (`examCode`+`year`, optional).
- **TICKET-1502**: `GET /api/questions/pyq-trend?topicId=X` — year-over-year count per topic, backend aggregation.
- **TICKET-1503**: Mobile PYQ Intelligence screen — per-topic trend chart + a plain-language trend callout ("increasingly important in recent papers").
- **TICKET-1504**: `question_concepts` CRUD in admin + `concept_id` tagging on the question form.
- **TICKET-1505**: "Concept view" in Quiz/Revision — when a question has a `concept_id`, offer "see other patterns of this concept" alongside it.
- **TICKET-1506 (v2, 🔴, ML):** Candidate concept-clustering job (embedding similarity over `question_translations.question_text`) surfaced to admins as suggestions, never auto-applied.

**Sprint DoD:** A real subject-matter admin can tag existing questions with year/exam and see a trend chart that matches manually-counted reality; concept grouping works end-to-end for at least one manually-curated concept before any ML work is considered.

---

## 12. Epic G — Current Affairs Engine

**Source ideas:** #6
**Feasibility:** 🟡 Medium for v1 (admin authors current-affairs items and MCQs by hand, same bulk-import pattern as questions) → 🟠 High for v2 (LLM-assisted "news → exam fact → MCQ" drafting, which still needs a human to approve before publish — this is an authoring accelerant, not an autonomous pipeline).

### What it is

Not a raw news feed — a prioritized, exam-relevant digest (🔴 High / 🟡 Medium / ⚪ Low), each item optionally carrying a linked MCQ that flows straight into Revision (Epic B) and Daily Mission (Epic D). This has an unavoidable, ongoing **content-ops cost**: current affairs go stale in days, unlike syllabus content which is written once. That staffing reality is a business decision, not an engineering one, and should be weighed alongside the build cost.

### New data model

- `current_affairs_items` (server + synced): date, headline, summary, priority (`high`/`medium`/`low`), related_subject_id (nullable), source_url (nullable).
- `questions.source_type` (`syllabus` default | `current_affairs`) + `questions.current_affairs_item_id` (nullable FK) — a CA-linked question is still a normal question everywhere else (translations, difficulty, sync), consistent with how PYQs are modeled in Epic F.

### Tickets

- **TICKET-1601**: `current_affairs_items` schema + admin CRUD (list/create/edit, same shape as Exams/Subjects) + bulk-import.
- **TICKET-1602**: Sync — CA items ride the existing reference-data sync pattern (small dataset, refetch-and-upsert like exams/subjects), scoped to a rolling recent window (e.g. last 60 days) rather than syncing the entire historical archive to every device.
- **TICKET-1603**: Mobile Current Affairs screen — priority-grouped list, tap-through to the linked MCQ where one exists.
- **TICKET-1604**: Wire into Epic D's mission allocator and Epic B's revision schedule (a CA MCQ answered wrong should reappear on the same spaced-repetition ladder as any other weak item).
- **TICKET-1605 (v2, 🟠, LLM):** Admin-side "draft an MCQ from this headline" assist button — produces a draft the admin must review/edit/approve before it can be published, never publishes directly.

**Sprint DoD:** An admin can publish a prioritized current-affairs item with an attached MCQ within minutes of a real news event; it appears in the mobile CA list and, once wrong, in the user's revision queue, within one sync cycle.

---

## 13. Epic H — Multimodal Study (Audio Mode, Voice AI Tutor, Question Scanner)

**Source ideas:** #9 (Audio Prep Mode), #10 (Voice AI Tutor), #11 (Question Scanner)
**Feasibility:** split per sub-feature — this is the most infra- and cost-heavy epic, deliberately grouped together so that decision can be made once, holistically, rather than three separate times.

### H1 — Audio Prep Mode 🟠 (Medium engineering, real but bounded per-use cost)

Text-to-speech reading of already-existing question/option/explanation text (`question_translations`) for hands-free "walk mode." No reasoning/generation involved — it's TTS over existing content, so the cost and risk profile is much closer to Medium than the other two, but multi-language voice availability (Hindi, Telugu, Tamil, Kannada, Bengali) is a real, non-uniform constraint per TTS provider and must be checked before committing to "supports all these languages."

- **TICKET-1701**: TTS integration (on-device where the platform provides it, e.g. `expo-speech`, before reaching for a paid cloud TTS API) reading the current question/options aloud.
- **TICKET-1702**: "Walk Mode" screen — large tap targets, voice or simple tap answer, auto-advance, minimal visual reliance.
- **TICKET-1703**: Per-language voice availability check + graceful fallback (read in English if the selected language has no TTS voice) — mirrors the existing "not yet translated, showing English" pattern already built for Quiz's language picker.

### H2 — Voice AI Tutor 🔴 (Very High — conversational LLM, ongoing cost, needs guardrails)

A Socratic tutor ("try step 1 first" rather than dumping the answer), grounded in the question's own `explanation` text so it can't hallucinate a different solution method than the one the app already teaches. This needs a real conversation loop (STT → LLM → TTS or text), per-message cost, and an explicit product decision on how it's gated (behind `is_premium`, a daily message cap, or both) before build, not after.

- **TICKET-1711**: Backend `AiTutorController` — one-turn "explain this step" endpoint first (not a free-form chat), grounded strictly in that question's stored explanation as context, before attempting multi-turn dialogue.
- **TICKET-1712**: Multi-turn Socratic conversation (only after 1711 is trusted) — the "give a hint, not the answer" behavior needs explicit prompt-level guardrails and should be evaluated against a written rubric before shipping, not just spot-checked.
- **TICKET-1713**: Voice input/output wrapper (STT for the question, TTS for the response) — genuinely optional; a text-only tutor delivers most of the value at a fraction of the complexity and should be considered as the actual v1 instead of full voice.
- **TICKET-1714**: Usage gating (`is_premium` and/or a daily cap) — required before public release given per-message cost.

### H3 — Question Scanner 🔴 (Very High — new capture modality + OCR + matching, real privacy surface)

Photograph a question from outside the app (newspaper, coaching material, a Telegram screenshot) and get it solved, matched to similar questions in the bank, or saved into the user's own weak-area tracking.

- **TICKET-1721**: Camera capture screen (`expo-camera`) + on-device OCR where feasible (e.g. ML Kit text recognition) before falling back to a cloud OCR API, to bound per-scan cost.
- **TICKET-1722**: Match-first flow — search the already-synced local question bank for a close text match before ever calling an LLM; only fall back to "solve this fresh" (LLM) when no match exists, since a matched question already has a trusted, human-authored explanation.
- **TICKET-1723**: "Solve fresh" fallback via the same backend tutor service as H2 (reuse, don't duplicate).
- **TICKET-1724**: "Add to my [topic] weakness" action — feeds Epic A's mistake book / Epic B's revision schedule directly.
- **TICKET-1725**: Privacy review — photos may capture more than the question (other students' answer sheets, personal notes); needs an explicit data-retention/deletion policy for scanned images before this ships, not as an afterthought.

**Sprint DoD (whole epic):** Each sub-feature ships independently and is individually gate-able; nothing here is a prerequisite for Epics A–G, so this epic can slip without blocking the coach/revision/content-intelligence line.

---

## 14. Epic I — Motivation & Social

**Source ideas:** #13 (personal-progress-first, leaderboard secondary), #14 (Accountability Partner), #15 (Small Study Groups)
**Feasibility:** 🟡 Medium (personal-progress framing, groups) / 🟠 High (partner matching quality depends on having enough concurrent users targeting the same exam — a cold-start problem worth flagging now).

### What it is

Per Design Principle 2, the *default* comparison is always the user against their own history — this is mostly a presentation decision layered on Epic C's Preparation Twin, not new data. Layered on top: an opt-in Accountability Partner (paired by same target exam + similar level) and small (~5-person) study groups showing daily-mission completion, not a social feed.

### New data model

- `partnerships` (user_id, partner_id, paired_at, status).
- `study_groups`, `study_group_members` (group_id, user_id, joined_at).
- Both read today's-mission-completion-% via Epic D's `daily_missions`, not a duplicate progress model — this is why Epic I is sequenced after Epic D in the roadmap.

### Tickets

- **TICKET-1801**: Personal-trend-first Progress reframe ("Accuracy 61% → 74%, ↑13%" style deltas) as the primary Progress view; this can ship independent of everything else in this epic.
- **TICKET-1802 (opt-in, low priority):** Anonymized leaderboard — opt-in only, never the default landing view.
- **TICKET-1803**: Partner-matching backend (same target exam + similar Preparation-Twin level) + pairing flow; explicitly flag the cold-start risk (needs a critical mass of concurrent users per exam to match well) as a rollout gate, not an engineering unknown.
- **TICKET-1804**: Partner comparison view — "You 72% / Partner 81%" today's-mission completion, sourced from Epic D.
- **TICKET-1805**: Study groups CRUD (create/join/leave, capped at ~5–10 members) + a group dashboard mirroring the vision doc's roster view (✓/○ per member's today's-mission completion).

**Sprint DoD:** Progress leads with a personal trend, not a static number; a paired partner's daily completion is visible without exposing raw scores/rank; a study group of 5 real test users shows accurate daily completion state for each member.

---

## 15. Epic J — Exam Logistics (Calendar, Eligibility, Application Assistant)

**Source ideas:** #16 (Government Exam Calendar), #17 (Eligibility Engine), #18 (Application Assistant)
**Feasibility:** 🟡 Medium technically — straightforward CRUD/rules-evaluation, nothing algorithmically hard — but **content-ops heavy**: eligibility rules, application windows, and document requirements are real-world facts that change per notification and must be kept accurate and current, which is an ongoing curation commitment independent of engineering effort. Flag this honestly before committing, since getting this *wrong* (telling someone they're eligible when they aren't, or missing a deadline) carries real user harm, unlike a wrong quiz answer.

### The model

- `exam_notifications`: exam_code, application_start/end, exam_date, admit_card_expected_date, result_expected_date — admin-curated, extends the existing `followed_exams.target_date` concept into real structured dates per exam.
- `eligibility_criteria`: exam_code, min_age, max_age, category_relaxation (JSON per category), required_education, allowed_categories, state_restrictions (nullable).
- `user_eligibility_profile`: age/DOB, highest education, category, state — captured once, reusable across every eligibility check (not re-entered per exam).
- `application_checklist_items`: exam_code, item label (document/fee/photo-spec/etc.), required flag.
- `user_application_progress`: user_id, exam_code, checklist_item_id, is_done, updated_at — same mutable/synced shape as bookmarks.

### Tickets

- **TICKET-1901**: `exam_notifications` schema + admin CRUD; mobile Exam Calendar screen showing days-until-X per followed exam (extends the existing `followed_exams` countdown groundwork already noted as unbuilt in the base doc).
- **TICKET-1902**: `eligibility_criteria` schema + admin authoring UI per exam.
- **TICKET-1903**: `user_eligibility_profile` capture screen (age, education, category, state) — one-time, editable.
- **TICKET-1904**: Eligibility evaluation ("You are eligible for: SSC CGL, SSC CHSL, ... — ✓ Age ✓ Education ✗ [reason]" style output) — a rules evaluator, not a model; must show *why* for both eligible and ineligible results, not just a yes/no.
- **TICKET-1905**: `application_checklist_items` + `user_application_progress` — a per-exam checklist the user ticks off, admin-authored per notification.
- **TICKET-1906**: "Have you applied?" status tracking + reminders tied into Epic D's mission surface for approaching deadlines.

**Sprint DoD:** A test user's real age/education/category correctly includes and excludes the right exams against real published eligibility rules for at least 3 real exams; a checklist for one real exam notification is fully authorable in admin and checkable on mobile.

---

## 16. Epic K — Regional-Language Depth

**Source ideas:** #23
**Feasibility:** 🟢 Low for what already works (question/option/explanation bilingual display — this is Section 2's multi-language design, already built) → 🟡 Medium for extending the same idea to *non-question* copy (Daily Mission phrasing, coach messages, current-affairs summaries), because that text doesn't live in `question_translations` and needs its own translation-content store.

This is **not a standalone phase** — it's a tail ticket inside whichever epic introduces new user-facing copy:

- **TICKET-2001**: `app_copy_translations` table (string key + language_code + translated text) for static UI/coach copy that isn't a question — same normalized shape as `languages`/`question_translations`, reused rather than reinvented.
- **TICKET-2002**: Apply to Epic D's Daily Mission phrasing once that copy is finalized (translating a moving target is wasted work — do this last within Epic D, not first).
- **TICKET-2003**: Apply to Epic G's current-affairs summaries, same rule — after the English content pipeline is stable.

---

## 17. Open Decisions Requiring a Business/Cost Call (not engineering unknowns)

These aren't blocked on more analysis — they're genuine choices to make before committing budget, listed here so Section 4's feasibility ratings stay tied to something concrete:

1. **LLM provider & budget** for Epics D (v2 copy), H2 (Voice Tutor), F (v2 clustering), G (v2 drafting assist) — needs a per-month ceiling decided before any of these move past v1.
2. **OCR/TTS/STT provider choice** for Epic H — on-device-first (cheaper, more private, works offline) vs. cloud (better accuracy, costs per use, requires connectivity) is a real trade-off per sub-feature, not a default answer.
3. **Monetization tie-in** — `questions.is_premium` already exists unused; Epics H2/H3 (real per-use cost) are the natural first candidates for a premium gate rather than free-for-all.
4. **Content-ops staffing** for Epic G (current affairs, effectively daily) and Epic J (exam notifications, per real-world announcement) — these are recurring people-cost commitments, not one-time builds, and should be sized before the corresponding epic is greenlit.
5. **Privacy review** for Epic H3 (photo capture) and H2 (voice capture) before either collects real user data, even in beta.
6. **Sequencing call**: Phases 1–4 (the coach line: A→B→C→D) are recommended to build in order since each depends on the last producing real signal. Phases 5–8 have no such dependency on each other and can be reordered freely based on which differentiator matters most commercially.
