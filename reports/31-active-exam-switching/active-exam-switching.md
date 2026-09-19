# Multiple My Exams + a real Active Exam

**Date:** 2026-09-16
**Branch:** `feature/on-device-llm-spike`
**Scope:** mobile only — one local migration (0026), one new provider, five screens rewired, plus one
follow-up fix found by device testing. **No backend change, no API change, no navigation change.**

**Status: PASS WITH FIXES** — all 13 behavioural scenarios executed on `emulator-5554`; one real
defect found (DEF-CATALOG-001), fixed, and re-verified.

## A. Root cause

The supplied brief assumed one bug ("Home shows the old exam until the app is reloaded"). There
were **two**, and the second one means a reload never reliably fixed it either.

**1. Nothing connected the database to the running app.** `(tabs)/index.tsx` read
`getFollowedExam()` inside an effect keyed on `syncVersion` — a counter only a *sync* bumps.
Following or unfollowing from My Exams, the Exams tab or an Exam Guide wrote to SQLite and
notified nobody, so Home kept rendering the value it read on mount. Every other exam screen had
the same shape: each kept its own private copy of the followed list, read once. There was no
channel between persistent storage and in-memory state — which is exactly what the brief's §9
suspected.

**2. There was no stored notion of an "active" exam at all, and the query that stood in for one
was unordered.** `getFollowedExam()` ran:

```ts
db.select(...).from(followedExams).innerJoin(exams, ...).where(eq(followedExams.isDeleted, false)).get()
```

No `ORDER BY`. With more than one exam followed, "the" exam was whichever row SQLite returned
first — in practice the earliest-inserted, i.e. **the first exam ever followed**. That is the
literal mechanism behind "Home keeps showing the old exam": the old exam *was* the one that query
returned, and restarting the app re-ran the same unordered query and returned it again. The
`followed_exams` table has always supported many rows (its primary key is `examCode`); what was
missing was any record of which one mattered.

`preparation-radar.tsx` used the same query as its fallback, so the radar could silently score
against a different exam than Home displayed.

## B. Files changed

**Added**

| File | Why |
|---|---|
| `mobile/src/db/migrations/0026_active_exam.sql` | `app_preferences.active_exam_code` |
| `mobile/src/examsModule/activeExamContext.tsx` | The provider — single source of truth, and the one `setActiveExam` operation |
| `mobile/src/examsModule/ExamSwitchOverlay.tsx` | The blocking transition, mounted once at the root |
| `mobile/src/examsModule/ActiveExamPicker.tsx` | "Select active exam" radio list, reusing `LanguagePickerModal`'s idiom |

**Changed**

