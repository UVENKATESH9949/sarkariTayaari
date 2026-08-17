# Motion System and UI Polish

**Status:** ✅ done — base system shipped, then two follow-up sessions fixed a real regression it caused and extended it to screens it had missed.
**Scope:** TICKET-941, plus two unticketed follow-ups. See git commits `6958225`, `e1bb245`, `d66022b`. No report file existed for any of this until now.

---

## The gap

The app had no consistent motion/interaction language — presses had no feedback, lists appeared as a flat instant slab (including the frame or two where a SQLite query hadn't resolved yet, which read as a flicker), and screen transitions used whatever Expo Router defaulted to.

## What changed (TICKET-941, `6958225`)

### Shared tokens (`mobile/src/ui/motion.ts`)
`DURATION` (instant 110ms, quick 180ms, base 260ms, emphasis 420ms), `EASE_OUT`/`EASE_IN_OUT` curves, `PRESS_SPRING` (damping 18, stiffness 320, mass 0.6), `PRESS_SCALE` 0.975, `STAGGER_MS` 45 with a cap of 8 staggered items (so a long list doesn't take visibly longer to finish appearing than a short one).

### `PressableScale`
An `Animated.createAnimatedComponent(Pressable)` that springs to `PRESS_SCALE` on press-in and back on press-out, respecting `disabled`. Replaces plain `Pressable` as the standard interactive-row component.

### `FadeInItem` / `FadeInList`
Wraps a list row so it rises and fades in, staggered by index. Deliberately covers a real, separate problem too: these lists populate from a SQLite query, so they render empty for a frame or two and then fill — without motion that reads as a flicker, with it, it reads as content arriving.

### `AnimatedProgressBar`
Animates a progress bar's width to its new value with `withTiming`, instead of the bar jumping. Applied first in Quiz.

### Navigation (`mobile/src/ui/navigation.ts`)
`STACK_SCREEN_OPTIONS`: `slide_from_right` for normal stack pushes; summary/result screens use `slide_from_bottom`; the Mock Test flow uses `fade`.

Applied at the time to: `practice/index.tsx`, `subjects.tsx`, `topics.tsx`, `levels.tsx`, `mock-test/index.tsx`, `quiz.tsx`.

## Real regression found and fixed (`e1bb245`)

**User-reported: "you changed exam card size. it is not looking good."** `examCard` had `width: "48%"`, measured against `styles.grid`. Wrapping each card in `FadeInItem` inserted a new view between the grid and the card — the *wrapper*, not the card, became the grid's direct child, so the 48% now resolved against the wrapper instead. The card silently stopped being the size it was told to be.

Fixed by giving `FadeInItem` a `style` prop, so the percentage-width class of trouble has somewhere correct to go (the wrapper), and documented this as a general trap in `system-design/04-where-do-i-change-things.md`, since it is exactly the kind of mistake a future wrapper component could repeat.

While in there, the Practice exam list was also redesigned from a 2-column grid to a single-column list (matching Subjects/Topics/Levels/Mock Test, which already used that pattern) and the previously-decorative search box was wired up to actually filter — both were pre-existing issues, not caused by the animation work, but fixed in the same pass since the user's own feedback ("some styling is missing... think about page layouts") covered both.

A JSX syntax error was hit and fixed along the way (a comment placed inside an arrow function's `return (` created two sibling expressions — moved above the `.map()` call instead).

## Real gap found and fixed (`d66022b`)

Home and Progress had shipped with plain `Pressable` and a raw `View`-width progress bar even after the motion system landed — they simply hadn't been touched in the original pass. Extended: `PressableScale` on Home's Continue Practice button, readiness card, and the two Revise summary tiles; `AnimatedProgressBar` on Progress's per-subject accuracy bars (replacing a raw-width `View` that had been snapping instead of animating).

## Verified

- **The regression fix**: `npx tsc --noEmit` clean, then confirmed on the emulator via `uiautomator dump` text-tree inspection (not screenshots) — full-width list rows, correct per-exam subtitles ("105 questions" / "Not synced yet"), live search narrowing "ssc" to exactly 2 matching exams, "Recommended" section correctly hidden while searching, and a clean restore to the full list on clearing the search.
- **The Home/Progress extension**: `tsc --noEmit` clean; confirmed on-device via `uiautomator` that both screens still rendered all expected content and navigation correctly after the change.

## Honest gaps in verification

- No before/after visual comparison (screenshot diff) was done for any of this — verification was via `uiautomator` text-tree dumps confirming structure and content, not pixel-level appearance.
- The stagger cap (8 items) and spring physics constants were not user-tested against alternatives — they're a reasonable first choice, not a tuned-and-validated one.
- Motion system coverage was not audited screen-by-screen after the Home/Progress fix — it's plausible other screens still use plain `Pressable` and haven't been found yet.

## Still outstanding

- No systematic audit exists confirming every interactive element in the app uses `PressableScale` rather than plain `Pressable` — the Home/Progress gap was found by inspection, not a sweep, so a similar gap could exist elsewhere undiscovered.
