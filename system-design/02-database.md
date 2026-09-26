# 2. What's stored, and where

## Two databases, different jobs

**Server database (Postgres on Neon)** — the real one. Everything an admin types.

**Phone database (SQLite, inside the app)** — a downloaded copy of the content, *plus*
things that only exist on that phone (which questions this student bookmarked, their
past sessions).

**Content** (questions, exams, subjects, structure) only ever travels server → phone.
The phone never edits or sends back anything an admin authored.

**A signed-in student's own activity is different — it travels both ways**, and it's
worth knowing there are two different shapes of that, not one:

- *Practice sessions and mock attempts* are write-once: they're created, uploaded, and
  never edited again. Uploading twice by accident is harmless because the phone's own
  id is reused, so a retry just overwrites the same row.
- *Bookmarks* are not write-once — the same question can be bookmarked and
  un-bookmarked repeatedly, from more than one phone. That needed a real rule for "whose
  change wins," covered below.

---

## The server tables, in four groups

### Group 1: the questions themselves

```
questions                one row per question
  |                      (correct answer, difficulty, which topic)
  |
  +-- question_translations    the actual text, one row per language
  |                            ("What is 5+7?" in English, in Hindi...)
  |
  +-- question_exam_types      which exams this question is used in
```

**Why is the question text in a separate table?**
Because one question exists in several languages. Rather than columns like
`text_english`, `text_hindi`, `text_telugu` (which would need a code change every time
you add a language), each language gets its own row. Adding Telugu is then just data.

English is always required. Other languages are optional per question.

**A question can now have more than one real-world appearance** (TASK-2501, V36):
`question_occurrences` holds "which exam, year, shift, paper" facts that used to be columns
directly on `questions` (still there, unchanged, for backward compatibility — kept in sync
automatically) — so the *same* question appearing in both SSC CGL 2021 and SSC CHSL 2022 is one
`questions` row with two occurrence rows, not two duplicate questions. `question_raw_extractions`
(immutable, straight off a PDF) and `question_candidates` (staged, reviewable — becomes a real
`questions` row only once an admin accepts it) exist for a rule-based PDF-to-question ingestion
pipeline, sharing its document storage with TASK-2401's exam-guidance pipeline rather than a
second copy — see [`../api/QUESTION-INTELLIGENCE.md`](../api/QUESTION-INTELLIGENCE.md).
`questions` also gained a plain `content_status` column (V39, reusing the DRAFT/REVIEW/PUBLISHED
enum V18 introduced for `recruitment_cycles`) — every existing question defaults `PUBLISHED`
(unchanged), and only a question this new pipeline creates ever starts as `DRAFT`.

### Group 2: how content is organised

```
subjects        Quantitative Aptitude, Reasoning, English, General Awareness...
   |
   +-- topics   Percentages, Time & Work, ...  (a topic belongs to one subject)
                     |
                     +-- questions
```

A question sits in exactly **one topic**. A topic sits in exactly **one subject**.

**Subjects and topics are shared by all exams.** There is no "SSC CGL's Quant" and
"IBPS's Quant" — there is one *Quantitative Aptitude*, used by both. About 70% of the
syllabus is the same across these exams, so duplicating it would mean typing every
question several times.

### Group 3: what an exam looks like

This is the part that grew most, so take it slowly. A real government exam is not flat
— it has rounds, papers inside rounds, and sections inside papers.

```
exams                SSC_CGL
  |
  +-- exam_stages         "Tier 1"          (a round: Prelims, Mains, Tier 1...)
        |
        +-- exam_papers        "Tier 1 (CBE)"   (one sitting: 60 min, +2 / -0.5)
              |
              +-- paper_sections    "Quantitative Aptitude"  (25 questions)
                    |
                    +-- section_subjects   which subjects this section pulls from
```

Real example, SSC CGL:

```
SSC_CGL
└── Tier 1                                     (stage)
    └── Tier 1 (Computer Based Examination)    (paper: 60 min, +2 / -0.5)
        ├── General Intelligence and Reasoning   25 Q  -> subject: Reasoning
        ├── General Awareness                    25 Q  -> subject: General Awareness
        ├── Quantitative Aptitude                25 Q  -> subject: Quantitative Aptitude
        └── English Comprehension                25 Q  -> subject: English
```

Notice the section is called *"General Intelligence and Reasoning"* but the subject is
just *"Reasoning"*. The section name is what the real exam calls it; the subject is
where the questions actually live. That's why they're linked rather than being the
same thing.

`exams` also carries a plain `category` column (V22 — SSC/Banking/Railways/UPSC/etc.),
the Exams module's discovery-filter facet. Deliberately not a lookup table like
`difficulty_levels`/`exam_badges` below — a category needs no per-value colour/icon
styling of its own, just a value to filter `GET /api/exams/discover` by.

