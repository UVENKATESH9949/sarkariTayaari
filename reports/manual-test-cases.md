# Manual Test Cases — SarkariTaiyaari

**Purpose:** Verify the product against what was actually *asked for*, not against
how it happens to be built. Every test case below is derived from the stated
requirement for that module (the ticket, the user's own instruction, or the
user-provided spec) — not from reading the implementation. If a test case here
fails, that's either a real bug or a real requirement gap; it should never be
"fixed" by rewriting the test case to match what the code currently does.

Each module is broken into three categories, the standard shape for real test
coverage rather than just the happy path:
- **Positive** — the feature working as intended, the way most usage will look.
- **Negative** — invalid input, unauthorized access, failure conditions — things
  that should be *rejected* or *handled*, not silently accepted or crashed on.
- **Edge** — boundaries, races, unusual sequences, and scale/timing conditions
  that don't come up in a quick happy-path click-through but are exactly where
  real bugs tend to hide.

**How to use this:** Run through each case on a real device (emulator or phone).
Fill in **Result** (Pass/Fail/N-A) and **Notes**. A small number of edge cases
are hard to force manually (network-drop timing, storage exhaustion) — mark
those N/A with a note if you can't reproduce the trigger condition, rather than
skipping them silently.

**Scope:** the four modules delivered/changed in the 2026-08-20 session, plus one
added 2026-08-24 (the dark theme and sync-retry work from that later session were
visual/resilience changes without new interactive behavior to test against):
1. Admin Authentication
2. Crash Reporting & Basic Analytics (TICKET-503)
3. Load Testing / Data at Scale (TICKET-501)
4. Non-Blocking Startup + Hybrid Online/Local Sync (user-provided spec)
5. Practice/Mock Test Navigation + Exit Guard (2026-08-24, user-provided spec)

---

## Module 1 — Admin Authentication

**Requirement:** role-based, *multiple* admin accounts — not a single shared
credential — reusing the existing token-based auth, so the admin console and
content-management API are no longer wide open.

### Positive

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 1.P1 | Valid admin login succeeds | Enter a real admin email + correct password, submit | Login succeeds; the admin dashboard loads | | |
| 1.P2 | Two independent admin accounts both work | Create/use two separate admin accounts; log into the console as each in turn | Both log in successfully with their own credentials — not one shared login | | |
| 1.P3 | Session persists across reload | Log in, then refresh/reload the admin console page | You remain logged in | | |
| 1.P4 | Admin can create content | While logged in, create a new question/exam/subject | The change succeeds and is visible afterward | | |
| 1.P5 | Admin can edit content | While logged in, edit an existing exam/subject/topic | The edit saves and persists on reload | | |
| 1.P6 | Admin can delete content | While logged in, delete a question | It no longer appears in the admin list | | |
| 1.P7 | New admin can be invited | While logged in as admin, register a second admin account via the invite flow | The invite succeeds | | |
| 1.P8 | Newly-invited admin can log in immediately | Log in as the just-created second admin | Login succeeds with no delay or extra setup step | | |
| 1.P9 | Mobile's public endpoints stay public | With zero login/token, call the endpoints the mobile app relies on (exam list, question sync, subjects, topics) | All still return real data | | |
| 1.P10 | Sign out then sign back in | Sign out, then log back in with the same account | Works cleanly, no leftover state from the old session | | |

### Negative

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 1.N1 | Wrong password rejected | Correct email, incorrect password | Clear "invalid credentials" error; not logged in | | |
| 1.N2 | Unknown email rejected | An email that was never registered | Clear error, not a blank screen or crash | | |
| 1.N3 | Empty email rejected | Submit the login form with the email field blank | Rejected — not silently treated as valid | | |
| 1.N4 | Empty password rejected | Submit the login form with the password field blank | Rejected | | |
| 1.N5 | Student credentials rejected at admin login | Use a real student account's email/password on the admin login screen | Login is rejected — a student is never treated as an admin | | |
| 1.N6 | API call with no token | Call a content-management endpoint (e.g., create question) with no Authorization header | 401, no change is made | | |
| 1.N7 | API call with a student token | Call the same endpoint with a valid *student* token | 403 — distinct from the no-token case | | |
| 1.N8 | API call with a malformed token | Call the endpoint with a garbage/random string as the token | Rejected cleanly, no server error/crash | | |
| 1.N9 | Admin-invite rejects a student token | Call the admin-invite endpoint with a student token | Rejected (403) | | |
| 1.N10 | Admin-invite rejects no token | Call the admin-invite endpoint with no token at all | Rejected (401) | | |
| 1.N11 | Revoked token can't be reused | Sign out (which revokes the token), then reuse the old token value on an API call | Rejected — sign-out actually invalidates it, not just the client-side UI | | |

