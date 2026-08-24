# Black + Blue Dark Theme

**Closes:** an explicit user spec ("COMPLETE PREMIUM BLACK + BLUE UI TRANSFORMATION") asking for an unmistakably premium dark identity across the whole app — GitHub Dark / Linear / Vercel-inspired, not copied. Un-ticketed.

## What existed before

A light navy-on-white redesign had just shipped the same session (tokens in `mobile/src/ui/theme.ts`, shared `Card`/`Button`/`Skeleton`/`EmptyState`/`ErrorState` components, ~19 screens converted from hand-rolled hex to those tokens). The user reviewed it on-device and rejected it as insufficient: "The previous UI changes were NOT sufficient... I want a VISIBLE, MAJOR, COMPLETE visual transformation." They then supplied a much more detailed spec for a black+blue dark theme instead, gated on seeing a one-page visual demo first before any code changed.

## What was built

**Demo-first approval.** Built and published an Artifact (`obsidian-theme-demo.html`) — a phone-mockup of the Home screen in the proposed palette (Sora + Manrope fonts). The user approved it verbatim ("yes perfect you understood my req... apply same theme for all pages") with one piece of feedback: don't let content run edge-to-edge, keep real margins. The demo's exact palette became the locked-in token values.

**Token rewrite — `mobile/src/ui/theme.ts`.** New semantic structure, not a value swap on the old light-theme tokens:
- `colors.bg` (`#05070A`), `colors.surface`/`surfaceElevated`/`surfaceElevated2` (`#0A0E14`/`#0D1117`/`#131A26`), `colors.border`/`borderAccent`.
- `colors.text.primary`/`secondary`/`muted` for normal text, and a **separate** `colors.text.onAccent`/`onAccentSecondary`/`onAccentMuted` family for text/icons painted on top of a filled/dark-accent surface.
- `colors.brand.primary` (`#2563EB`) through `.light` (`#60A5FA`), plus `glow`/`glowSoft` for the blue-glow shadow treatment used on primary buttons and the hero card.
- `colors.semantic.{success,warning,error}` + matching `*Bg` overlays.

**Why two text-color families, not one:** an audit of the light-theme pass found `colors.neutral[0]` (`#ffffff`) doing double duty as both "white card surface" and "white text on a colored surface" — a naive value swap to black would have made every card dark *and* every bit of text painted on those cards go dark-on-dark and disappear. Splitting `surface*` from `text.onAccent*` into distinct token families up front was the fix, verified by re-deriving every `Card`/`Button` call site's role (surface vs. on-accent) individually rather than a blanket find-and-replace.

**Core components re-skinned:** `Card.tsx` (`elevated`/`container` → `surfaceElevated` + `border`; `filled` changed from a solid blue fill to a dark `surfaceElevated2` background with a blue-tinted border and glow shadow — closer to the approved demo's "dark hero card with glow" than a flat color block), `Button.tsx` (glow shadow on `primary`, transparent background + blue border on `secondary`), `Skeleton.tsx`/`EmptyState.tsx` icon circles, `AnimatedProgressBar.tsx` defaults.

**Navigator-level fix, not just component-level:** `mobile/src/ui/navigation.ts`'s `STACK_SCREEN_OPTIONS` gained `contentStyle: { backgroundColor: colors.bg }` (Stack's own background prop) and `mobile/src/app/(tabs)/_layout.tsx`'s `<Tabs>` gained the equivalent `sceneStyle`. Native headers also themed (`headerStyle`/`headerTintColor`/`headerShadowVisible`).

**Every screen converted** — `(tabs)/index.tsx`, `progress.tsx`, `more.tsx`, all of `practice/*` and `mock-test/*`, `account.tsx`, `revise.tsx`, plus shared pieces (`OfflineBanner.tsx`, `OfflineNoDataNotice.tsx`, `LanguagePickerModal.tsx`, `constants/subjects.ts`) that had raw hex outside the main per-screen pass.

## Real bugs found and fixed

1. **Screens rendered light gray despite dark cards.** Cards, buttons, and the tab bar were correctly dark, but the overall screen background stayed the OS-default light gray, because no navigator-level `contentStyle`/`sceneStyle` had ever been set — each screen's own `<View>`/`<ScrollView>` background was dark, but the space *around* it wasn't. Not caught by `tsc`/lint; only found by actually looking at a device screenshot. Fixed via the navigator-level change described above.
2. **"Welcome back" overlapping the status bar clock**, reported by the user with a screenshot, on Home and (per the user) "all pages". Root cause: an earlier fix in this same session that added `headerShown: false` to Home/Progress/More (to stop a duplicate-title bug) had also silently removed the native header's implicit safe-area top padding, which those three screens had been relying on without knowing it. Fixed by adding `useSafeAreaInsets()` to `(tabs)/index.tsx`, `progress.tsx`, and `more.tsx` and using `insets.top + spacing.xl` as the scroll container's top padding — scoped only to those three screens, since Practice/Mock Test keep real native headers and were never affected.

## Verified

On the Android emulator, via `adb`/`uiautomator` screenshots (not just re-reading the code): Home, Progress, and More screens after both fixes above, showing correct dark backgrounds edge-to-edge and no status-bar overlap. `npx tsc --noEmit` clean after every phase. The demo Artifact was reviewed and explicitly approved by the user before any production code was touched.

## Honest gaps

- No automated visual-regression test exists for this app (none exists for the project at all) — verification was on-device screenshots of the screens actually touched each phase, not an exhaustive click-through of all ~20 screens in one final pass.
- Phase 8 of the original redesign plan (a TanStack Query caching layer, unrelated to color) was never started — the app still uses hand-rolled `useEffect`+`useState` for data fetching.
- `/revise` (`mobile/src/app/revise.tsx`) **appeared** to show the old light theme in one on-device screenshot taken later in the same overall session, while testing an unrelated feature — but that same testing session also produced several confirmed stale-framebuffer screencap glitches (verified separately, fixed by toggling the screen off/on to force a display refresh), and this particular observation was never re-checked with that same reliable method before the emulator was closed. `git diff` confirms the file *was* touched during the token-conversion pass. Flagging this as **unconfirmed, needs a real re-check** rather than asserting it as a fixed bug — exactly the distinction this project's verification culture exists to enforce.
