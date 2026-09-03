# Exam Guide — round 4: on-device verification of round 3 (Phases A–E), two real bugs found and fixed

**Requested:** "launch emulator and check current changes and continue with next task" — round 3
(Phases A–E, see the five `round3-phase-*.md` reports) shipped entirely without ever running on
a device or emulator; every phase report flagged that as the standing gap. This round closes it.

**Environment:** Android emulator `Pixel_7` (`emulator-5554`), a native debug build
(`npx expo run:android`) with Metro running separately, against the local backend
(`mvn spring-boot:run`). Signed in as the existing demo account
(`demo@sarkaritaiyaari.app`) partway through, specifically to exercise sign-in-gated features
(reminders) that a signed-out pass cannot reach.

## What was verified working, as built

- **Home (Phase A):** deadline countdown card ("Notification released in 194 days"), "Explore
  Exams" link, "Focus next" card, "Your readiness" card all render with real data signed in.
- **Exam Guide screen:** demo banner, follow star, status pills, "YOUR PROGRESS" card (real
  practice accuracy + mock history pulled in per Phase A), reminder bell icons on Important
  Dates — confirmed **absent when signed out** and **present when signed in**, exactly matching
  the `{token && ...}` gate in the code.
- **Reminders (Phase D), full round trip:** tapped a bell, picked "1 day before," confirmed via a
  direct `GET /api/reminders` call (with a freshly-minted demo-account token) that the row was
  created with the correct `remindAt` (one day before the target date), then deleted it via
  `DELETE /api/reminders/{id}` to leave the demo account clean.
- **My Exams (Phase B/C):** Following/Recommended/Explore sections all render; search filters
  correctly ("RRB" → RRB NTPC + RRB Group D only); follow and unfollow both round-trip correctly
  (a followed exam moves into "Following" with a filled star and disappears from Explore; unfollow
  reverses it) — confirms the plural `getFollowedExams()`/`unfollowExam()` work added in round 2.
- **Compare Exams (Phase C):** picker modal, side-by-side table, and the "no current cycle" empty
  cell (`—`) all work. Confirmed the accessor function (`row.a`) is a single generic per-row
  formatter applied to each guide independently, not a naming bug — column B genuinely reads
  `guideB` through it, not a copy-pasted column-A path.
- **Eligibility Checker:** date validation (rejects `01011998`, requires `DD/MM/YYYY`), category
  selection, self-declared qualification checkbox, and the real check — age computed correctly
  from a real DOB, correct disclaimer shown.