| File | Why |
|---|---|
| `mobile/src/db/schema.ts` | New column; corrected the `followed_exams` comment |
| `mobile/src/db/preferences.ts` | `activeExamCode` through the type, defaults, `coerce` and the partial write |
| `mobile/src/db/migrations/migrations.js`, `meta/_journal.json` | Register 0026 |
| `mobile/src/app/_layout.tsx` | Mount `ActiveExamProvider` (inside Sync + Auth) and the overlay |
| `mobile/src/app/(tabs)/index.tsx` | Home reads the provider; added the "Change exam" control + picker |
| `mobile/src/app/my-exams.tsx` | Active marker, "Set active", follow/unfollow through the provider |
| `mobile/src/app/(tabs)/exams.tsx` | Follow star through the provider (dropped its private followed-set state) |
| `mobile/src/app/exam-guide.tsx` | Follow button derived from the provider, not a one-shot `isExamFollowed()` |
| `mobile/src/app/preparation-radar.tsx` | Falls back to the **active** exam, not an arbitrary followed one |
| `mobile/src/db/followedExams.ts` | Doc comments corrected (they claimed Home called `getFollowedExam`) |
| `packages/core/src/i18n/en.ts`, `te.ts` | New `exams.*` chrome (both catalogues — Telugu is typed as English's shape) |
| `qa/**` | `REQ-CATALOG-025`, `SCN-CATALOG-044/045`, `TC-CATALOG-053/054/055` + regenerated RTM/suites/dashboard |

## C. Data flow

```
My Exams                     Active Exam
followed_exams               app_preferences.active_exam_code
(synced, many rows)          (device-local, one row, one column)
        \                           /
         \                         /
          v                       v
        ActiveExamProvider  --  resolveActive()
        myExams / activeExam / setActiveExam
                    |
     +--------------+---------------+-----------------+
     v              v               v                 v
   Home         My Exams        Exams tab       Preparation Radar
```

`resolveActive` never trusts the stored code on its own: it uses it only when that exam is
genuinely in My Exams, otherwise falls back to the most recently followed exam, otherwise null —
and writes the resolution back, so the fallback is sticky rather than re-decided on every read.
It runs on mount and whenever `syncVersion` or `progressVersion` changes, because a sync can
auto-follow an exam (`ensureExamFollowed`) and signing in can restore follows made on another
device — both are external writes this provider must notice.

### Why `app_preferences` and not a column on `followed_exams`

`followed_exams` is a **synced** table and the backend's contract has no active-exam concept, so
an `is_active` column there would be local-only data riding on rows the server also writes.
`app_preferences` is already the device-local, never-synced, never-cleared-on-sign-out row, and
being a *single* row it makes "exactly one active exam" true by construction rather than by a
constraint nothing enforces.

**The trade-off, stated rather than hidden:** switching exams on one device does not move the
active exam on another. Both devices still agree on *My Exams*, because that is the part the
server actually stores. Making the active exam account-wide later is an additive column plus an
API change; nothing in this design would have to move.

## D. Loading behaviour

`setActiveExam` raises the overlay, then: persists to SQLite → updates provider state (Home
re-renders behind the overlay and starts its own exam-scoped loads) → warms the new exam's guide
and priority topics via `Promise.allSettled` → lowers the overlay.

**There is no artificial delay.** The only timer is `MIN_OVERLAY_MS = 350`, a floor applied
*after* the work finishes purely so a switch that resolves in 30ms does not flash the overlay for
a single frame. A switch that takes 2 seconds takes 2 seconds; one that takes 6 takes 6. The
overlay comes down in a `finally`, so a failed prefetch cannot strand it — which is also the
answer to the brief's Case 6: switching offline to an exam with no cached guide completes, and
Home renders without the deadline card rather than blocking.

It is a `Modal`, not an absolutely-positioned view, because that is the only thing in React
Native that reliably covers the tab bar too — "the app should not be interactive" is not true of
an overlay the tab bar still sits on top of.

## E. Multiple-exam behaviour

- Following or unfollowing changes **My Exams only**; switching changes **Active only**. Neither
  touches the other.
- My Exams marks the active exam with a filled radio and an "Active" value line; every other row
  gets a "Set active" button. The row tap still opens the Exam Guide, exactly as before —
  activation is its own explicit control, not a new meaning for an existing gesture.
- Home shows "Change exam" only when more than one exam is followed; with one exam the control
  would open a picker containing the exam already on screen, and "Explore Exams" directly below
  is the route to getting a second.
- **Case 7** (the active exam is unfollowed): the most recently followed remaining exam is
  promoted, by the resolver, wherever the unfollow happened.
- **Case 8** (everything unfollowed): no active exam, and Home shows its existing empty state.
  This is the pre-existing business rule, not a new one: `ensureExamFollowed` auto-follows the
  first exam on the next sync, and the resolver then promotes it — so "no exams" is transient by
  design rather than a supported end state.

## F. Testing

### Static checks (re-run after the fix below)

| Check | Result |
|---|---|
| `npx tsc --noEmit` (mobile) | clean |
| `npx expo lint` | **exactly the pre-existing 9-problem baseline** |
| `packages/core` typecheck + `vitest` | clean, **195/195** |
| Migration 0026 against a populated pre-0026 `app_preferences` row (offline harness) | PASS |

### Behavioural verification on a device — 2026-09-16

Run on **`emulator-5554`** (AVD `Pixel_7`), Metro dev client, against a real dev backend on
`localhost:8080`, on this device's **real populated database** (not a fresh install). A physical
device was attached to the machine throughout and was never touched; every `adb` call was pinned
to the emulator.

**Migration 0026 applied through the real drizzle migrator on first launch** — the highest-risk
item in the original report. The device's existing `app_preferences` row survived and the resolver
immediately logged `resolved active exam differed from stored — rewritten { stored: null,
resolved: 'SSC_CGL' }`.

| Test | Result | Evidence |
|---|---|---|
| Home active-exam switch | **PASS** | Picker → overlay → Home on the new exam, no reload |
| My Exams activation | **PASS** | "Set active" switched in 766ms; marker moved; Home followed |
| Exams tab | **PASS** | Follow/unfollow worked and did **not** steal Active |
| Exam Guide | **PASS** | Footer flipped "Following"→"Follow"; removal promoted the next exam |
| Preparation Radar | **PASS** | **61 of 61** topics with SSC CGL active vs **46 of 46** with RRB NTPC |
| Multiple exams | **PASS** | SSC CGL → RRB NTPC → IBPS PO → SSC CGL and back, every hop verified |
| App restart | **PASS** | IBPS PO (deliberately not the first-followed) survived force-stop |
| Offline switch | **PASS** | Airplane mode, 586ms, Home updated, no network required |
| Active exam removal | **PASS** | Promoted the most recently followed remaining exam each time |
| All exams removed | **PASS, after a fix** | Found DEF-CATALOG-001 — see below |
| Race / rapid switching | **PASS** | 4 rapid taps produced exactly one switch; final state deterministic |
| Exam-scoped Home data | **PASS** | Focus-next topics and the deadline card both changed with the exam |
| Sync interaction | **PASS** | Follows and a delta sync both left the chosen active exam alone |

**Measured switch durations, from the app's own log:** 508ms, 523ms, 586ms (offline), 753ms,
766ms, 953ms, 1204ms, 1210ms, 1630ms, 2201ms. Real work every time — the 350ms floor was never
the binding constraint except on the fastest switches, and nothing sleeps for a fixed period.

**The overlay was confirmed visually**, full-screen, reading "SWITCHING / Preparing your dashboard
/ Switching to IBPS PO...". Blocking was confirmed behaviourally rather than assumed: a tab-bar
tap fired 600ms into a 1204ms switch did **not** navigate.

### The bug this found: DEF-CATALOG-001

**Unfollow every exam, relaunch → an exam came back but no active exam did.** `ensureExamFollowed`
(SyncContext's warm start) re-followed SSC CGL, but Home rendered a blank "Preparing for" card with
no name, no Focus next and no deadline, and stayed that way.

**Root cause:** that function writes a `followed_exams` row *outside any sync* and announced it to
nobody. The active-exam provider had already read an empty followed list, and the delta sync that
would otherwise have bumped `syncVersion` was suppressed by the 15-minute staleness window — so
nothing ever triggered a re-read. Only reachable when there is no active exam *and* exams exist,
which is why every other scenario passed.

**Fix (smallest correct):** `ensureExamFollowed` now returns whether it actually followed
something, and SyncContext's warm-start path bumps `syncVersion` when it did — reusing the existing
"underlying data changed" channel rather than inventing a second one.

**Re-verified from the exact failing state** (device SQLite confirmed `active_exam_code` NULL with
zero live `followed_exams` rows before launch): a cold start now lands on SSC CGL, with
`resolved active exam differed from stored — rewritten { stored: null, resolved: 'SSC_CGL' }` in
the log. Confirmed three times, including the final restore of the device's baseline state.

### A test-case expectation that was itself wrong

`TC-CATALOG-055` step 5 expected a **pull-to-refresh** to auto-follow an exam. It does not:
`ensureExamFollowed` runs at app start and after an initial sync, never on a delta sync. The step
also only asserted that an exam gets *followed* — which is precisely the gap DEF-CATALOG-001 sat
in. Corrected to name the restart as the trigger and to assert that an exam becomes **active**.

### QA records

First real executions in this register: `EXEC-CATALOG-0001/0002/0003/0004` in
`qa/execution/2026-09-16-catalog.yaml`, with `EXEC-CATALOG-0003` recorded honestly as **Fail** and
`0004` as the passing re-run after the fix. `DEF-CATALOG-001` logged as `Fixed`. RTM now shows a
complete requirement → scenario → test case → execution → defect chain for `REQ-CATALOG-025`.

Two stale strings in `scripts/qa/generate-reports.js` were corrected in passing: it hardcoded "no
real execution has occurred yet" into the dashboard, and left the RTM's Execution column
permanently blank — both written when the folder was genuinely empty, both wrong now.

## G. Follow-ups and limitations found on the way

1. **The brief's "68% Prepared" does not exist.** Home's Prepared-for card shows the exam name
   only, and the separate readiness card is a **hardcoded mock** (`MOCK.readinessPercent = 62`)
   that has never been exam-scoped. No percentage was invented for it here. Wiring a real
   per-exam figure is genuinely separate work — the readiness formula is an open decision, and
   the exam-scoped accuracy that *does* exist (`exam-guide.tsx` computes one from session
   history) is accuracy, not preparedness.
2. **The streak on Home is also mock** (`MOCK.streakDays = 3`) and not exam-scoped.
3. **Not everything on Home is exam-scoped, correctly.** Bookmarks and wrong-answer counts are
   app-wide by design and were not changed.
4. **`getFollowedExam()` and `isExamFollowed()` are now effectively dead** — the former is used
   only by `ensureExamFollowed` for a yes/no. Both were left in place (removing exported helpers
   is outside this task) with doc comments warning that the first is *not* the active exam.
5. **Device-local by choice** — see §C. If the product wants the active exam to follow the
   account, that is a `followed_exams.is_active` column or a `users.active_exam_code` field plus
   a contract change in `api/USER-PROGRESS.md`, and the provider is the only client-side thing
   that would change.
6. **No debug logging ships to production.** Every `[ExamSwitch]` line is behind `__DEV__` —
   confirmed useful in practice: the whole verification above was read off those lines.
7. **The zero-exams empty state is thin.** With nothing followed, Home renders a "Preparing for"
   card with a blank name rather than a real empty state. That is pre-existing behaviour, left
   unchanged deliberately (the brief's §10 said not to invent one), but it is the weakest screen
   this work touched and worth a proper empty state later.
8. **A LogBox warning banner swallows taps on the tab bar** while it is visible — already on
   record in this project, hit again during testing, and unrelated to this change.
9. **Test-session leftovers on the emulator only:** a few exams were followed and unfollowed
   during testing. The device was restored to its original single-exam baseline (SSC CGL followed
   and active) before the session ended. Nothing was written to the shared dev database.