### Edge

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 1.E1 | Email case-sensitivity | Log in with the email in a different case than it was registered (e.g., `Admin@x.com` vs `admin@x.com`) | Behaves consistently — either always matches or always doesn't, documented either way, not inconsistent | | |
| 1.E2 | Leading/trailing whitespace in email | Log in with extra spaces around the email | Handled consistently — trimmed or rejected, not treated as a different account | | |
| 1.E3 | Backend restart doesn't duplicate the bootstrap admin | Restart the backend when a bootstrap admin already exists | No duplicate admin account is created | | |
| 1.E4 | Concurrent edits to the same content | Two admin sessions edit the same question at nearly the same time, both save | The second save doesn't silently corrupt or invisibly discard the first admin's change | | |
| 1.E5 | Email collision between a student and a new admin | Attempt to create an admin account using an email that already exists as a *student* account | Behavior is defined (reject or clearly separate) — doesn't crash or merge the accounts unexpectedly | | |
| 1.E6 | Very long email/password input | Submit an unusually long string in either field | Handled without a server error (e.g., 500) | | |
| 1.E7 | Network drop mid-login-submission | Submit login, then kill connectivity right after tapping submit | No stuck "half logged in" state — either it fails cleanly or completes | | |
| 1.E8 | Sign-out with no active session | Trigger sign-out when already signed out (e.g., stale UI state) | Doesn't error — no-ops gracefully | | |

---

## Module 2 — Crash Reporting & Basic Analytics (TICKET-503)

**Requirement:** wire up crash reporting (Sentry) and basic usage analytics for
the mobile app — enough visibility to know when something breaks and how the
app is actually being used, without a dedicated analytics platform.

### Positive

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 2.P1 | A real crash is captured | Force an error while the app is running (debug trigger or reproducible bug) | The event appears in the Sentry dashboard | | |
| 2.P2 | Screen views are tracked | Navigate to each main screen (Home, Practice, Mock Test, Progress, More) | Each visit is recorded as a breadcrumb/event | | |
| 2.P3 | Sign-in is tracked | Sign into an account successfully | A sign-in event is recorded | | |
| 2.P4 | Sign-up is tracked | Create a brand-new account | A sign-up event is recorded, distinguishable from sign-in | | |
| 2.P5 | Sign-out is tracked | Sign out | A sign-out event is recorded | | |
| 2.P6 | Practice completion is tracked | Finish a practice session | A "session completed" event is recorded with correct subject/topic/score data | | |
| 2.P7 | Mock completion is tracked | Finish a full mock attempt | A "mock completed" event is recorded with correct data | | |
| 2.P8 | Bookmark-add is tracked | Bookmark a question | An event is recorded | | |
| 2.P9 | Bookmark-remove is tracked | Remove that bookmark | A separate event is recorded, not conflated with the add | | |

### Negative

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 2.N1 | App works with no Sentry DSN configured | Run a build with no DSN set | App functions completely normally — no crash, no visible error to the user | | |
| 2.N2 | Report-send failure doesn't crash the app | Force a network failure right as a crash report would be sent | The app itself doesn't crash because the report failed to send | | |
| 2.N3 | Failed sign-in isn't logged as success | Attempt sign-in with the wrong password | No false "sign-in success" event is recorded | | |
| 2.N4 | Analytics call doesn't block the real action | Complete a practice session while network is very slow | The session completes and the UI responds immediately — it doesn't wait on the analytics call | | |
| 2.N5 | Offline analytics don't crash or spam-retry | Trigger several trackable actions (screen views, bookmarks) fully offline | No crash; no visible retry storm once back online | | |
| 2.N6 | Early crash (before Sentry initializes) doesn't take down the whole app worse than no reporting would | If reproducible: force a crash at the earliest possible point in app startup | App fails no more badly than it would with no crash reporting at all | | |
| 2.N7 | No sensitive data in captured events | Inspect a few real captured events/breadcrumbs (Sentry dashboard) | No passwords or auth tokens appear in the payload | | |
| 2.N8 | Background-screen crash is still captured | Force a crash on a screen not currently in the foreground, if applicable | Still appears in Sentry, not silently lost | | |