### Group 4: lookup lists

Small tables that exist so these things aren't hardcoded in the apps:

| Table | Holds | Example |
|---|---|---|
| `languages` | available languages | en, hi |
| `difficulty_levels` | difficulty options + their colour and icon | easy, medium, hard |
| `paper_types` | kinds of paper, and whether a mock test can be made from it | objective (yes), descriptive (no) |
| `exam_subjects` | which subjects an exam covers | see below |

### Group 5: student accounts and their activity

```
users                one row per signed-in student (email, password hash)
  |
  +-- user_tokens             a sign-in session (opaque, revocable — not a JWT)
  |
  +-- user_practice_sessions       + user_practice_session_results
  +-- user_mock_attempts           + user_mock_attempt_results
  +-- user_bookmarks
  +-- followed_exams
  +-- user_topic_progress          per-topic mastery (V14) — was missing from this map
  +-- user_preparation_profiles    what onboarding asked, account-wide (V48)
  +-- study_tasks                  what today's plan assigned (V49; reason column V50)

email_otp_codes       a one-time sign-in code (V51) — BESIDE users, not under it
```

**Corrected 2026-09-21:** this section used to say "accounts are optional — the app works fully
signed out". That is no longer true of the **mobile app**, which since 2026-09-21 requires an
account and shows a sign-in screen before anything else (`api/AUTH.md`). The *backend* is
unchanged: content and sync reads are still public, `web/` still works signed out, and the
signed-out code paths in the app still exist — they are simply unreachable from a fresh install.
Signing in is still what makes activity survive losing the phone.

**`email_otp_codes` (V51) deliberately has no foreign key to `users`.** A code is issued *before*
the account exists on a first-time sign-up, which is the entire point of the flow, so the address
is carried as plain text and normalised the same way `users.email` is. The table stores a BCrypt
hash of the code rather than the code, plus an expiry, a consumed-at stamp and an attempt counter
— and that counter is the only thing making a six-digit code safe. See `api/AUTH.md` for the
transaction subtlety that once silently disabled it.

`user_topic_progress` (V14) is the coarse mastery ladder — NOT_STARTED through MASTERED, plus
NEEDS_REVISION as a regression — and it syncs last-write-wins like `user_bookmarks` rather than
being append-only. It was absent from the tree above until TASK-2801 noticed; the migration list
at the bottom of this file had it all along, which is exactly the kind of drift `AI_RULES.md` §6
asks to be fixed in place.

One more table hangs off `users` as of V24: **`user_topic_health`** (Weakness Radar). It is
unlike everything else in this group, and the difference matters — it holds no student
*input* at all. It is a **derived cache**: one row per (student, topic) holding a computed
health score, a confidence score, a trend and a recommended state, all recalculated from the
practice and mock attempt rows above. Delete the whole table and the next read rebuilds it
identically. That is what makes changing the formula a code change rather than a data
migration (see [`../api/WEAKNESS-RADAR.md`](../api/WEAKNESS-RADAR.md)).

V24 also added a nullable `time_ms` to `user_practice_session_results` and
`user_mock_attempt_results` — how long each question was on screen. **Nothing reads it yet**,
deliberately: a speed signal needs an expected-time benchmark to compare against, and this
database has none. Capture starts now so a later version has history to derive one from.
`NULL` means "not recorded", never zero.

**V47** (TASK-2801) closes two capture gaps on the same tables. `user_practice_sessions` gains
`started_at`, `duration_ms`, `available_count` and `exam_code` — all four were recorded on the
device and never uploaded, so a practice session's real duration was lost on a device change and
no server-side study-time figure was possible (mock attempts have carried the equivalent since
V6). And **both result tables gain a classification snapshot**: `topic_id`, `subject_id`,
`difficulty_code`, `is_pyq`, frozen at upload. Before that, every reader joined `questions` live,
so retagging a question silently rewrote history — a student who answered forty Percentage
questions became one who answered forty Profit & Loss questions, retroactively. `question_id`
stays the canonical reference to the question; these four describe how it was classified at the
time. All nullable, all backfilled once from the current classification, and `NULL` means
"unknown" (its question was hard-deleted) rather than an "Other" bucket.

`user_practice_sessions`/`user_mock_attempts` only ever grow — a session is uploaded
once, finished, never edited. `user_bookmarks` is different: it's the *current state* of
one (student, question) pair, not a log — see "Why bookmark sync needed its own rule"
in [05-why-its-built-this-way.md](05-why-its-built-this-way.md). `followed_exams`
(Exams module, V23) is the same shape as `user_bookmarks` — current state of one
(student, exam) pair, same synthetic `userId:examCode` id, same tombstone-on-unfollow
rule — it replaced what had been a local-SQLite-only "My Exams" list with no backend
table at all.

---

