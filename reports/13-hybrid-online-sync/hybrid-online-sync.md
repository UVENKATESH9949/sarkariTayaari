# Non-Blocking Startup + Hybrid Online/Local Data Layer

**Closes:** an AI-drafted spec the user provided, asking that synchronization never
block normal app usage — the app should open immediately (including on a device's
very first launch), read live from the backend while local sync is still catching
up, and switch to local SQLite once sync completes, with status visible (not
blocking) in More/Settings.

Two scope decisions were confirmed with the user before implementation, both chosen
over a smaller/safer alternative that was also proposed:
1. **Full hybrid data-repository approach** — screens read live from the backend API
   when local sync isn't done yet, not just "show whatever's synced so far."
2. **Mock Test also gets full live parity** — a real timed attempt can start and run
   entirely live before the first sync finishes, not just exam/paper browsing.

## What existed before

Confirmed by reading the actual code, not assumed: the app blocked its entire UI
behind a full-screen "Downloading your question bank..." spinner on a device's
first-ever launch, via `SyncContext`'s mount effect `await`-ing `runInitialSync()`
before anything else rendered. Delta sync (every launch after the first) was already
fully non-blocking — this session extended that same pattern to the first-ever sync
too, rather than building something new for it.

## What was built

**Backend — four new public read endpoints** on `QuestionController`/`QuestionService`,
all reusing the existing `QuestionSpecifications.filter(...)` predicate the admin CRUD
list already used:
- `GET /api/questions/live` — filterable practice-question browsing (topic/subject/
  difficulty/exam), excludes soft-deleted rows (unlike the admin list, which
  deliberately doesn't).
- `GET /api/questions/counts` — grouped counts (by exam/subject/topic/difficulty) for
  "how many questions does X have" screens. Needed genuinely new query logic — a
  `QuestionRepositoryCustom`/`QuestionRepositoryImpl` fragment building a
  `CriteriaQuery<Object[]>` that reuses `QuestionSpecifications.filter(...)`'s
  `toPredicate(...)` directly (a `Specification` works against any matching
  `Root`/`CriteriaQuery`/`CriteriaBuilder`, not just `findAll`).
- `GET /api/questions/mock-count` / `GET /api/questions/mock-sample` — Mock Test's
  full live parity: "how many / give me N random questions across this **set** of
  subject ids, for one exam" — the same query shape `mobile/src/db/mockTest.ts`
  already does locally via SQLite's `inArray(...)` + `ORDER BY RANDOM()`. The
  Postgres equivalent uses `cb.function("random", Double.class)` in the `ORDER BY`,
  on the same repository fragment.

None of the four require auth — same pattern as the existing `/sync` endpoint.

**Mobile — the blocking screen is gone.** `SyncContext`'s mount effect fires
`runInitialSync()` the same non-blocking way delta sync already fires `refresh()`.
`RootNavigator` no longer special-cases `"checking"`/`"syncing"` status.
`SyncProgressScreen.tsx` is deleted. A new `syncNow()` on the context picks initial
vs. delta sync depending on whether the device has ever synced, for the More
screen's single "Sync Now"/"Retry" action.

**Mobile — hybrid data layer**, new `mobile/src/data/` directory:
- `hybridSource.ts` — `useHybridMode()`, the single branching decision
  (`"local"` once `lastSyncedAt !== null`, `"live"` if never-synced-but-online,
  `"unavailable"` if never-synced-and-offline).
- `practiceData.ts`, `mockTestStructureData.ts`, `mockTestData.ts`,
  `liveQuestions.ts` — hybrid equivalents of every function in
  `db/practiceContent.ts`, `db/examStructure.ts`, `db/mockTest.ts`. Each delegates
  unchanged to the existing local function in `"local"` mode (zero changes to those
  files), or fetches + reshapes to the identical return type in `"live"` mode, so
  screens don't need to know which source answered.
- `resolveCorrectIndex` extracted into a shared `mobile/src/db/answerResolution.ts`
  so local and live paths parse the same letter/value correct-answer format
  identically, instead of two copies drifting apart.
- Screen changes are uniform and minimal: swap the data import, call
  `useHybridMode()`, pass `mode` into the query call and effect deps. Nothing else
  about each screen (params, styling, navigation) changed. Covers the full Practice
  flow (exam list, subjects, topics, levels, quiz) and Mock Test (browsing, Start's
  section availability, and the actual timed attempt).
- The live→local switch needs no new plumbing: it falls out of the existing
  `syncVersion`-triggers-refetch pattern already used for delta syncs, since
  `lastSyncedAt` flipping non-null re-renders every `useHybridMode()` consumer.

**Mobile — real sync status in More/Settings**, replacing a hardcoded
`"Last synced: Never"` that was never actually wired to `SyncContext` at all (not a
design choice — just disconnected). Four states: never-synced, syncing (with live
progress), completed (with a formatted last-synced timestamp), failed (with the
real error and a Retry button) — all driven by real context state via the new
`syncNow()`.

**Mobile — offline + never-synced messaging.** New shared
`mobile/src/ui/OfflineNoDataNotice.tsx`, shown instead of a screen's normal empty
state when `mode === "unavailable"` — explains *why* content is missing ("connect
once to download it") rather than looking like the content just doesn't exist.

## Two real bugs found via actual on-device testing, not just code review

1. **The sync banner started blocking tab-bar taps.** Previously, `SyncBanner`'s
   `"checking"`/`"syncing"` states were unreachable — they lived behind the now-deleted
   blocking screen. The moment they became visible during a real first-ever sync
   (which can run for minutes, unlike a brief delta sync), the banner's
   `position: absolute, bottom: 24` overlapped the bottom tab bar and **silently ate
   every tap intended for it** — confirmed via `uiautomator` bounds showing the
   banner (`[63,2238][1017,2337]`) directly overlapping the Practice tab's clickable
   area (`[216,2209][432,2337]`). Fixed two ways: `pointerEvents="none"` on the
   banner (it's purely informational, never needs to be tapped) so touches always
   pass through to whatever's underneath, and raised its `bottom` offset to clear
   the tab bar visually too.
2. **`practice/index.tsx` (the exam-list landing screen) was missed entirely** in
   the first wiring pass — found by testing "does live mode actually show data" on
   a real device, not by inspection. It still imported `getSyncedExams` from the
   local-only `db/practiceContent.ts`, so live mode showed an empty "More exams are
   added as they're synced" state despite the backend endpoints working correctly
   (verified independently via curl first). Fixed by wiring it the same way as
   every other Practice screen. A grep sweep afterward confirmed no other screen
   was still importing the local-only functions this feature has hybrid
   equivalents for.

## Verified

- **Backend**: new `LiveQuestionsTest.java` (7 tests: filtering, difficulty,
  unmatched-filter-returns-empty-not-error, grouped counts excluding deleted rows,
  unknown-groupBy-400, multi-subject mock-count/mock-sample, deleted-question
  exclusion from mock-sample) — all pass against the real Neon DB. Full existing
  suite re-run after the changes: **78/78 tests pass, 0 failures** (71 pre-existing
  + 7 new).
- **Mobile**: `tsc --noEmit` clean, `eslint` clean on every changed/new file (the
  only lint findings anywhere in `src/` are pre-existing, confirmed via `git diff`
  to predate this change — same "16 pre-existing errors" bucket documented since
  TICKET-503).
- **Real on-device verification**, same Android emulator used all session
  (fresh installs via `pm clear`, `adb reverse` for Metro/backend ports):
  - Fresh install: app opens immediately, no blocking screen, tab bar usable from
    frame one.
  - Practice's exam list showed **full, correct question counts matching the
    finished totals** (SSC CGL 10,174, IBPS PO 12,186, etc.) while local sync was
    genuinely only 75-91% complete — confirmed via the sync banner's own progress
    text at the moment of the screenshot, proving the live-read path is real, not
    coincidentally already-synced data.
  - **Mock Test full parity confirmed live**: Start screen showed correct
    per-section availability (25/25/25/25 questions) and an enabled "Start Test"
    button while sync was at 91%; tapping it fetched a real random 100-question
    sample live from `/mock-sample` and ran a genuine timed attempt (countdown
    timer ticking down, question navigator, answer selection) — not a stub.
  - Killed and relaunched the app mid-first-sync: confirmed resume-from-checkpoint
    still works and the app stayed usable throughout, banner picking back up
    partway through instead of restarting.
  - Once sync reached 100%, revisited Practice and confirmed a **seamless switch**
    to local data — identical counts, no flash of empty state, no visible
    discontinuity.
  - More screen showed the real "Content is up to date / Last synced: Today,
    2:20 PM / Sync Now" completed state, exactly as designed.

## Honest gaps

- **The genuinely-offline-and-never-synced (`"unavailable"`) empty state
  (`OfflineNoDataNotice`) was verified via code review and the underlying
  `useHybridMode()` logic, but not directly exercised end-to-end on-device** — this
  emulator image blocks even loopback traffic when there's no OS-validated network
  connection, which broke Metro's own connectivity before the JS bundle could load,
  making a clean "airplane mode from a fresh install" test impractical in this
  environment. The logic is straightforward (`lastSyncedAt === null && isOnline ===
  false`) and shares the same `isOnline` signal `OfflineBanner` already uses
  correctly elsewhere, but this specific UI path is a real remaining gap worth a
  direct check on a physical device.
- **`mock-test/test.tsx`'s pre-existing "Preparing your test…" state has no timeout
  or retry** if a live fetch fails after an attempt is already navigated to (a
  `catch` was added so it fails gracefully rather than crashing, but the screen
  doesn't yet offer a way out besides backing out manually) — a pre-existing gap in
  a code path that was previously unreachable (local reads essentially never fail),
  now reachable in live mode. Not fixed this pass; flagged rather than silently
  left.
- **Sync banner's `bottom: 90` offset is a fixed heuristic**, not computed from the
  actual tab bar height via `useBottomTabBarHeight()` — that hook isn't safely
  callable from where the banner renders (a sibling of the tab navigator, not a
  descendant of it, so it has no tab-bar context on non-tab screens). Verified
  visually correct on this device/screen size; a very different screen density
  could need retuning.