### Edge

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 2.E1 | Rapid tab-switching doesn't flood or crash tracking | Quickly tap through all five tabs repeatedly for ~10 seconds | No crash, no visible lag from the tracking calls | | |
| 2.E2 | Many sessions back-to-back are all recorded | Complete 5+ short practice sessions in a row quickly | Each is recorded individually — none dropped/deduplicated | | |
| 2.E3 | Long-running session doesn't degrade | Leave the app open and in use for an extended period (30+ min) | No memory/performance degradation attributable to analytics/crash reporting | | |
| 2.E4 | Rapid sign-out/sign-in cycling | Sign out, immediately sign back in, repeat 3 times quickly | All events recorded in the correct order, none skipped | | |
| 2.E5 | First-ever action on a fresh install fires correctly | On a brand-new install, do the very first trackable action (first screen view) | The event fires — no "warm-up" gap where the first action is missed | | |
| 2.E6 | Airplane-mode toggle mid-analytics-call | Toggle airplane mode on and immediately off while an event would be sending | Subsequent events still track correctly afterward — no corrupted tracking state | | |

---

## Module 3 — Load Testing / Data at Scale (TICKET-501)

**Requirement (as the user expanded it):** the app should hold up and *look like
a finished product* at real scale — not just hit a question count, but have
every module (exams, questions, practice history, mock history) populated with
realistic volume, tested as if it were a finished product.

### Positive

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 3.P1 | Handles 10,000+ questions without crashing | Fresh install, let it fully sync (~37,900 questions currently seeded) | Completes without crashing | | |
| 3.P2 | Full first sync completes | Time a fresh sync start to finish | Reaches 100%, app reports "up to date" | | |
| 3.P3 | Real per-exam counts | Open Practice, check each exam's question count | Real, correct, non-zero numbers | | |
| 3.P4 | Real per-subject/topic counts | Drill into an exam's subjects/topics | Correct non-zero counts where content exists | | |
| 3.P5 | Practice quiz works at scale | Start and complete a quiz for any subject/topic | Loads, answers select correctly, scores correctly | | |
| 3.P6 | Mock test works at scale | Start and complete a full mock test | All sections load with correct question counts; scoring is correct | | |
| 3.P7 | Demo account shows realistic history | Sign into the demo account | Multiple real past sessions/attempts shown, not empty | | |
| 3.P8 | Long lists scroll smoothly | Scroll a full exam list and a large topic's question list | No significant stutter | | |
| 3.P9 | Delta sync is fast on repeat | After first full sync, reopen the app later | The background check is quick, not a full re-download | | |
| 3.P10 | New content appears without full re-sync | Have an admin add one new question, then reopen the app | It appears after a quick sync | | |

### Negative

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 3.N1 | Interrupted sync doesn't corrupt local data | Kill the app mid-sync | Already-downloaded local data remains intact and usable | | |
| 3.N2 | Soft-deleted content handled gracefully | Delete a question server-side, then sync a device that previously had it | The question disappears locally; no crash | | |
| 3.N3 | One bad row doesn't break the whole sync | If a malformed question exists in the seed data, sync anyway | That one row fails/is skipped; the rest of the batch still syncs | | |
| 3.N4 | Low device storage doesn't corrupt data | If reproducible: sync on a device close to full storage | Fails gracefully rather than writing a corrupted local database | | |
| 3.N5 | Slow/throttled network doesn't permanently fail sync | Throttle network speed heavily, run a full sync | Sync takes longer but still completes rather than timing out permanently | | |
| 3.N6 | Overlapping sync triggers don't corrupt state | Rapidly background/foreground the app several times during sync | No corruption from two syncs running over each other | | |
| 3.N7 | Backend restart mid-sync is recovered from | Restart the backend while a device is mid-sync | Client retries/resumes rather than getting permanently stuck | | |
| 3.N8 | Ambiguous seed data doesn't break the quiz screen | Encounter a question with a data-quality issue, if any remain (e.g., correct answer as a value not a letter) | Quiz screen still renders with *a* resolved correct answer, not a blank/crashed screen | | |

