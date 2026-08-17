# Content Model Redesign — Phase 4: Mobile Screens

**Status:** ✅ done — all 11 screens built and verified on-device.
**Scope:** the actual navigable app: Home, Practice landing, Subject/Topic/Level lists, Quiz, Session Summary/History, Progress, Revise, More. Synthesized from `offline-exam-app-requirements.md` §5, Phase 4 — built page-by-page (mock UI first, then real wiring, per an explicit request to design and see each page individually rather than all at once) — no report file existed for this phase until now.

---

## The gap

Phase 3 gave the app real synced data to read from. Phase 4 is where that data actually became a usable app — before this, most screens were placeholders or mock-data mockups.

## What was built, screen by screen

- **Navigation shell** — 5-tab bottom bar: Home, Practice, Progress, Revise, More. (Revise was later moved off the tab bar entirely — see the Mock Test report for that change.) Search deliberately has no tab of its own — a search icon inside Practice instead.
- **Home** — dashboard: streak, followed-exam summary, "Continue Practice" CTA, readiness-score teaser. All mock data at this point (the streak is *still* mock as of this writing — see `system-design/`'s known-imperfect list).
- **Practice (landing)** — a persistent search bar (initially decorative — no filtering logic — fixed properly much later, this session, see `reports/TICKET-STATUS.md`), an "All Government Exams" card, and an exam grid.
- **Subject list** — reached by real navigation. Same 6 subjects shown regardless of which exam was tapped, which is correct behavior (subjects are genuinely shared, not per-exam) rather than a shortcut. Icon/color/stats extracted to `mobile/src/constants/subjects.ts`, shared with Topics.
- **Topic list** — same pattern one level deeper, with a real working search (a subject can hold many sub-topics, e.g. 9 for Quantitative Aptitude in the mock set used at the time).
- **Level list** — added an explicit **"All Levels"** card at the top (mixed-difficulty) alongside Easy/Medium/Hard, specifically because showing only three tiers with no combined option risked feeling like a dead end. Counts derived from the topic's total so "All Levels" always sums exactly to the three below it.
- **Quiz** — the core screen. Deliberately built around real Indian government-exam-aspirant behavior rather than generic quiz-app defaults:
  - A language dropdown with search (not just an EN/HI toggle), since more languages get added over time.
  - Instant feedback on tapping an option (correct/wrong colored immediately, explanation revealed) — practice mode, not exam mode.
  - Bookmark and report-an-issue icons, per-question state.
  - Progress bar, "Question X of N," last question's button becomes "Finish."
- **Session History + Session Summary** — added as an explicit extension beyond the original plan, because Practice pulls random questions each time, so a past session's exact question set is otherwise unrecoverable once it ends. `SessionHistoryProvider` (in-memory at this point, capped at 50 sessions) records score, per-question right/wrong, and full context on every Finish. Summary shows a score circle + color-coded accuracy + full question-by-question review; History shows a PhonePe-transaction-style list (score badge, colored-dot pattern per question, relative time).
- **Progress** — real computed stats from `useSessionHistory()` even at this point (no mock numbers): an Exam Readiness Score (overall accuracy — the simplest correct formula, with recency/subject-weighting explicitly deferred), attempted/completed counters, subject-wise breakdown.
- **Revise** — segmented Bookmarked/Wrong Answers view. Wrong Answers is derived, not separately stored: iterates sessions most-recent-first and takes the first occurrence of each wrong question id, so retrying a question later doesn't create duplicate revision entries.
- **More** — language preference, a "Clear practice history" action (gated behind a native destructive confirm dialog), static About info.

## Real bugs found and fixed during this work

None specific to Phase 4 itself are documented beyond what Phase 3's report already covers (the malformed `correctAnswer` row, the sync performance issue) — those were surfaced through Phase 4's screens but are backend/Phase-3-layer issues, not Phase-4 UI bugs.

## Verified

Each screen was verified individually as it was built, on-device:
- Home: both CTAs navigate correctly, tab-bar active-state highlighting confirmed for all 5 tabs.
- Practice → Subject → Topic → Level → Quiz: full drill-down navigation confirmed at each step, live search filtering confirmed (e.g. typing "time" correctly narrowed to 2 matching topics), Level's arithmetic confirmed (4+3+1=8 for Percentages), singular/plural question-count grammar confirmed.
- Quiz: wrong/correct coloring, bookmark/report toggling resetting correctly per question, progress bar advancing, language dropdown search filtering, real Hindi (Devanagari) rendering, the untranslated-language English fallback, and the full Finish → session-complete flow.
- Session History/Summary: played a real 4-question session with a deliberate mix of right/wrong answers; confirmed Summary's score/color/list exactly matched what was actually answered, and History showed it correctly above 2 seeded mock sessions.
- Progress: verified against real recorded sessions (13 questions across 2 sessions → 77% readiness, Quant 80%, Reasoning 75% — matching hand-computed expected values exactly), and again after clearing history (correctly reset to 0/0/0%).
- Revise: bookmarking a question while it was displayed in Hindi correctly appeared in Revise with the Hindi text preserved (proving the snapshot-based bookmark approach worked across languages); wrong-answer dedup verified against 2 seeded sessions produced exactly 3 entries, matching a hand count.
- More: language picker selection persisted and changed Quiz's actual starting language on the next session (not just cosmetic); clear-history confirm correctly zeroed Progress while leaving Bookmarks untouched, per the dialog's own promise.

## Honest gaps in verification

- At the time Phase 4 shipped, all of this ran on **mock/in-memory data** for sessions and bookmarks — real SQLite persistence for those didn't land until the tail end of Phase 3 ("Phase 3 continued," see that report). So Phase 4's own on-device verification, described above, was against mock data; the *persistence* of that same behavior was verified separately.
- No accessibility review was performed on any of these screens.

## Still outstanding

- Streak on Home is still mock, not derived from real activity (later addressed conceptually by Future Vision Epic D's mission-completion streak, not yet built).
- A dedicated Review screen (deeper than Summary's list) was considered and explicitly deferred — Revise's expandable cards were judged to cover most of that need.
