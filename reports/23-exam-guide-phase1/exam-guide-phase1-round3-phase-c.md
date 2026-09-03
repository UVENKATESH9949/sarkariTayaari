# Exam Guide — closing the coverage ledger, Phase C (roadmap-as-Prepare, career info, comparison, recommendation)

**Requested:** continuation of the coverage-ledger closure (see the Phase A and Phase B
reports in this same folder for the overall plan). This report covers **Phase C**: §22
"Personalized Preparation Roadmap" (built as a Prepare-section enhancement, not a new
module), §25/§26 career info/growth, §27 exam comparison, §28 personalized recommendation.
Backend schema: migration **V19**.

## §22 — Roadmap, built as an enhancement to Prepare, not a new module

The app's own Doc 1 audit (an earlier session) already found the spec assumes a "Roadmap"
module that doesn't exist in this app's navigation (tab bar, no such section). This phase
doesn't reopen that — it extends the decision: the Prepare section on the Guide screen
gained a real ordered study checklist instead of just two static buttons.

**No new tables.** New endpoint `GET /api/exams/{examCode}/prepare-plan`
(`PreparePlanService`, deliberately its own service — it reads Epic L's tables for a
different purpose than `TopicIntelligenceService`, an ordered checklist rather than a
scored dashboard) derives the checklist entirely from data Epic L already computes:
`TopicPriorityRepository.findForExamAndVersion` for ranking (already sorted
`finalPriority desc nulls last`), a new `TopicRepository.findByIdInWithPrerequisites`
query (one fetch-join for the whole checklist, avoiding a 1+N over `Topic.prerequisites`),
and `UserTopicProgressRepository.findAllForUser` for mastery state when signed in. Exactly
one topic is marked `recommended`: the highest-priority one that isn't mastered yet and
whose prerequisites are.

Mobile: `getPreparePlan` added to `api/examGuide.ts`; the Prepare section on
`exam-guide.tsx` now renders up to 5 topics with a mastery icon, a "Next up" badge on the
recommended one, and taps through to Practice scoped to that exact topic. **Deliberately
live-only, not part of the §44 offline cache** — it's per-user and would need the server's
ranking/prerequisite logic duplicated client-side to cache correctly, which isn't worth it
for a cheap-to-refetch "what's next" list.

## §25/§26 — Career information & growth

Genuinely new content — no career/salary data existed anywhere in this schema before this
session (confirmed by grep before writing the migration). New `exam_career_posts` table
(migration V19), **exam-scoped, not recruitment-cycle-scoped**: unlike dates/fees/
eligibility, the posts a passing candidate can be assigned to don't reset every
recruitment round. One exam can have several posts (SSC CGL recruits for multiple at
once). `growth_path` is plain text, matching `qualification`/`special_requirements` on
`eligibility_rules` — a structured stage-by-stage model was considered and deliberately
not built, since it would be new UI/admin-form complexity for what is, in practice, a
short paragraph.

Appended to the existing combined `ExamGuideResponse` (`careerPosts` field) rather than a
new endpoint, per §59's "one combined endpoint" convention already established in Phase 1.
**Known limitation, stated rather than hidden:** because it rides on the cycle-gated guide
response, an exam with no current published cycle shows no career info either — the same
gate everything else on this screen already has, not a new restriction, but worth knowing
before assuming career info is independently browsable.