### Edge

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 3.E1 | Exam with zero synced questions | Find/create an exam with no questions yet | Shows "not synced yet" or equivalent, not a negative/undefined count | | |
| 3.E2 | Very large single topic | Open a topic with hundreds/thousands of questions | Loads without freezing | | |
| 3.E3 | "All Levels" randomization at scale | Practice "All Levels" for a large question pool repeatedly | Each session is a genuinely varied, non-repeating set within itself | | |
| 3.E4 | Large bookmark list | Bookmark a large number of questions (dozens+) | Bookmarks screen still loads and scrolls acceptably | | |
| 3.E5 | Mock section requesting more than available | Find/construct a mock section where fewer questions exist than the section calls for | Shows "only X of Y available" correctly, doesn't crash or duplicate questions to fill the gap | | |
| 3.E6 | Rapid exam-switching mid-load | In Practice, quickly switch between two different exams before the first finishes loading | The correct exam's data ends up displayed — no stale cross-exam data shown under the wrong heading | | |
| 3.E7 | Very large demo history loads acceptably | Open Progress/History for the demo account (100+ sessions) | Loads without a long freeze | | |
| 3.E8 | Clean reinstall at scale | Uninstall and reinstall the app, sync again | Fresh sync completes cleanly, no leftover corrupted local state from the previous install | | |

---

## Module 4 — Non-Blocking Startup + Hybrid Online/Local Sync