- **Diagnostic Test (Phase E), full round trip after the fix below:** 15-question set built,
  answered end to end via Previous/Next, Finish produced a results screen with a real overall
  score and a weakest-first per-topic breakdown, and returning to the Exam Guide screen is a
  normal, working navigation (see the note below about the Prepare checklist's own separate gap).

## Bug 1 (found and fixed): `exam-compare.tsx`'s empty-cycle note was missing a negation

`"SSC CHSL has a current recruitment cycle configured yet"` — missing "doesn't", read as the
opposite of what it meant. `mobile/src/app/exam-compare.tsx:129-130`. Fixed to read "doesn't have"
for the single-exam case and kept "has" for the "Neither exam" case (where "Neither" already
carries the negation). Confirmed live via Fast Refresh on the emulator before and after.

## Correction, made the same session: Bug 2 below was originally mis-diagnosed

The paragraphs below were written mid-session and originally concluded this was a **live,
systemic Epic L data bug across all 11 exams**. That conclusion was wrong, and is corrected here
rather than silently rewritten, per this project's own rule about stale claims. What actually
happened:

- The on-device SQLite query that produced the "1 to 4 of top 8 topics have coverage" table was
  run against **this specific test device's local database**, not the live backend.
- A direct check of the same numbers against the **live backend** (`/api/exams/{code}/
  topic-intelligence`, the same `countByTopicForExam` the fix below reads) shows **all 11 exams'
  top-8 priority topics have real, healthy coverage (56–366 questions each)**. There is no live
  coverage/priority mismatch. `PreparePlanService`'s new filter (below) correctly finds nothing to
  exclude on the live data — it is a defensive improvement for a case that isn't currently
  happening, not a fix for one that was.
- The real cause of "Question 1 of 1": **this device's local database is a frozen snapshot from
  before the question pool was lifted (2026-08-27)** — confirmed directly: all 460 locally-synced
  questions have `updated_at` between 2026-08-04 and 2026-08-18, and the live backend has 35,958.
  `sync_meta`'s watermark keeps advancing on every "Sync Now" tap with the local count unchanged,
  which is the expected behavior of a **delta** sync (fetches only rows changed since the
  watermark) running against a device whose *original full sync* happened to complete against the
  small, now-superseded pool and was never redone. Delta sync cannot backfill a gap like this by
  design — only a genuine fresh full sync (new install, or cleared local data) would pull the
  missing ~35,500 rows. This is a property of this one reused emulator's history, not a bug in the
  sync mechanism, the backend, or Epic L's formula.

The two code changes below are kept — skipping a topic with zero available questions is correct
behavior for a diagnostic/checklist regardless of *why* coverage is zero, and they are harmless on
today's live data (the filter has nothing to exclude) — but they should not be read as fixing a
live production bug. The instructive part of this bug is the mis-diagnosis process itself: the
first, cheaper signal (an on-device SQLite query) looked exactly like a systemic backend problem
until checked against the actual source of truth.

## What was originally written here, kept for the record with the correction above applied

Found by simply tapping "Take a Diagnostic Test" for SSC CGL and getting **"Question 1 of 1"**
instead of the expected ~24. Traced with a direct SQLite query against the device's own synced
database (`adb exec-out run-as ... cat .../sarkaritaiyaari.db`, since `run-as ... cat` piped
through a normal shell redirect silently corrupts the binary via CRLF translation — `exec-out`
avoids that):

```
topic_name            final_priority  ssc_cgl_question_count
Blood Relations       91.98           0
Science & Technology  90.0            0
Awards & Honours      90.0            0
Vocabulary            88.54           0
General               88.54           0
Syllogism             87.39           0
Pipes & Cisterns      87.39           1
Sentence Improvement  86.25           0
```

SSC CGL's #1 curated priority topic has **zero** questions tagged to SSC CGL in the synced
database. Widened the check to all 11 exams (their own top-8 priority topics each):

```
exam_code       topics_with_questions / top 8
IBPS_CLERK      1      IBPS_PO   1      LIC_AAO      2
RBI_ASSISTANT   2      RRB_GROUP_D 1    RRB_NTPC     3
SSC_CGL         1      SSC_CHSL  1      SSC_GD       3
SSC_MTS         4      UPSC_CSE  4
```

**Systemic, across every exam** — not an SSC-CGL-specific or session-introduced defect. Root
cause: Epic L's priority formula (`TopicIntelligenceService`) treats question coverage as one
scored *input* among several (weightage, trend, coverage), not a gate — a topic with strong
curated weightage/trend can still rank #1 with zero real question coverage for that exam. This
predates this session (Epic L shipped 2026-08-31) and was invisible until something actually
tried to pull *questions* for the top-priority topics, which nothing did until the Diagnostic Test
(Phase E) and the Prepare checklist (Phase C) existed.

**Confirmed to affect two features, both from round 3:**
1. **Diagnostic Test** (`mobile/src/diagnostic/buildDiagnosticSet.ts`) — took only the top 8
   priority topics and 3 questions each; with 7 of 8 empty, it built a 1-question "diagnostic."
2. **Prepare checklist** (`backend/.../service/PreparePlanService.java`, its own Phase C
   endpoint) — surfaces the same empty topics with "Complete prerequisites first," and its
   "NEXT UP" recommendation (`General`, priority 88.54) also has zero SSC CGL question coverage,
   so the one thing the checklist actively points a user at is a dead end in Practice.

**Fixed both, without touching the priority formula itself** (a bigger, separate decision — see
Not fixed below):

- `buildDiagnosticSet.ts`: widened the candidate pool from the top 8 to the top 30 priority
  topics, queries all of them, and keeps the first 8 (by priority order) that actually returned
  questions. SSC CGL now builds a real 15-question set across 7 topics instead of 1.
- `PreparePlanService.getPreparePlan`: added a `questionRepository.countByTopicForExam(examCode)`
  lookup (a method that already existed, used by `TopicIntelligenceService` as one scoring input)
  and filters the priority list to topics with count > 0 **before** building the checklist —
  mirroring the same "a topic with none contributes nothing either way" reasoning as the mobile
  fix. `PreparePlanAndCareerPostTest`'s existing invariant-based assertions (≤1 recommended,
  priority-descending order) still pass unchanged since they don't depend on exact topic identity.