## The two subject links — the confusing bit

There are **two** places that connect subjects to exams. They look similar. They are
not the same, and both are needed.

```
exam_subjects        "SSC CGL covers Quant, Reasoning, English, GA"
                     -> the SYLLABUS. Used when browsing Practice.

section_subjects     "This 25-question section pulls from Reasoning"
                     -> the PAPER LAYOUT. Used when building a mock test.
```

Why both:

- A student browsing Practice for SSC CGL should see its four subjects. That's a
  syllabus question. It should work **even if nobody has written the paper pattern
  yet**.
- A mock test needs finer detail: *this specific section*, 25 questions, from *this*
  subject. That's a layout question.

Before `exam_subjects` existed, browsing had to be worked out from the sections — which
meant an exam with no paper pattern showed **every** subject, including ones it doesn't
cover. SSC CHSL had exactly that problem.

**They can't disagree with each other.** When you save a section, its subjects are
automatically added to the exam's syllabus. So the syllabus is always at least
everything the sections use, and usually the same.

One subject belongs to many exams. Right now:

```
Quantitative Aptitude  ->  SSC_CGL, SSC_CHSL, IBPS_PO
Reasoning              ->  SSC_CGL, SSC_CHSL, IBPS_PO
English                ->  SSC_CGL, SSC_CHSL, IBPS_PO
General Awareness      ->  SSC_CGL, SSC_CHSL
```

---

## The phone's own tables

The phone copies the content tables above, and adds these — which exist **only** on that
phone and are never uploaded:

| Table | Holds |
|---|---|
| `sync_meta` | when this phone last downloaded content |
| `followed_exams` | which exam this student is preparing for |
| `practice_sessions` + `practice_session_results` | past practice sessions, question by question |
| `mock_test_attempts` + `mock_test_attempt_results` | past mock tests, with scores |
| `bookmarks` | questions the student saved |
| `app_preferences` | one row, keyed `"current"`, holding everything that describes this *device* rather than the account: theme/zoom/UI language, which of the followed exams is the **active** one (migration 0026), and the **first-time onboarding profile** — display name, chosen exam, exam stage, target year, preparation level, daily study time, and the two onboarding timestamps (migration 0027). Theme/zoom/language/active exam are device settings and are never cleared on sign-out (see `05-why-its-built-this-way.md`). **The onboarding profile is different since 2026-09-25**: it belongs to the person, is synced to `user_preparation_profiles` (including onboarding completion, V53), and is cleared on sign-out after being pushed, so a second account on the same phone never inherits it (DEF-ONBOARDING-001). Being a single row is what makes "exactly one active exam" and "one profile per device" true by construction rather than by a constraint |
| `radar_cache` | the last Weakness Radar the server sent, one JSON payload per exam, so the radar screens still work offline. Account data, not a device setting — it's cleared on sign-out, unlike `app_preferences` above |

**If the student is signed out, all of this is local-only** — uninstalling the app loses
it, same as day one. **If signed in, it's backed up automatically**: each of these rows
carries an `isSynced` flag, set to false the moment it's created, and flipped to true
once the server has confirmed it. A background flush pushes anything still `false`
whenever the app foregrounds, backgrounds, or the student signs out — the student never
has to do anything for it to happen. Signing into a *new* phone pulls all of it back
down. Verified for real, once, by wiping a test device and confirming history came back
after signing in again.

---

## Changing the database

You never edit tables by hand. You write a **migration** — a `.sql` file that describes
the change — and the backend runs it automatically on startup.

```
backend/src/main/resources/db/migration/
    V1__init_schema.sql                          the original tables
    V2__content_model_redesign.sql               subjects/topics/exams
    V3__exam_structure.sql                        stages/papers/sections
    V4__exam_subjects.sql                         the syllabus link
    V5__users_and_tokens.sql                      accounts and sign-in sessions
    V6__user_progress.sql                         practice sessions and mock attempts
    V7__user_bookmarks.sql                        synced bookmarks
    V8__admin_roles.sql                           users.role (STUDENT/ADMIN) — see ADR-009
    V9__temporary_question_pool.sql               (superseded — full bank now synced, see open-questions.md)
    V10__temporary_question_pool_topup.sql        (superseded, same as above)
    V11__exam_difficulty_and_badge.sql            difficulty/badge fields on exams
    V12__topic_model_for_exam_intelligence.sql    exam_topics, topics.parent_id, topic_prerequisites
    V13__pyq_provenance_and_duplicates.sql        PYQ tagging + fingerprint-based duplicate detection
    V14__user_topic_progress.sql                  per-topic mastery, synced last-write-wins like bookmarks
    V15__topic_trend_and_priority.sql             trend/priority scoring (algorithm-versioned)
    V16__real_pattern_versioning.sql              two versions of an exam pattern can coexist
    V17__exam_guide_phase1.sql                    recruitment_cycles, eligibility, dates, documents, fees
    V18__exam_guide_content_status.sql            DRAFT/REVIEW/PUBLISHED on recruitment_cycles
    V19__exam_career_posts.sql                    exam-scoped (not cycle-scoped) career info
    V20__reminders_and_push_tokens.sql            push_tokens, user_reminders
    V21__exam_guide_overview_text.sql             recruitment_cycles.overview_text
    V22__exam_category.sql                        exams.category — Exams module discovery filter
    V23__followed_exams.sql                       followed_exams — real backend Follow sync
    V24__weakness_radar.sql                       user_topic_health (derived), + per-question time_ms
```