**Requirement (from the user's own spec):** synchronization must never be a
prerequisite for using the app. It opens immediately, works online-first
against the backend while local sync is still catching up, and switches to
local data once sync completes — with status visible, never blocking, in
More/Settings.

### Positive

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 4.P1 | First launch (online) opens instantly | Fresh install, open with internet on | Opens straight to Home — no blocking screen at any point | | |
| 4.P2 | All tabs work immediately | Right after a fresh online launch, tap every tab | All reachable and tappable right away | | |
| 4.P3 | Sync indicator is visible but small | Observe the screen while a first sync runs | A non-blocking indicator shows progress; nothing takes over the screen | | |
| 4.P4 | Practice shows live real data pre-sync | Open Practice within the first few seconds of a fresh, online launch | Real exam names and correct-looking counts appear, not an empty state | | |
| 4.P5 | Mock Test shows live real data pre-sync | Same timing, open Mock Test | Real papers with correct counts and marking schemes listed | | |
| 4.P6 | A full mock test can be completed live pre-sync | Before sync finishes, start and complete a mock test | Test runs and completes normally with a real, correctly-sized question set | | |
| 4.P7 | Sync finishes in the background unattended | Leave the app open/in-use until sync completes | Reaches 100% without special user action | | |
| 4.P8 | Switches to offline-local after completion | Once sync shows complete, enable airplane mode and browse | Content still loads with no internet | | |
| 4.P9 | Previously-synced device works fully offline | On an already-synced device, go offline and reopen | Everything works normally | | |
| 4.P10 | More shows accurate "syncing" state | Open More while sync is running | Shows a syncing indicator with progress | | |
| 4.P11 | More shows accurate "up to date" state | Open More after sync completes | Shows "up to date" + correct last-synced time | | |
| 4.P12 | Manual Sync Now works | Tap Sync Now when already synced | Runs a fresh check, status updates afterward | | |

### Negative

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 4.N1 | Offline + never synced shows a clear message | Fresh install with airplane mode on before first open | Clear "connect once to download" message, not a generic error or blank screen | | |
| 4.N2 | Failed sync shows Retry, old content stays usable | Point the app at an unreachable server, or otherwise force a sync failure | Clear "sync failed" + Retry shown; nothing previously downloaded is lost or blocked | | |
| 4.N3 | Network loss mid-sync fails gracefully | Disconnect network partway through a sync | Pauses/fails gracefully, no crash or infinite hang | | |
| 4.N4 | Killed app mid-first-sync doesn't corrupt data | Force-kill the app during a first sync, reopen | No corruption, no restart-from-zero | | |
| 4.N5 | Live mock-test start fails gracefully if backend is unreachable | Attempt to start a live mock test with the backend down | Clear failure message, not a crash or infinite spinner | | |
| 4.N6 | Double-tapping Sync Now doesn't start two syncs | Tap Sync Now twice quickly | Only one sync runs; the second tap is a no-op, not a second overlapping sync | | |
| 4.N7 | A genuinely empty live result shows an honest empty state | Browse a topic that live-mode returns zero questions for | Shows a proper "nothing here" state, not an error | | |
| 4.N8 | No data + no connectivity on Progress screen | Open Progress/History with no local data and no connectivity | Appropriate message, not a crash | | |
| 4.N9 | A sync failure doesn't delete prior successful content | Force a sync to fail partway through, on a device with some content already locally synced | Nothing previously synced is deleted or corrupted | | |
| 4.N10 | Retrying after fixing connectivity succeeds | After 4.N3/4.N2, restore connectivity and retry | Sync completes cleanly | | |
| 4.N11 | Rapid airplane-mode toggling doesn't wedge the app | Toggle airplane mode on/off repeatedly during a first sync | App doesn't end up stuck (permanent spinner, wrong online/offline state) | | |

### Edge

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 4.E1 | Sync indicator never overlaps the tab bar | At every stage of sync, try tapping each bottom tab | Always responds — indicator never intercepts a tap | | |
| 4.E2 | Backgrounding mid-sync then returning | Background the app during a first sync, return several minutes later | Sync continued/resumed correctly while backgrounded | | |
| 4.E3 | Online-then-immediately-offline before sync starts meaningfully | Go online just long enough to open the app, then immediately offline | Doesn't get stuck — falls back to the offline/never-synced state cleanly | | |
| 4.E4 | Live mock attempt survives a mid-attempt connectivity drop | Start a live mock test, then lose connectivity mid-attempt | Already-fetched questions remain answerable; only submission (if it needs connectivity) is affected, not the whole attempt | | |
| 4.E5 | Sync completing exactly while a screen is mid-fetch | Time it (or repeat several times) so sync finishes right as a screen is fetching live data | No broken half-live-half-local render; the screen ends up showing one consistent source | | |
| 4.E6 | Last-synced time updates on manual re-sync | Note the last-synced time, tap Sync Now, check again | Updates to the new time, not stuck on the original first-sync time | | |
| 4.E7 | Flaky/intermittent connection during first sync | Simulate repeated brief connectivity drops throughout a first sync | Eventually completes, or clearly reports failure — never loops silently forever | | |
| 4.E8 | Signing in mid-sync doesn't lose sync progress | Start a first sync, then sign into an account before it finishes | Sync isn't reset or lost by the sign-in | | |
| 4.E9 | Very fast tab-switching in live mode | Rapidly switch tabs several times while still in live (pre-sync) mode | No flood of duplicate live calls that visibly lags the UI | | |
| 4.E10 | Live paths stay usable on a very slow first sync | Throttle network heavily during first sync | Practice/Mock Test remain usable live throughout, not also blocked by the slow sync | | |
| 4.E11 | Two rapid consecutive cold starts don't double-sync | Force-kill and reopen the app within a second or two, on a never-synced device | Doesn't result in two initial syncs running concurrently and stepping on each other | | |

---

## Module 5 — Practice/Mock Test Navigation + Exit Guard

**Requirement:** Mock Test follows the same Exam → List → Test flow shape as
Practice, instead of showing a flat list of every mockable paper across every
exam as its first screen. Switching to a different module while a Practice quiz
or Mock Test is genuinely in progress shows a "Leave this test?" confirmation
(exact copy: "You are moving to another module. Your current test state may be
lost if you leave now.", buttons Stay/Leave). Stay changes nothing. Leave
terminates the session and completes the navigation the user actually asked
for; the abandoned module shows its home screen the next time it's opened, not
the previous question. Merely browsing, with no session actually started, must
never trigger the warning.

### Positive

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 5.P1 | Mock Test tab opens to Exam Selection | Tap the Mock Test tab from a fresh app state | Shows a searchable exam list, not a flat list of papers | | |
| 5.P2 | Selecting an exam shows only that exam's mock papers | From Exam Selection, tap one exam | Mock list shows only that exam's paper(s), not others' | | |
| 5.P3 | Leave dialog appears mid-test | Start a mock test, then tap a different bottom tab | "Leave this test?" dialog appears with the exact specified copy and Stay/Leave buttons | | |
| 5.P4 | Stay preserves the session | With the dialog showing, tap Stay | Dialog closes; same question, timer still counting down, nothing lost | | |
| 5.P5 | Leave completes the requested navigation | With the dialog showing (triggered by tapping tab X), tap Leave | Lands on tab X — the tab the user actually tapped, not somewhere else | | |
| 5.P6 | Reopening Mock Test after Leave shows Exam Selection | After 5.P5 (from a mock test), tap the Mock Test tab again | Shows Exam Selection, not the abandoned test — confirm via a different generated question/timer if starting again, not just visually | | |
| 5.P7 | Leave dialog appears mid-quiz (Practice) | Start a Practice quiz, then tap a different bottom tab | Same dialog, same copy, same Stay/Leave behavior as Mock Test | | |
| 5.P8 | Reopening Practice after Leave shows Practice's home | After leaving an in-progress Practice quiz, tap the Practice tab again | Shows Practice's Exam Selection, not the abandoned question | | |
| 5.P9 | Normal quiz completion shows no dialog | Answer every question through to the last one and finish normally | Proceeds straight to the summary screen, no Leave dialog at any point | | |
| 5.P10 | Normal mock test submission shows no dialog | Submit a mock test normally (via the Submit button) | Proceeds straight to the result screen, no Leave dialog at any point | | |

### Negative

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 5.N1 | Browsing Exam Selection triggers no dialog | On Mock Test's Exam Selection screen (no test started), switch tabs | No dialog — switches immediately | | |
| 5.N2 | Browsing a Mock List triggers no dialog | On a Mock List for one exam (no test started), switch tabs | No dialog | | |
| 5.N3 | Viewing Test Details triggers no dialog | On the Test Details screen, before tapping Start Test, switch tabs | No dialog | | |
| 5.N4 | Browsing Practice's picker screens triggers no dialog | On Practice's subject/topic/level screens (no quiz started), switch tabs | No dialog | | |
| 5.N5 | Stay never escalates to a forced Leave | Trigger the dialog and tap Stay several times in a row across separate tab attempts | Each time, dialog closes and nothing changes — never auto-leaves | | |
| 5.N6 | Switching directly between Practice and Mock Test also guards | With a Mock Test in progress, tap the Practice tab directly (not via Home) | Same Leave dialog appears — the guard isn't limited to Home-bound switches | | |

### Edge

| ID | Test Case | Steps | Expected Result | Result | Notes |
|---|---|---|---|---|---|
| 5.E1 | Both modules reset independently | Leave an in-progress Mock Test for Practice, immediately start and then leave a Practice quiz too | Both Mock Test and Practice independently show their own home screen afterward, not just the first one abandoned | | |
| 5.E2 | Backgrounding while the dialog is showing | Trigger the dialog, background the app (home button), then return | App resolves to a sane state — dialog still showing or cleanly dismissed, not stuck | | |
| 5.E3 | The pre-existing in-test "Exit" button still works standalone | Mid-test, use the test screen's own "Exit without submitting?" button (not a tab switch) | Behaves exactly as before this feature; a tab switch immediately afterward does not spuriously show a second Leave dialog for an already-ended session | | |
| 5.E4 | Rapid double-tap on another tab doesn't double-show the dialog | Mid-session, tap a different tab twice in quick succession | Only one dialog appears, not two stacked alerts | | |
| 5.E5 | Leaving right as the timer nears zero | Leave a mock test with only a few seconds left on the timer | Leaving works cleanly; the old timer doesn't keep running or auto-submit in the background afterward | | |
| 5.E6 | Tapping the tab you're already on doesn't misfire | Mid-test, tap the Mock Test tab itself (the one currently showing the active test) | Either no-ops cleanly or shows the dialog consistently — does not crash or navigate somewhere unexpected | | |

---

## Summary sheet

| Module | Positive | Negative | Edge | Total | Passed | Failed | N/A |
|---|---|---|---|---|---|---|---|
| 1 — Admin Authentication | 10 | 11 | 8 | 29 | | | |
| 2 — Crash Reporting & Analytics | 9 | 8 | 6 | 23 | | | |
| 3 — Load Testing / Data at Scale | 10 | 8 | 8 | 26 | | | |
| 4 — Non-Blocking Startup + Hybrid Sync | 12 | 11 | 11 | 34 | | | |
| 5 — Practice/Mock Test Navigation + Exit Guard | 10 | 6 | 6 | 22 | | | |
| **Total** | **51** | **44** | **39** | **134** | | | |
