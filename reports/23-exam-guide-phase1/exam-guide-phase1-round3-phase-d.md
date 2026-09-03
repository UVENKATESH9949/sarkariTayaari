# Exam Guide — closing the coverage ledger, Phase D (reminders / push notifications)

**Requested:** continuation of the coverage-ledger closure (see the Phase A/B/C reports in
this folder). This report covers **Phase D**: §8 "Reminder System" — the one phase flagged
in advance as adding a genuinely new capability (a user-facing permission prompt, a new
outbound network dependency) rather than extending something that already existed. Backend
schema: migration **V20**.

## The architectural decision this phase turned on

No push-notification infrastructure existed anywhere in this repo before this session
(confirmed by grep before planning). The natural instinct — a Spring `@Scheduled` job that
wakes up every 15 minutes and sends due reminders — **would not have worked in this
project's actual deployment.** The backend runs on Cloud Run with `--max-instances=3` and
**scale-to-zero** (`reports/14-cloud-run-deployment/`). A `@Scheduled` method only fires
while some instance happens to be alive; on a scale-to-zero service with no other traffic,
that can be never. Building it anyway would have looked correct in local dev (where the
process never stops) and been silently broken in the real deployment — precisely the shape
of bug this project's own history is full of catching.

**Fix:** dispatch is exposed as an explicit endpoint, `POST /api/admin/reminders/dispatch`,
admin-token-protected, meant to be triggered by an external scheduler (Google Cloud
Scheduler hitting it on a cron is the intended production setup — one more piece of
one-time `gcloud` configuration, same category as this project's existing GitHub Actions
repository variables, and outside what this session can provision). This also makes the
feature directly testable via curl rather than a 15-minute wait, which is how it was
actually verified end to end (see below).

## What shipped

**Backend** — `push_tokens` (a device's Expo push token per user, upsert-on-(user, token)
so a reinstalled app doesn't accumulate duplicates) and `user_reminders` (migration V20).
`ReminderService`: register/update a token; create/list/cancel a reminder (ownership
checked — one user cannot cancel another's); `dispatchDueReminders()` sends every unsent,
due reminder via Expo's push HTTP API (`java.net.http.HttpClient`, no new dependency) and
marks it sent regardless of per-token delivery success — a reminder past its time with no
working destination is not something to retry forever, matching how push notifications are
treated everywhere (best-effort, not guaranteed delivery).

**Mobile** — `expo-notifications` installed (`npx expo install`, resolved to the SDK-57-
compatible version automatically, matching the project's existing convention for adding a
native module). `notifications/pushRegistration.ts` requests permission and registers the
device's Expo token on sign-in, fired non-blocking (not awaited) so a slow or denied
registration can't delay sign-in itself. A bell icon on each Important Date row in
`exam-guide.tsx` sets or cancels a reminder, with a lead-time choice (same day / 1 day
before / 3 days before) via a plain `Alert.alert` rather than a new settings screen or a
persisted global preference — a deliberate scope simplification: per-reminder choice is
arguably more useful than one global default, and needed no schema change at all on the
mobile side.

## A real infrastructure gap found and documented, not silently papered over

`Notifications.getExpoPushTokenAsync()` needs an EAS project id to mint a real token — this
app has **no `eas.json` and no `extra.eas.projectId`** anywhere (checked via `npx expo
config --json` before writing the registration code, confirmed empty `extra`). Without one,
token retrieval throws and `registerForPushNotifications` degrades to a no-op — permission
may be granted, but no token ever reaches the backend, so no push can ever be delivered to
that device. This is flagged in the code's own doc comment as a one-time infrastructure
prerequisite (`eas init`), not a bug in what was built this pass — the same category of gap
as the Cloud Scheduler wiring the backend half needs.

## Verified

- Backend: clean `mvn compile`. New `ReminderTest.java` (6 tests) covers token upsert,
  auth requirements, reminder ownership (one user cannot cancel another's), rejecting an
  important-date id that belongs to a different exam, and dispatch being admin-only.
- **A real end-to-end push was attempted against Expo's actual live push service, not
  mocked** — registered a syntactically valid but fake Expo token, created an already-due
  reminder, triggered dispatch with a minted admin token, and confirmed in the backend log
  that Expo's real API was called and correctly responded `DeviceNotRegistered` for the
  fake token; the dispatch summary accurately reported `{"dueCount":1,"sentCount":0,
  "failedCount":1}`, and the reminder was confirmed marked `sent: true` afterward via a
  follow-up read — proving the whole pipeline (serialization, HTTP call, response parsing,
  graceful failure, "mark sent regardless" semantics) works against the real Expo service,
  not just in a unit test.
- Mobile: `npx tsc --noEmit` clean; `npx expo lint` held at the exact pre-existing baseline
  (one new `react-hooks/set-state-in-effect` violation introduced and fixed, matching the
  established convention elsewhere in this file — the early-return branch no longer
  synchronously resets state, consistent with how the `mockSummary` effect in the same file
  already handles the same shape). `npx expo config --json` resolves cleanly with the new
  dependency installed.
- Full backend regression suite re-run after this phase — see `memory/STATUS.md` for the
  final count.

## Not verified

- **Still no on-device/emulator run** — same standing gap as every phase so far. This
  phase specifically needs it more than the others: a real permission prompt, a real
  device token, and real delivery to a real notification tray are exactly the things a
  curl test cannot exercise, and this session has no EAS project id to even attempt a real
  token beyond what's documented above.
- The "Set Reminder" bell icon's actual tap flow (the `Alert.alert` lead-time picker) has
  not been exercised in a running app — reasoned through code only.
- Cloud Scheduler itself was not (and could not be) provisioned this session — the
  dispatch endpoint exists and is proven correct, but nothing calls it automatically yet
  in the deployed environment.
- One harmless leftover: a manually-created test student account
  (`push-verify-<timestamp>@example.test`) from live verification, left behind because
  this app has no user-deletion endpoint to call via curl — same category as this
  project's other documented harmless test artifacts (see `memory/STATUS.md`'s "Deferred /
  known leftovers").

## Next

Phase E (§21 diagnostic test, migration V21) — the last phase in the approved plan.
