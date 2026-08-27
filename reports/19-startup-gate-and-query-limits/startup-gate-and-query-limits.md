# Startup Gate Rework and Query Limits (Phase 1 of §9)

**Closes:** the user's explicit instruction of 2026-08-27 — "we should not wait user to watch home screen... keep animation video. but within 5 sec home page should visible... loading should increase gradually... but background work implement correctly as per new requirements." Implements Phase 1 of `offline-exam-app-requirements.md` §9.6, which is the prerequisite for lifting the temporary question pool.

Expands beyond the literal wording in one place, deliberately: the instruction was about perceived startup speed, but the same gate contained a lockout bug that made an offline first launch unusable. Both are fixed by the same change, so they shipped together rather than the bug being left for later.

## What existed before

Confirmed by a full read of the startup path, not assumed.

- `FirstLaunchGate` in `mobile/src/app/_layout.tsx` rendered `PreparingApp` instead of the navigator while `SyncContext.firstLaunchSyncActive` was true. First launch only — a returning device (`sync_meta.last_synced_at` present) was never gated.
- The gate's release condition was `p.status === "completed" || p.status === "partial"`. `"completed"` is only emitted after **every page of the question bank** is written. So the gate waited on the full question sync, not on anything the home screen actually needs.
- **A real lockout bug.** On a first launch with no network: the initial-sync branch never checked connectivity (unlike `refresh()`, which returns early when offline); `runInitialSyncUntilDone` retries forever; and its wrapper rewrites every `"error"` into a `"syncing"` tick. `"syncing"` never satisfies the release condition, so `firstLaunchSyncActive` stayed true indefinitely — `PreparingApp` at 0% forever, no way into the app and no way to reach More's Retry. The 2-minute soft timeout could not rescue it: `deadline` is recomputed on every retry attempt, and its `!result.last` guard is dead code while the bank fits in one page.
- `PreparingApp`'s bar used measured `synced / total`. With the question bank fitting in a single page that goes 0 → 100 in one step, so there was nothing gradual to show.
- `SyncContext`'s own header comment claimed "neither one blocks navigation — the app is usable immediately on every launch, including the very first one." True after `c1ca170`, false since `FirstLaunchGate` was reintroduced in `4f51124`. Never updated.
- `getPracticeQuestions` (`mobile/src/db/practiceContent.ts`) had **no `LIMIT`** — `ORDER BY RANDOM()` over every match, then an `inArray` binding one parameter per matched question. The live path capped at 200; the local path did not.
- Practice quiz's "Finish" button had neither `loading` nor `disabled`, and `addSession` is fire-and-forget with a `session-${Date.now()}` id.

## What was built

### The gate now waits on reference data, not questions

`mobile/src/sync/initialSync.ts` — added `SyncPhase = "reference" | "questions"` and a `phase` field on `SyncProgress`. `runInitialSync` emits `phase: "reference"` before writing reference data and `phase: "questions"` immediately after, which is the new release signal. `runInitialSyncUntilDone`'s error rewrite now carries `lastPhase` forward, so a failure during the question phase doesn't look like a regression to the reference phase.

Why this is the substantive fix: the app shell renders from exams/subjects/topics/levels — 8 small requests. Questions are only needed once a quiz opens, and `useHybridMode()` already serves those live until the local copy lands.

### A hard 5-second ceiling

`mobile/src/sync/SyncContext.tsx` — `GATE_MAX_MS = 5000`, enforced by a `setTimeout` held in a ref, cleared by whichever release condition wins and by effect cleanup. Deliberately not conditional on sync state, which is the entire point: it cannot be extended by a slow network, a Cloud Run cold start, or a failing request.

Three release conditions, first one wins: reference data written, sync finished, or the ceiling. Normal path is the first — the ceiling is a safety net.

This **fixes the lockout by construction.** An offline first launch now releases at 5s into an app whose hybrid layer resolves to `"unavailable"`, which is what makes `OfflineNoDataNotice` reachable on a cold first launch for the first time.

### A smooth, monotonic bar that doesn't fabricate counts

`SyncContext` publishes `firstLaunchStartedAt` and `firstLaunchMaxMs`. `mobile/src/ui/PreparingApp.tsx` ticks every 200ms and shows `max(realPercent, timeFloor)`, where `timeFloor` climbs to **95%** — not 100 — over the gate's ceiling. `mobile/src/ui/LoadingMark.tsx` eases each new value over 240ms with linear timing on the UI thread, so consecutive ticks blend into one continuous slide.