**V25-V35 were missing from this list** (found while adding V36-39 below, not something that
changed just now) — added here rather than left for the next session to rediscover, per
`AI_RULES.md` §6:

```
    V25__multi_type_question_foundation.sql       question_type discriminator, answer_key/content_structure JSONB
    V26__wave_a_option_set_types.sql              MULTIPLE_CHOICE/TRUE_FALSE/ASSERTION_REASON/STATEMENT_COMBINATION
    V27__wave_b_free_input_types.sql               NUMERIC/FILL_BLANK/MATCH/ORDERING
    V28__widen_correct_answer_column.sql          correct_answer VARCHAR(10) -> VARCHAR(500)
    V29__question_groups_and_media.sql            question_groups (shared passages/DI/images), question_media
    V30__ingestion_sources.sql                    ingestion_sources — exam-guidance document discovery (TASK-2401)
    V31__ingestion_notices.sql                    ingestion_notices — discovered notice tracking
    V32__ingestion_documents.sql                  ingestion_documents — sha256-deduped raw PDF storage
    V33__ingestion_extraction_jobs.sql            ingestion_extraction_jobs — per-document processing attempts
    V34__ingestion_extraction_results.sql         ingestion_extraction_results — staged exam-guidance candidates
    V35__ingestion_extraction_result_rejection_reason.sql  reject reason column
    V36__question_occurrences.sql                 question_occurrences — one canonical question, many exam appearances (TASK-2501)
    V37__question_raw_extractions.sql             question_raw_extractions — immutable PDF-to-question extraction output
    V38__question_candidates.sql                  question_candidates — staged, reviewable prospective questions
    V39__questions_content_status.sql             questions.content_status (DRAFT/REVIEW/PUBLISHED, reused from V18)
```

**V40-V46 were missing too** (found while adding V47 below — same kind of drift, fixed in place
per `AI_RULES.md` §6):

```
    V40__ai_admin_configuration.sql               ai_settings, ai_provider_configs (encrypted key), ai_config_audit_log
    V41__ai_content.sql                           ai_content — generated question/topic explanations + review workflow
    V42__ai_task_flags.sql                        ai_task_flags — per-task on/off, read by the client-config endpoint
    V43__session_feedback.sql                     practice-session AI narrative cache
    V44__mock_attempt_feedback.sql                the same for mock attempts
    V45__profile_summary_cache.sql                user_profile_summaries — keyed by a hash of the facts it may cite
    V46__ai_usage_events.sql                      ai_usage_events — one row per AI call, the schema's only event log
    V47__behavioral_capture.sql                   practice-session timing/exam + per-attempt classification snapshot (TASK-2801)
V48__preparation_profile.sql                  user_preparation_profiles — the account-wide copy of what onboarding asked
V49__study_tasks.sql                          study_tasks — what today's plan assigned, the one phase that stores its output
V50__study_task_reason.sql                    study_tasks.reason — why a task was chosen, stored at the moment it was chosen
V51__email_otp.sql                            email_otp_codes — one-time sign-in codes, no FK to users by design
V52__study_task_sources.sql                   study_tasks.source relabel PRACTICE -> NEW_TOPIC (five learning purposes, TASK-3501)
V53__onboarding_completed_at.sql              user_preparation_profiles.onboarding_completed_at — onboarding completion as an account fact, monotonic
```

V8–V24 add whole feature areas ("Epic L" topic intelligence, "Exam Guide", the Exams
module, and Weakness Radar) on top of the four groups above rather than changing them — see
[`../api/EXAM-INTELLIGENCE.md`](../api/EXAM-INTELLIGENCE.md),
[`../api/EXAM-GUIDE.md`](../api/EXAM-GUIDE.md) and
[`../api/WEAKNESS-RADAR.md`](../api/WEAKNESS-RADAR.md) for their endpoints, and the matching
`reports/<NN-topic>/` folder for the full design rationale of each.

Rules: **never edit a migration that has already run** — write a new one. They run in
order, once each, and the backend records which have been applied.

The phone has its own separate migrations under `mobile/src/db/migrations/`, generated
by a tool rather than written by hand.