Admin: full CRUD (`ExamCareerPostRepository`, `ExamGuideService` methods,
`ExamGuideAdminController` endpoints) plus a "Career posts (not tied to a cycle)" section
on `admin/src/pages/ExamGuide.jsx`, rendered independent of which recruitment cycle is
selected. Mobile: `exam-guide.tsx` gained a "Career & Growth" section; offline-cached via
a 9th local table (`exam_guide_career_posts`, added to the same migration `0014` from
Phase B rather than a new migration file, since `0014` had not executed against any real
database yet this session — see the note in Phase B's report on why editing it was safe).

## §27 — Exam comparison

New mobile-only screen `app/exam-compare.tsx`. **Capped at exactly two exams** — a stated
scope decision: a mobile-width side-by-side table stops being readable past two columns,
and a horizontal-scroll table for an 11-exam catalogue is more complexity than this
feature is worth yet. Reads through the same `getExamGuideHybrid` facade Phase B built, so
comparison works offline once both exams are cached. Reached from a new "Compare Exams"
link on My Exams. No new backend endpoint, as planned — pure client-side composition of
data already fetched.

## §28 — Personalized recommendation

A client-side heuristic on My Exams' Explore section, not a new endpoint or ML: urgency
(an open application closing within 45 days, read from the exam's cached Guide) plus
subject overlap with the subjects this device has actually practiced (`getSubjectStats`
against the user's session history). Shows up to 2 discoverable exams as "Recommended for
You" with a plain-language reason ("Application closing soon", "Matches subjects you
practice", or both).

**Honest limitation worth flagging:** with only one exam (SSC_CGL's demo cycle) currently
having real Guide content, the urgency half of this heuristic can't meaningfully
differentiate the other ten exams yet — it will only show real variety once more exams
have published cycles. The subject-overlap half works today regardless.

## Files changed

- Backend: `V19__exam_career_posts.sql` (new); `entity/ExamCareerPost.java` (new);
  `repository/ExamCareerPostRepository.java` (new); `service/PreparePlanService.java`
  (new); `repository/TopicRepository.java`, `dto/ExamGuideAdminDtos.java`,
  `dto/ExamGuideDtos.java`, `service/ExamGuideService.java`,
  `controller/ExamGuideController.java`, `controller/ExamGuideAdminController.java`
  (modified). New tests: `PreparePlanAndCareerPostTest.java`.
- Admin: `src/api.js`, `src/pages/ExamGuide.jsx` (modified).
- Mobile: `db/schema.ts`, `db/migrations/0014_exam_guide_offline_cache.sql` (extended, see
  the note above), `db/examGuideLocal.ts`, `sync/writeQuestions.ts`, `api/examGuide.ts`
  (modified); `app/exam-compare.tsx` (new); `app/exam-guide.tsx`, `app/my-exams.tsx`,
  `app/_layout.tsx` (modified).

## Verified

- Backend: clean `mvn compile`. Every new endpoint hit directly with curl against a real
  running instance with real seeded data: `prepare-plan` for SSC_CGL returns 61 real
  topics correctly ordered by `finalPriority` descending (91.98, 90.00, 90.00, 88.54, ...)
  with **exactly one** `recommended: true` (confirmed by counting occurrences, not just
  eyeballing); a full career-post lifecycle — create via a minted admin token, confirmed
  present in the combined guide response, delete, confirmed gone from the guide again;
  `prepare-plan` on an unknown exam 404s; career-post create with no token 401s.
- Mobile: `npx tsc --noEmit` clean throughout. `npx expo lint` held at the exact
  pre-existing baseline (9 problems) — two `react-hooks/set-state-in-effect` violations
  introduced and fixed the same pass, both with the same established pattern this
  codebase already uses (`PreparationPlanCard`'s keyed-loaded-state shape): once in
  `exam-compare.tsx`'s guide-pair fetch, once in `my-exams.tsx`'s recommendation scoring.
  One legitimate `react-hooks/exhaustive-deps` suppression added with a comment explaining
  why (recomputing recommendations on every practice-session update would be wasteful for
  a "nice to have" nudge).
- Admin: `npm run build` clean; `oxlint` unchanged (one pre-existing, unrelated warning).
- **Full backend regression suite** re-run after this phase's changes — see
  `memory/STATUS.md` for the exact count; kept at 0 failures throughout.

## Not verified

- **Still no on-device/emulator run.** The Prepare checklist, Career & Growth section,
  exam-compare screen, and My Exams' recommendation section are all new UI reasoned
  through static analysis and live backend curl checks, not an actual app launch — same
  standing gap as Phases A and B, and the same one that mattered most when it turned out
  to matter (the `/api` prefix bug from Phase B).
- `exam-compare.tsx`'s two-exam picker modal has not been exercised in a real UI
  interaction (tap-to-open, tap-to-select) — only read for correctness.
- The recommendation heuristic's real-world usefulness is unverified beyond the single
  seeded demo exam — there's no way to observe it differentiating between multiple exams
  with real Guide content until more exist.
- Local migration `0014`'s extended form (now including `exam_guide_career_posts`) has
  still never executed against a real SQLite database, populated or otherwise.

## Next

Phase D (§8 Reminders / push notifications — new mobile capability, backend `push_tokens`/
`user_reminders` tables, migration V20) and Phase E (§21 diagnostic test, migration V21) —
continuing per the approved plan, pending a check-in on Phase D specifically given it adds
a new user-facing permission prompt and outbound network dependency.
