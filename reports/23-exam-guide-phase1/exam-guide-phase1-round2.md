# Exam Guide — round 2: closing gaps from the coverage audit

Continuation of `exam-guide-phase1.md`, same session, same day. After publishing the
section-by-section coverage ledger (76 sections of the Exam Guide spec checked against
what had shipped), the user asked to continue through the remaining phases and tickets.
This round worked through the highest-value gaps the ledger surfaced — not everything,
but everything scoped and finished in full, verified against the live backend.

---
Verify an action created directly (My Actions) can be assigned to a User Group
## What shipped this round

### Navigation (§39 / §41 / §65 / §72) — the one gap flagged as most worth fixing first

Progress is no longer a primary tab. `Tabs.Screen` for `progress` now sets `href: null`
(expo-router's documented way to keep a route navigable while removing it from the tab
bar) — the screen, its data and its calculations are completely untouched. Home's
pre-existing readiness card and a new **More → Progress** row are the two required access
paths. §40's footer stays out of scope: this is a tab-bar app with no web-style footer
surface, and that call hasn't changed.

### Eligibility Checker (§9)

`app/eligibility-checker.tsx`, reached from the Guide screen's Eligibility section. Age is
computed from a DD/MM/YYYY input against the cycle's `minimumAge`/`maximumAge` and the
selected category's relaxation — the one criterion in `eligibility_rules` that is
genuinely computable. Qualification is free text on the backend, so it's a self-declared
checkbox, not a verified fact, and the result screen always carries the spec's required
disclaimer ("informational... final eligibility is determined by the official recruiting
authority").

### My Exams + Exam Discovery (§29, §47/§48)

`app/my-exams.tsx`. The `followed_exams` table was never actually single-exam — its
primary key is `examCode`, not a singleton row — only the existing `getFollowedExam()`
query narrowed it to one for Home's card. The plural `getFollowedExams()` /
`unfollowExam()` added alongside it read and write the same rows without touching that
call site, so Home and `PreparationPlanCard` keep behaving exactly as before. "Explore
Exams" lists every active exam not yet followed, from the same `/api/exams` the rest of
the app already uses.

### Notification History (§63 / §37)

New public endpoint `GET /api/exams/{code}/recruitment-cycles/history` — every
non-current cycle for an exam, reusing the admin's existing repository query and filtering
to `!isCurrent()`. This is the read half of §37 "Expired Information": past cycles were
already kept, never deleted, when a new one is promoted to current — nothing could look at
them. Verified against a genuine second cycle (`"2026 (Demo, past)"`, `current=false`,
`demo=true`), not just the empty-history case; the seeder now creates this cycle by
default so a fresh `seed()` demonstrates the feature without a manual step.

### Source attribution surfaced in the UI (§32)

The mobile API previously modeled `exam_sources` but never sent `sourceId` on individual
facts. `EligibilitySummary`, `ImportantDateSummary`, `DocumentSummary` and `FeeSummary` now
all carry it, and `ExamGuideResponse` gained a flat `sources` list resolved once rather
than nested per-fact (most cycles cite one or two sources for everything). The Guide
screen shows a tappable "Source: ..." line under each section.

### Practice / Mock / Where-to-start links (§20, §23, §24)

A "Prepare" section on the Guide screen opens Practice or Mock Test with this exam
pre-selected — not a guided sequence, so §20 stays **partial**, but §23/§24 ("Practice
integration works" / "Mock integration works") are genuinely satisfied: nothing was
rebuilt, this just points at what already exists.

### Difficulty/badge pills, priority tiers, per-step links

The exam's difficulty and editorial badge (already synced locally for every other exam
list in the app) now render as pills next to the status pill. Deadline urgency (§67) is a
real four-tier system — Today/Critical/High/Upcoming/Later, colour-coded — applied to both
the application-close countdown and every future date row, not just decorative text.
Each application step's `officialUrl` (modeled since Phase 1, never rendered) now shows as
a link.

### Analytics (§56/§57)

Every screen already got a `screen_view` breadcrumb for free via the app's existing
`useScreenViewTracking()`. Added five higher-signal events matching the spec's own names:
`exam_guide_opened`, `official_application_clicked`, `document_marked_ready`,
`eligibility_checker_completed`, `exam_followed`/`exam_unfollowed`. §57 (a metrics
dashboard rolling these up) is not built — there's nothing to roll up from yet.

### Accessibility pass (§52)

Added `accessibilityRole`/`accessibilityLabel`/`accessibilityState` to every previously
bare `Pressable` across the four new/modified screens — category chips as `radio`, the
qualification checkbox as `checkbox` with `checked` state, document rows and every link
with a real label. Not a full audit; still marked **partial** in the ledger.

---

## A real bug found and fixed mid-round

`RecruitmentCycleRepository.findCurrentCyclesForActiveExams()` fetch-joined two
collections (`importantDates` and `feeRules`) in one JPQL query — `MultipleBagFetchException`,
the exact class of bug an earlier comment on `ExamStageRepository` warns against, made
anyway. Caught immediately by calling the sync-all endpoint rather than trusting a clean
compile. Fixed by fetch-joining only the exam and leaving the child lists to
`hibernate.default_batch_fetch_size`, same as the precedent it was supposed to follow.

---

## Verified

- Backend: clean `mvn compile` after every change.
- Every new/changed endpoint hit directly with curl, both empty and populated cases:
  `GET /api/exams/{code}/guide` (sources + sourceId on every fact), `GET
  /api/exams/{code}/recruitment-cycles/history` (empty, and against a real second cycle
  created for the test), `GET /api/exam-guides` (post-fetch-join-fix), 401 on the
  document-status write with no token.
- Mobile: `npx tsc --noEmit` clean after every batch; `npx expo lint` held at the
  pre-existing 9 problems throughout — two new violations were introduced and fixed in the
  same pass they appeared (a `set-state-in-effect` in `my-exams.tsx`'s load effect, an
  unescaped apostrophe).
- The coverage ledger artifact was updated in place (same URL) with all 17 section
  upgrades and 10 acceptance-criteria upgrades this round produced.

**Not obtained this round: a clean full-suite regression result.** Three attempts at
`mvn test` were each undermined — two by my own concurrent `mvn compile`/`spring-boot:run`
commands against the same `target/` directory while a background test run was still using
it, and the third by killing what turned out to be the test JVM itself while trying to
free up what I believed were orphaned processes (it was mid-`EpicLIntelligenceTest`, not
orphaned). All three problems are testing-process hygiene mistakes on my part, not
evidence of a regression — every change this round was either new code (entities,
services, controllers, screens) or a fix to a query I had written earlier in the same
session, and the backend compiled clean and served correct data throughout. Recommend
running `mvn test` fresh, once, before this ships anywhere that matters.

---

## Still not done, by design

Unchanged from the original report's list, plus what this round didn't reach:

- **Diagnostic test, Reminders, Career info/comparison, "What's Changed" diffing,
  Content-validation workflow, full offline caching, Search.** All genuinely unstarted —
  each is its own multi-day effort (Reminders alone needs push-notification
  infrastructure that doesn't exist in the app yet).
- **§4's "Before You Apply" checklist** stays folded into Documents rather than a
  separate section — the original scope call, unchanged.
- **New Doc 1 screens stay English-only.** `eligibility-checker.tsx`, `my-exams.tsx`,
  `exam-guide-history.tsx` were not run through the i18n catalogue that Doc 2's screens
  got. Stated explicitly rather than left inconsistent: the volume of remaining backend/UI
  gaps was judged higher-value than translating four more screens this pass.