**Verified:** `npx tsc --noEmit` clean; `mvn -q compile` clean; `PreparePlanAndCareerPostTest`
(5 tests) passes with the filter in place; re-ran the Diagnostic Test live on the emulator after
the mobile fix and got the expected larger, correctly-scored 15-question set with a working
results screen. **The backend dev server serving the emulator during this session was not yet
restarted with the `PreparePlanService` fix** (a concurrent full `mvn test` run was in progress in
the same working directory — this project's own STATUS.md warns against running
`spring-boot:run`/`compile` alongside `mvn test` in the same shell, after an earlier session lost
a test JVM that way) — so the **mobile-side fix (Diagnostic Test) is confirmed live on-device;
the backend-side fix (Prepare checklist) is confirmed only by the unit test and a clean compile**,
not yet re-observed in the running app. Restart the dev server and reload the Exam Guide screen to
confirm the checklist itself updates before treating that half as device-verified.

## Not fixed, flagged for a future session

**Home's "Focus next" card reads the same unfiltered `getPriorityTopics` list** this session did
not touch, so on a device whose local sync is genuinely incomplete (see the correction above), it
can recommend a topic with no locally-available questions and dead-end into Practice's "No
questions yet." **This was reproduced on this device, but the reproduction's real cause is this
device's stale, pre-2026-08-27 local sync, not a live coverage gap** — see the correction above.
The mobile-only fix in `buildDiagnosticSet.ts` and the backend fix in `PreparePlanService` are
worth keeping regardless (a topic with zero *locally or live available* questions should never be
surfaced as practicable, whatever the reason), and applying the same pattern to Home's Focus Next
card would be a reasonable, low-risk follow-up — but it is not fixing an observed live bug, it is
closing a gap the other two features already close.

**A separate, more consequential item worth a future session:** whether other devices (real users)
could be in the same stuck state — an old install whose original full sync completed before
2026-08-27, and has only ever delta-synced since — is a real, unanswered question. Delta sync
cannot backfill it by design (see the correction above). If this is possible for a real user's
device, it silently caps their content forever with no error or indicator, since "Last synced:
Today" is technically true for a delta sync that legitimately found nothing new. Worth deciding
whether the app should ever detect "local count is far below the server's real total" and trigger
a genuine full resync — not attempted this session, since it touches sync correctness for
everyone, not just this one Exam Guide feature.

## Files changed this round

- `mobile/src/app/exam-compare.tsx` (copy fix)
- `mobile/src/diagnostic/buildDiagnosticSet.ts` (candidate-pool widening)
- `backend/src/main/java/com/sarkaritaiyaari/backend/service/PreparePlanService.java`
  (question-coverage filter)

No schema changes, no new endpoints, no admin changes this round.

## Not verified

- The Prepare checklist's corrected output specifically (dev server restart pending, see above).
- Notification History, My Exams' recommendation heuristic's actual scoring logic (only that it
  renders and reflects follow state correctly), and the Home "Focus next" card's now-known
  coverage gap were observed but not further chased this round.
- No low-end or physical device — emulator only, as in every prior session.
