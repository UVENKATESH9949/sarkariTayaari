# Mock Test Engine

**Status:** ✅ done, built and verified end-to-end on-device.
**Scope:** un-ticketed full feature build — its own section (§6) in `offline-exam-app-requirements.md`, no TICKET-xxx range assigned. No report file existed for it until now.

---

## The gap

Practice (browse-and-drill, instant feedback, no timer, retry freely) is fundamentally different from what an aspirant is actually training for: a real, timed exam sitting with negative marking and no feedback until the end. Bolting a "mock mode" flag onto Practice would have corrupted both — different enough to warrant its own tab and its own local data model.

## Decisions made (explicit discussion, not assumed defaults)

1. **Question composition: generated on-the-fly**, not curated fixed test sets. Each attempt is assembled at start-time from the locally-synced pool, per-subject counts matching a blueprint. Chosen because it needs zero new content-authoring and works immediately against whatever's synced. Explicitly accepted trade-off: attempts may repeat questions at small question-bank sizes, and two attempts aren't a fixed, comparable paper — no percentile/rank comparison is possible under this model. See `reports/architecture-decisions.md` ADR-008.
2. **Navigation: its own bottom tab**, replacing Revise (which moved to a root-level pushed screen reachable from Home instead, keeping the tab bar at 5 items).
3. **Negative marking included from v1**, not deferred — scored per the exam's blueprint at submission, because this is exactly the realism aspirants are anxious about, and retrofitting scoring semantics later would be a bigger rework than including it from the start.

## What changed

### Blueprint config (`mobile/src/mockTest/blueprints.ts` — since deleted, see Exam Structure Model Phase C)
Hardcoded per-exam pattern (subject-wise counts, duration, marking scheme) keyed by exam code — the same pragmatic "derive in code for now" pattern already used elsewhere at the time. SSC_CGL: 25 Quant + 25 Reasoning + 25 English + 25 GA, 60 min, +2/−0.5.

### Query/data layer (`mobile/src/db/mockTest.ts`)
`getSectionAvailability()` — real achievable counts per section, capped to what's actually synced, shown honestly on the Start screen (e.g. "Only 81 of the usual 100 questions are available today") rather than claiming the full blueprint target. `buildMockTestQuestions()` assembles the shuffled real question set. New local tables `mock_test_attempts`/`mock_test_attempt_results`, kept deliberately **separate** from `practice_sessions`/`practice_session_results` rather than unifying them — a mock attempt needs `durationSeconds`, `timeTakenSeconds`, fractional `marksScored`, `markedForReview`, and a section breakdown, none of which apply to Practice; forcing one shared schema would mean a pile of nullable mock-only columns on every Practice row.

### Four screens (`mobile/src/app/(tabs)/mock-test/`)
Landing (real synced exams with a blueprint), Start (real availability, marking summary, instructions), the timed test-taking screen (countdown with auto-submit, no instant feedback, Mark for Review, a Question Navigator grid modal color-coding answered/marked/current, Previous/Next, Exit/Submit confirmations), Result (real negative-marking arithmetic, correct/wrong/unattempted counts, section breakdown, full per-question review reusing the Revise/Summary expandable-card pattern).

## Real bug found and fixed during this work

**Submitting an attempt took ~7 seconds with no loading indicator**, because `insertMockTestAttempt` awaited one `tx.insert(...)` per question sequentially — 81+ separate round trips for a typical attempt. Looked broken; wasn't (it did eventually complete). Diagnosed the same way as the earlier sync slowdown: temporary logging + `adb logcat`, confirming it resolved rather than hung indefinitely. Fixed by batching into a single `tx.insert(mockTestAttemptResults).values([...])` call, plus adding a real "Submitting your test…" full-screen loading overlay so the (now much shorter) wait is never silent. Re-verified: submit-to-result dropped to ~2–3 seconds.

## Verified

On-device, end-to-end, against the real synced question pool (not the 4 hardcoded mock questions Quiz still used at the time this was built — the sequencing was deliberate: Practice was wired to real data first specifically so Mock Test wouldn't be built on top of the same placeholder content):
- Landing → Start showed real availability (e.g. "81 of 100") matching actual synced per-subject counts.
- A full live timed test: countdown confirmed ticking, answering showed only a neutral "selected" state with zero right/wrong color (correctly different from Practice), Mark for Review persisted through navigation, the Question Navigator grid opened and color-coded correctly, jumping via the grid worked, Submit confirmation showed accurate unanswered/marked counts.
- Result screen: correct negative-marking arithmetic confirmed (e.g. a single wrong answer correctly scored as `-0.5 / 162`), the right question flagged wrong in the per-question review list.

## Honest gaps in verification

- No test exists for what happens if the app is killed mid-test (timer state, in-progress answers) — only the clean Submit path was verified.
- Sectional-only mock tests (timing one subject in isolation) were explicitly discussed and deferred — not built, not tested.
- Cross-user comparison (percentile, rank) was explicitly out of scope for this build (requires accounts, which weren't built yet at the time) and remains unbuilt now that accounts exist — see `reports/open-questions.md`.

## Still outstanding

- Per-section timer enforcement — the total duration is correct and section limits are displayed, but the test runs one overall countdown; true IBPS-style section locking needs section locking + auto-advance and hasn't been built.
- Retaking the *same* generated test to compare scores isn't meaningful under the on-the-fly composition decision (each attempt is freshly generated) — flagged as worth revisiting only if curated fixed sets are ever added.
