# Offline Connectivity Indicator

**Status:** ✅ done, verified live on the emulator by forcing real connectivity loss (not just code inspection).
**Scope:** TICKET-405. First scoped in Sprint 4, still open as of `reports/03-sprint-3-sync-engine/delta-sync.md` (2026-08-15: "nothing in the app currently detects connectivity"), closed this session.

---

## The gap

Before this, "offline" only existed as a side effect: if a delta sync failed, `SyncBanner` showed a generic error ("Couldn't check for new content..."). That's wrong for the common case — a phone with no signal isn't experiencing a *failure*, it's in a completely normal, expected state for an offline-first app. Reporting it as an error every time a student opened the app on a train was the wrong message, and it meant a sync was still being *attempted* (and timing out) every time, for no benefit.

## What changed

### Detection
`NetworkStatusContext` wraps `@react-native-community/netinfo`. Two deliberate defaults, both to avoid false positives:
- `isOnline === null` (not yet known — happens for a frame on cold start) is treated as **online**, not offline, so the app doesn't flash an incorrect offline banner before the first real event arrives.
- `isInternetReachable === null` (NetInfo genuinely undecided, which is common right after a network transition, e.g. switching from Wi-Fi to mobile data) is also treated as online, to avoid the banner flapping on and off during a normal handoff.

### The banner
`OfflineBanner` — a small, calm, persistent banner at the top of the screen: "You're offline — using downloaded content." Deliberately *not* alarming, since everything already downloaded keeps working fully; this is informational, not an error state. Rendered above the navigation stack in `_layout.tsx` so it's visible regardless of which screen is open.

### Sync behavior changed to match
`SyncContext.refresh()` now checks `isOnline` (via a ref, not a dependency — see "why a ref" below) before doing anything, and returns immediately if offline. No network call is attempted, no timeout occurs, and critically, **no `refreshError` is set** — offline is not an error condition and must never be reported through the same channel as one.

A second effect watches for the transition from offline back to online and fires an immediate **forced** sync the moment it happens, rather than waiting for the next scheduled trigger (foreground, or the 15-minute staleness window). Reconnecting after an outage is exactly the moment a student is most likely waiting on something new.

### Why a ref, not a dependency, for `isOnline` inside `refresh()`
`refresh` is a memoized callback captured once by the `AppState` foreground listener and by other long-lived effects. If `isOnline` were a normal dependency, changing it would recreate `refresh` — but the *existing* closures already holding the old `refresh` (e.g. an in-flight call, or a listener that hasn't re-subscribed yet) would still see the stale value. Reading through a ref (`isOnlineRef.current`, kept in sync via `isOnlineRef.current = isOnline` on every render) means every caller, including ones holding an old reference to the function, always sees the current connectivity state. Without this, a phone that went offline mid-session could keep attempting (and timing out on) network calls from a stale closure.

### Sign-in specifically
`account.tsx` now checks `isOnline` before attempting sign-in/sign-up, and shows "You're offline. Connect to the internet to sign in." immediately, rather than letting the request go out, time out, and surface a raw network-error message. This is the one place in the app where being offline actually blocks an action (signing in genuinely needs the server), so it's the one place that needed an explicit pre-flight check rather than just letting existing content keep working.

## A real, non-obvious debugging detour this surfaced

Verifying this required a build that live-reloads from Metro. The emulator turned out to be running a **release APK** — a full standalone build with the JS bundle baked into `assets/index.android.bundle`, not connected to Metro at all (confirmed via `dumpsys package | grep -i debuggable` showing no `DEBUGGABLE` flag, and by pulling the installed APK and finding the embedded bundle directly). Every earlier verification in the same sitting that appeared to reflect code changes had actually been checking whatever build happened to be installed at that moment — not live code.

Fixed by building a debug dev-client (`npx expo prebuild --platform android` to regenerate the native project so the newly-added `@react-native-community/netinfo` native module was autolinked, then `npx expo run:android --variant debug`, ~24 minutes). Installing it and pointing it at Metro via `10.0.2.2:8081` (not the LAN IP the build tool suggested by default, which the emulator cannot route to) restored real live-reload verification.

**Lesson for next time:** if on-device verification of a mobile change stops reflecting edits, check whether the installed build is even connected to Metro (`curl http://localhost:8081/json` — an empty array means nothing is connected) before assuming the code is wrong.

## Verified

All of the following were confirmed live, with real connectivity actually cut (`adb shell svc wifi disable && adb shell svc data disable`, confirmed via `adb shell dumpsys connectivity` showing "Active default network: none") — not just code-reading:

- The offline banner appears when connectivity is cut and disappears when it's restored.
- No misleading "sync failed" error appears while offline (the older `SyncBanner` error path was not triggered).
- Practice's exam list, question counts, and search all continued to work fully with connectivity cut.
- Reconnecting triggered a fresh sync automatically, without needing to background/foreground the app or wait.

## Honest gaps in verification

- **The reconnect-triggers-immediate-sync behavior was observed to fire, but the *timing* (immediate vs. some small delay) wasn't precisely measured** — it was confirmed to happen "promptly," not benchmarked.
- **The sign-in pre-flight check (`account.tsx`) was verified by code/type-check, not by actually attempting a sign-in while offline on the device.**
- **No test exists for the specific race the `ref`-not-dependency fix targets** (a phone going offline mid-flight of an already-in-progress sync call). The fix is reasoned through, not proven under that exact condition.

## Still outstanding

- No equivalent offline pre-flight message exists for progress/bookmark sync attempts specifically — those already silently queue and retry via the existing `isSynced` flag mechanism, which is correct behavior, but there's no UI that tells a signed-in student "this hasn't backed up yet because you're offline," the way sign-in now does.