Three deliberate constraints:

- **Capped at 95% pre-release.** The bar must not claim completion while the gate is still up.
- **`max()`, not a pure timer.** A genuinely fast launch shows fast progress rather than being held back to match a clock.
- **No synthetic question count.** A time-smoothed bar shows a percentage only. Measured `synced / total` figures stay on the More screen where they are real. This is the line between smoothing a coarse signal and inventing data.

### Query and interaction fixes

- `mobile/src/db/practiceContent.ts` — new exported `PRACTICE_QUESTION_LIMIT = 200`, applied via `.limit()` to both branches of `getPracticeQuestions`. `mobile/src/data/practiceData.ts` now imports the same constant instead of its own literal `200`, so local and live cannot drift apart again.
- `mobile/src/app/(tabs)/practice/quiz.tsx` — added `finishedRef` (a ref, because state hasn't re-rendered when a second tap lands) plus `finishing` state wired to the Button's existing `disabled`/`loading` convention. Same shape as `mock-test/test.tsx`'s `submittedRef`.
- `SyncContext`'s stale header comment rewritten to describe what the code now actually does, including why the ceiling exists.

## Real bugs found and fixed

**The offline first-launch lockout.** Found by reading the startup path during the §9 audit, **not** by reproducing it — see Honest gaps. Root cause was the three-part interaction described under "What existed before": no connectivity check on the initial-sync branch, indefinite retry, and an error-to-`"syncing"` rewrite that could never satisfy the release condition. Fixed structurally by the ceiling rather than by adding an offline check, so no future change to the retry or error-reporting logic can reintroduce it.

**The unbounded practice query.** Found in the same audit. A latent crash, not a slow query — `inArray` binds one parameter per matched question, so a topic exceeding SQLite's `SQLITE_MAX_VARIABLE_NUMBER` (999 on older builds) would fail outright. Masked entirely by the temporary ~500-question pool; lifting that pool, which is the next planned step, would have exposed it immediately. This is why §9.4 sequences the pool lift after this fix.

**The duplicate-session race on quiz Finish.** Found in the same audit. Two taps a millisecond apart wrote two real sessions; two inside the same millisecond collided on the primary key and one was lost silently into `addSession`'s `.catch`.

## Verified

Static checks:

- `npx tsc --noEmit` — clean.
- `npx expo lint` — 11 problems (9 errors, 2 warnings), **identical to the pre-existing baseline**. The two effect-based additions (the `PreparingApp` ticker, the `LoadingMark` easing) both pass the React Compiler rules this project's lint config enforces strictly.

On-device, on a fresh `Pixel_7` AVD, against the local backend. Every `adb` call was pinned with `-s emulator-5554` because the user's real phone was also attached for unrelated work and must not be touched. Each scenario started from a genuine first launch (`adb shell pm clear host.exp.exponent`).

**1. Online first launch — gate releases on reference data, questions continue behind it.** Exact log sequence:

```
[cache] cold — first-ever launch, preparation gate active
[sync] initial sync started
[sync] reference data ready (languages, exams, subjects, topics, structures)
[cache] preparation gate released (reference data ready)
[sync] page 0 written (460/460 questions)
[sync] initial sync completed (460/460 questions)
```

The release happens **before** any question page is written, and the question page lands **after** the gate is down — which is the whole point of the change. The release reason is `reference data ready`, not `5s ceiling`, which proves reference data completed inside 5000ms (the ceiling would otherwise have won and said so).

**2. Offline first launch — the lockout is gone.** With the emulator in airplane mode (`dumpsys connectivity` → `Active default network: none`), the sync failed and entered its retry loop exactly as the bug description predicted:

```
[cache] cold — first-ever launch, preparation gate active
[sync] initial sync started
[sync] initial sync failed, will retry Could not reach the server...
WARN Initial sync attempt 1 failed, retrying in 2000ms
WARN Initial sync attempt 2 failed, retrying in 4000ms
[cache] preparation gate released (5s ceiling)          ← released anyway
WARN Initial sync attempt 3 failed, retrying in 8000ms
```

The ceiling fired while the sync was still failing, and the app became usable. **Practice then rendered `OfflineNoDataNotice`** ("You're offline and this content hasn't downloaded yet. Connect to the internet once to download it — after that, everything works offline."). That state was previously unreachable on a cold first launch, which is the clearest confirmation that the lockout was real and is now fixed.

**3. Quiz completes with the `LIMIT` applied.** A 9-question Easy session on SSC CGL → Quantitative Aptitude → General ran end to end and produced a correct Session Summary (1/9, 11% accuracy, correct per-question breakdown, `Time taken: 3m 8s`).

**4. Duplicate-session guard holds.** Three taps on **Finish** issued inside a single `adb shell` invocation (to minimise inter-tap latency) produced exactly **one** session: Progress showed `1 session logged · last active today`, `9 Questions attempted`, `1 Sessions completed`.

**5. The repeated-release sloppiness was found and fixed during this testing** — see below.

**Also confirmed incidentally**, and worth recording because it was previously unverified: the exam difficulty/badge feature from commit `eac8f32` works end to end on-device. SSC CGL rendered a **POPULAR** badge, a **"Medium level"** stat pill carrying `difficulty_levels`' own synced speedometer icon, and an **admin-uploaded image** in its icon box (the `imageUrl` render path that no screen had ever read). SSC CHSL, which has neither set, correctly rendered one pill and no badge — nothing fabricated.

## Phase 2, 3 and 5 (added later the same session)

Implemented after the user confirmed Phase 1 working on the emulator. Same `-s emulator-5554` discipline throughout.

**Phase 2 — startup and query cost.**

- `loadSessions()` (`db/practiceSessions.ts`) collapsed from 1 + N sequentially-awaited queries to **two**, with results grouped through a `Map` rather than a `.filter()` per session. `MAX_SESSIONS` is now applied as an actual `LIMIT` — it had been declared and never used. This runs at app startup for every user via `SessionHistoryProvider`, above the whole tab tree, so it was on the critical path.
- New migration `0011_worthless_mandrill.sql`: composite `questions(topic_id, difficulty, is_deleted)` and `questions(subject_id, is_deleted)` (every questions query also filters `is_deleted`, which the pre-existing single-column indexes left to a scan); `mock_test_attempts(exam_code)` (a full scan *per exam* on the Mock Test tab); `bookmarks(is_deleted, is_synced)` + `bookmarks(is_synced)`; `subjects(name)`. Dropped `idx_question_translations_question_id` — a strict prefix of the composite unique index, so unreachable, and pure write amplification on the hottest sync path.

**Phase 3 — virtualization.** `revise.tsx`, `practice/summary.tsx` and `mock-test/result.tsx` converted from `ScrollView` + `.map()` to `FlatList`, with surrounding chrome moved into `ListHeaderComponent`/`ListFooterComponent`. These were the only three lists that actually grow: Revise is unbounded in both tabs, Summary is one card per question (up to `PRACTICE_QUESTION_LIMIT`), Result carries ~80–100 expandable cards. `result.tsx`'s card was extracted into a `QuestionResultCard` component so `renderItem` stays small. **`FadeInItem` needed no rework** — grep confirmed it appears only in the short, deliberately non-virtualized lists, never inside a `FlatList`.

**Phase 5 — bulk writes.** `writeLanguages` and `writeReferenceData`'s exams/subjects/topics loops converted to single bulk upserts using `excluded.*`; `deleteQuestionLocally` became `deleteQuestionsLocally(tx, ids[])` — three statements regardless of batch size, where a 500-row page of tombstones previously issued 1,500 sequential statements inside one transaction. `insertSession`'s per-result inserts and its prune loop are likewise now one statement each.

### Verified on-device (Phases 2/3/5)

After a full `pm clear`, all **12 migrations applied cleanly from scratch** and the app reached the sync gate, which is the migration path's real test. Then:

- 9-question quiz completed; **Summary** rendered correctly through the new `FlatList` (score circle, stats row, time taken, section label, cards) and scrolled end to end — `QUESTION 9` plus both footer buttons reachable.
- **Revise / Wrong Answers** rendered all 8 wrong answers with correct card spacing; tapping a card expanded it with options and the `EXPLANATION` panel intact.
- **Revise / Bookmarked** rendered `ListEmptyComponent` ("No bookmarks yet").
- `tsc` clean, lint at the 11-problem baseline, zero `SyntaxError` or key warnings in the Metro log for the run.

## Phase 4 — Mock Test data-layer facade (added later the same session)

New `data/mockTestAccess.ts`, the exact counterpart of `practiceData.ts` and the module that was missing. All four Mock Test screens previously carried the source decision inline:

```ts
const papers = mode === "local" ? await getMockablePapers(code) : await getMockablePapersLive(code);
```

so every one of them imported both a SQLite module and an HTTP module and knew the names of both. Practice never did that. The facade now owns `getMockablePapers`, `getPaperById`, `getSectionAvailability` and `buildMockTestQuestions`, each taking `mode`, and the four screens just call them.

The `db/` imports that remain in those screens (`getMockAttemptSummary`, `getMockTestAttempt`, `insertMockTestAttempt`, `getAllSubjects`) are deliberate: that is local-only, user-owned data with no live counterpart, so it correctly reads from SQLite regardless of mode.

**`resetStructureCache` was dead code and is now live.** Its own doc comment said to call it "when sync completes or connectivity changes" and **nothing ever did**, so the module-level live-structure cache was never invalidated for the whole process lifetime. Rather than delete it (keeping the latent staleness) or leave it unused, the facade now routes every structure read through a new `noteHybridMode(mode)` that drops the snapshot when the mode changes. **Partial by design and documented as such:** `practiceData.ts`'s `getSyllabusSubjectIdsLive` reads the same cache without going through the facade, so a mode flip triggered only by a Practice-screen read still won't invalidate it.

### Verified on-device (Phase 4) — including the screen that was previously unexercised

Full Mock Test flow driven end to end, all through the new facade:

- **Exam list** → "1 full test" per card (`getMockablePapers`).
- **Papers screen** → Tier 1, 100 Questions, 60 Minutes, +2/-0.5 marking.
- **Start screen** → duration/questions/marking plus the honest "Only 25 of the usual 100 questions are available today" degradation (`getPaperById` + `getSectionAvailability`).
- **Test running** → "Question 1 of 25", live timer (`buildMockTestQuestions`).
- **Submitted** → confirmation dialog, then the Result screen: `0 / 50 marks scored`, 25 unattempted, section-wise breakdown.
- **`mock-test/result.tsx` virtualization confirmed** — this closes the gap left by Phase 3. All 25 cards render (verified cards 1, 20–23 and 25 by scrolling) and the `Back to Mock Test` footer is reachable.

A delta sync also ran during this pass and completed cleanly (`0 upserted, 0 deleted`), which incidentally exercised Phase 5's new bulk `excluded.*` upserts in `writeReferenceData`.

## Phase 6 — the question pool lifted (added later the same session)

`app.question-pool.temporary-enabled` → `false`. The full **37,884-question** bank is now served and synced.

**The requested interim measure was not built, because measurement showed it wasn't needed.** The instruction was to lift the pool *and* "assign same questions for any query" so no screen appeared disabled for lack of content. Before touching any query, the actual coverage was measured with the pool off:

| | With pool (~500) | Pool lifted (37,884) |
|---|---|---|
| Topics with questions | a small fraction | **107 of 108** (151–458 each) |
| Per-exam counts | 46–196 | 3,392–12,203 |
| Per-difficulty | — | ~12k each (easy/medium/hard) |

The one topic with no questions is `Automated Test Subject / Automated Test Topic` — a leftover test fixture already recorded in `memory/STATUS.md` as harmless, not real content.

So the pool restriction was the *entire* cause of the empty screens. Making queries ignore their scoping would have been unnecessary, would have silently invalidated the syllabus scoping shipped in Section 7 Phase C, and would have masked real content gaps behind "everything always returns something". Nothing was faked and no query stopped honouring its scope.

### Verified on-device (Phase 6)

Re-measured after the lift, as §9 requires:

- A full sync is **76 pages** at `PAGE_SIZE = 500`; one page costs **~2.7s** server-side, so ≈**203s of server time alone** — consistent with the ~236s recorded in `reports/12-load-test-data-seeding/` at this scale.
- **That cost is now invisible to the user, which is the whole point of Phase 1.** On a fresh install (`pm clear`), the log shows the gate releasing *before any question page exists*:
  ```
  [cache] cold — first-ever launch, preparation gate active
  [sync] initial sync started
  [sync] reference data ready (...)
  [cache] preparation gate released (reference data ready)   ← 37,884 questions still to come
  ```
- Practice → SSC CGL → Quantitative Aptitude was navigated normally **while pages 5–23 were still downloading**, and showed real per-topic counts ("28 topics under Quantitative Aptitude", General 136, Number System 128) where nearly all of those previously read "No questions yet".
- The sync ran to completion: `initial sync completed (37884/37884 questions)`.
- Exam cards then showed the real bank ("10,174 questions", "10,091 questions"), and a **136-question quiz loaded without error** — the previously-unbounded query running at real volume with the `LIMIT` in place.
- Zero errors or crashes in the Metro log across the whole pass.

**Honest gaps:** this was the emulator, not a low-end physical device, and the ~3.4-minute background sync was not tested across an app kill at full scale (the resume path is per-page checkpointed and was exercised at the ~500 scale, but not at 76 pages). Sync wall-clock on a real phone over mobile data is unmeasured.

## Real bug found during this session's own testing

**`releaseGate` fired once per question page.** The release conditions are re-evaluated on every progress tick and `phase` stays `"questions"` for the rest of the sync, so the first online run logged `preparation gate released (reference data ready)` **three times**. React bails out on the unchanged state so there was no re-render and no user-visible effect, but it made the log untrustworthy — you could not tell from it which condition had actually won, which is exactly what this report relies on the log to prove. Fixed with a `gateReleased` ref guard; the re-run then logged the line exactly once, as shown in scenario 1 above.

**A bare `DROP INDEX` bricked the app.** After generating migration `0011`, the emulator showed `Database migration failed: Failed to run the query 'DROP INDEX 'idx_question_translations_question_id';'` and **would not start at all** — a failed migration is a hard gate in `app/_layout.tsx`.

The immediate cause was my own edit churn: an earlier `0011_narrow_ironclad.sql` had already been applied by the running app (dropping the index) before I replaced it with `0011_worthless_mandrill.sql`, so the replacement tried to drop an index that was already gone. Real devices would not have hit that specific sequence, since their `0000` creates the index.

But the underlying fragility is real and worth fixing regardless: **drizzle-kit generates index DDL with no existence guards, and any single failing statement takes the whole app down.** The migration was hand-edited so every statement carries `IF EXISTS` / `IF NOT EXISTS`. Index DDL is exactly the case where being defensive costs nothing. Same class of hand-edit as the one recorded in `reports/06-bookmark-sync-and-offline-indicator/`. Re-verified by wiping app data and replaying all 12 migrations from scratch.

**A near-miss in the same area, avoided by reasoning rather than testing:** the first generated version of this migration created `subjects(name)` as **UNIQUE**, mirroring Postgres. That would have made the migration capable of failing permanently on any device holding a duplicate subject name — the same unstartable-app outcome. It was changed to a plain index before it ever ran: the uniqueness added nothing to query performance, and a local read cache is the wrong place to re-litigate a server-side invariant.

## Honest gaps

- **The gate's duration was not measured precisely.** An attempt to time it by polling the log gave ~6s, but that figure is dominated by 1–2s poll latency and log buffering and should not be quoted. The sound claim is the weaker one made above: the release *reason* proves it was under 5000ms. A real number needs timestamps in the log, which would be instrumentation added purely for this measurement.
- **The bar's smoothness was not visually assessed.** The gate is now short enough that it was gone before a screenshot landed, and on the one occasion `PreparingApp` was captured, Expo Go's own first-run dev-menu sheet was covering it. So the 200ms tick + 240ms ease was never watched on a real screen, and specifically was never checked on low-end hardware, which is this app's actual audience.
- **Tested in Expo Go, not a release build.** Expo Go downloads the JS bundle over `adb reverse`, which tunnels through adb rather than the network stack — so in the offline scenario the bundle still loaded while the API was genuinely unreachable. That is a fair simulation of an installed APK (whose bundle is baked in), but it is a simulation.
- **The `LIMIT` was not exercised at its boundary.** The largest topic available holds 29 questions against a limit of 200, so the truncation path never ran. It cannot be meaningfully tested until the ~500-question pool is lifted.
- **Only the emulator was tested.** Nothing was run on the user's physical device.

**Also still outstanding from §9**, deliberately not in this phase: the `loadSessions` N+1 that runs at every app start, the four missing indexes and one redundant one, list virtualization for Revise/Summary/Result, the Mock Test data-layer facade, and the remaining per-row `await` loops in `writeReferenceData`. The question pool must not be lifted until at least the N+1 and index work lands — see §9.4.

**One deviation from the literal instruction**, called out so it isn't a surprise: the bar is not hard-coded to 20%/40%/60%/80%/100% at one-second intervals. Real milestones drive it with time-based easing filling the gaps. Forcing the stated steps would mean *adding* delay when reference data lands early, which contradicts the same instruction's "even less is ok".
