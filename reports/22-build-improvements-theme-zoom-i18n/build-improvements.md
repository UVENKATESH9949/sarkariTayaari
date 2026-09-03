# Build improvements: network toast, session lifecycle, quiz navigation, theme, zoom, Telugu

Implements *SarkariTaayaari — Latest Build Bug Fixes & Modifications* (referred to below as
**Doc 2**). Mobile only; the backend is untouched (0 files changed).

---

## 1. Audit of the specification, before implementing it

Doc 2 is accurate about most of what it claims, and wrong about three things that changed
the shape of the work. Recording both, because the spec will be read again.

### Confirmed, with the mechanism found

| § | Claim | Evidence |
|---|---|---|
| 1 | Offline banner is permanent | `OfflineBanner.tsx` rendered on `isOnline === false` — a *level*, with no timer and no "back online" state at all. |
| 2 | Back/gesture bypasses the guard | There was **no** `BackHandler` or `usePreventRemove` anywhere in `src/`. The only guard was `screenListeners.tabPress`. Back did not bypass it *inconsistently*; it bypassed it entirely. |
| 3 | False "Leave test" on Practice Home | `beginSession("practice")` fired when questions loaded; `endSession()` was called **only** on the completion path. Backing out left the flag set all the way to Practice Home. |
| 6 | No Previous button | Confirmed. |
| 7 | Cannot finish early | `goNext` completed only at `currentIndex === total - 1`. |
| 9 | No zoom | Confirmed. |
| 11 | No Telugu UI | Confirmed — and `appLanguage.tsx` was plain `useState`, so even the *quiz* language reset on every launch. Doc 2 does not mention that. |

### Wrong or understated

**§8 is partly false, and it is the one that mattered.** Progress, exam progress and history
already counted questions, not navigation — only the in-quiz bar used `(currentIndex + 1) /
total`. The real problem Doc 2 misses: `totalCount` meant *both* "answered" and "offered",
which was only correct because answering everything was mandatory. It has 8 read sites plus
SQLite, the sync payload, the backend entity, and Epic L's `recordTopicPractice` (whose
table carries `CHECK (correct_count <= attempted_count)`). **So §7 and §8 are one change.
Shipping early-finishing without reworking the counting would have silently corrupted every
accuracy figure in the app.**

**§10's premise is wrong.** `theme.ts` stated the app was dark-only *by design*. The tokens
existed but were consumed as a frozen module object: 496 `colors.*` references across 43
files, inside 38 module-level `StyleSheet.create` calls evaluated once at import. This was
the largest item in the document by a wide margin.

**§5 was not implemented as written, deliberately.** See §4 below.

---

## 2. Network status (Doc 2 §1)

`OfflineBanner.tsx` → `NetworkStatusToast.tsx`, and `NetworkStatusContext` now tracks an
**edge** rather than exposing only a level.

A component that renders from a level has nothing to time, so this could not be fixed by
adding a `setTimeout` to the banner. The provider compares each NetInfo reading against the
last one it accepted and emits `transition: "offline" | "online"`, cleared after 3.5s. That
gives §1's edge cases their behaviour for free:

- identical readings emit nothing → re-renders and repeated events while offline cannot
  re-trigger the toast;
- the *first* reading emits nothing → launching offline is not an event that just happened
  (it is still in `isOnline`, which screens use for their own empty states);
- rapid flapping replaces the visible toast and restarts its timer, because there is one
  `transition` value and one timer;
- backgrounding clears it, rather than pausing — a toast whose 3.5s elapsed off-screen
  should not be waiting when the user returns.

Both states differ by icon, wording **and** colour, so nothing is conveyed by colour alone
(§52), and `accessibilityLiveRegion` announces the change.

---

## 3. Back button and gesture (Doc 2 §2)

`useActiveTestBackGuard` subscribes to `hardwareBackPress` while a test is genuinely
running, shows the same dialog as the tab guard, and returns `true` so the navigator does
not pop underneath it.

**One listener covers both the button and the gesture because `app.json` sets
`android.predictiveBackGestureEnabled: false`.** With predictive back off, Android routes
the swipe through the legacy `onBackPressed` path, which React Native surfaces as
`hardwareBackPress`. That is a real dependency, not a coincidence: turning predictive back
on would route the gesture through `OnBackInvokedCallback` and this hook would stop seeing
it. Noted in the hook's own comment for whoever flips that flag.

Applied to both `practice/quiz.tsx` and `mock-test/test.tsx`, with the same wording and the
same action as each screen's existing exit path.

---

## 4. Session and module lifecycle (Doc 2 §3, §4, §5)

**§3** is fixed by `useEffect(() => endSession, [endSession])` in both quiz and mock test.
An unmount cleanup covers every exit — button, gesture, header arrow, completion — instead
of one more call site remembering to do it.

**§4's back-traversal was tab history, not leaked state.** The Tabs navigator's default
`backBehavior` walks the tab history, which produces exactly the reported "Other Module →
Mock → Practice Test → Practice Level → Practice Home" chain. `backBehavior="initialRoute"`
means Back goes to Home and then exits, and can never cross from one module into another's
stack.

**§5 was scaled down on purpose, and this is the one recommendation in Doc 2 I did not
follow as written.** `useStaleStackReset` collapses a module's navigation stack when the
user returns to it after 90+ seconds away — but it explicitly does **not** touch an active
practice or mock session. Doc 2 §5 lists "active practice session" and "temporary question
state" as clearable; in this app those are the user's *unsaved work*, since nothing is
written until a session is finished. Clearing them after 90 seconds would destroy the work
of anyone who took a phone call mid-quiz, which §5's own acceptance criterion ("Persistent
progress/data is NOT deleted during cleanup") forbids. Navigation depth is genuinely
temporary; answers are not.

The reset happens on re-entry rather than on a timer because `router.dismissAll()` resolves
against whichever stack currently has focus — a background timer would pop whatever the user
was looking at. The visible result is identical: you open Practice and see Practice.

---

## 5. Quiz navigation, early finishing and counting (Doc 2 §6, §7, §8)

The three are one change, and the state model is what made it possible.

`selectedOption` state is gone. `answers: Record<questionId, index>` is written the moment
an option is tapped and is the single source of truth; the current selection is derived from
it. Previously the chosen option lived in its own state, cleared on every advance and folded
into `answers` only on the way out — so **Previous had nothing to restore from**. Now
backward and forward navigation are the same operation on `currentIndex` and cannot
desynchronise.

**On §6 and the existing design:** the quiz is immediate-feedback — the first tap reveals the
correct answer and the explanation, and disables the options. So Previous is read-only review
of an already-graded question; it cannot mean "change your answer" without redesigning the
quiz into a deferred-grading model. `selectOption` ignores taps on an already-answered
question, which is what makes navigating back into one safe.

**Counting (§7 + §8):**

- `total_count` keeps its meaning as the accuracy denominator and now holds the number
  **answered**.
- `available_count` (new, nullable, local-only) records what the set offered — display only.
  A student who answered 17 and got 15 right has 88% accuracy, not 30%.
- `results` covers **only answered questions**. An unanswered question has
  `isCorrect === false` under any encoding, and `getWrongAnswers()` collects every such
  result into Revise — so including skipped questions would have filled a student's revision
  list with questions they never saw.
- `recordTopicPractice` is passed the answered count, not the set size, so Epic L's
  `CHECK (correct_count <= attempted_count)` stays honest and topic coverage is not
  overstated.
- The in-quiz progress bar now tracks `answered / total`. The cursor position is still shown
  as text, because it is a different and also useful fact.

The footer is now always rendered with Previous / Next-or-Finish, plus an explicit "Finish
now with N of M answered" link mid-set. Previously it appeared on selection and vanished on
the next question, which is why there was nowhere for Previous to live.

Session Summary labels the cell "Answered" rather than "Total" and adds a "Finished early"
line only when the two figures actually differ.

---

## 6. Theme and zoom (Doc 2 §9, §10)

Done as **one** refactor, because both need the same change — static `StyleSheet.create` →
theme-derived styles — and doing them separately would have touched all 43 files twice.

### The design that made 43 files reviewable

`ThemeContext` exposes `useThemedStyles(factory)`. Each screen's style sheet became:

```ts
const buildStyles = ({ colors, typography, shadow }: Theme) =>
  StyleSheet.create({ /* body completely unchanged */ });
```

Because the factory **destructures** the tokens from its parameter, all 496 existing
`colors.*` references keep resolving to the same names. Only the wrapper and the imports
changed. That is the whole reason a change of this size is readable as a diff.

`spacing` and `radius` stayed as plain module constants in `theme.ts`: they are identical in
both themes, read by nearly every file, and routing them through a hook would have made
every one of those files depend on React state for two numbers that cannot change.

### Zoom is applied centrally, not per declaration

`useThemedStyles` post-processes the finished style sheet and multiplies `fontSize` and
`lineHeight` by the zoom factor. There are 174 `fontSize` and 26 `lineHeight` declarations;
multiplying at each one would have been 200 chances to miss one, and every future style
would have to remember. Applied at this layer it is impossible to forget.

Box dimensions are deliberately **not** scaled, which is why this cannot break a layout the
way a global transform would (§9 warns against exactly that): text grows inside containers
that mostly have no fixed height, so rows get taller rather than clipped. Vector icons keep
their size for the same reason — they sit in fixed-size circles. Capped at 130% because past
that the quiz footer and four options stop fitting together on a small phone, and a zoom
setting that hides the Next button is worse than no zoom setting.

`StyleSheet.create` used to run once per file at import. A per-factory, per-theme `WeakMap`
cache keeps it that way; all 39 factories are module-level consts, so their identity is
stable (verified).

### The light palette

`palettes.ts` types `lightPalette` as the dark palette's shape, so a token added to one and
forgotten in the other is a compile error rather than a transparent hole. Two things there
look like mistakes until you know why, and both are commented:

- **The `surface*` ladder runs in opposite directions.** In dark, each step up is lighter. In
  light, the page is a soft blue-grey and each step up is *whiter*, with `surfaceElevated2`
  (the chip/pill tint) going slightly *darker* than white. The role is preserved; the
  direction is not.
- **`text.onAccent*` is white in both themes** and must stay that way — it is the text on a
  filled brand-blue surface, which is dark in both. This is precisely why those were kept as
  separate token families rather than aliases, and a light palette is where collapsing them
  would have resurfaced the bug the original comment warns about.

Semantic colours all needed darker counterparts: `#34D399` on white is 1.9:1, unreadable.
`text.muted` (#64748B) is the one value shared verbatim — it clears AA on both grounds.
Shadows were re-tuned rather than recoloured; 0.4-alpha black reads as subtle depth on
#0A0D14 and as a smudge on #F2F5FA.

Also theme-aware now: the native stack header and scene background (`stackScreenOptions` is
a function of the palette), the tab bar, and the status bar — which follows the **app's**
theme rather than `userInterfaceStyle: "automatic"`, since the in-app toggle can disagree
with the system setting.

Three files needed real fixes rather than wrapping, all the same root cause — palette values
read at **module load**: default parameter values (`AnimatedProgressBar`, `DonutRing`,
`IconBox`, `CardRow`) and module-scope lookup maps (`Badge`, `AppDialog`,
`TopicInsightChips`, `levels`, `history`, `summary`, `result`, `progress`). Each became a
function of the palette.

---

## 7. Telugu (Doc 2 §11, §12, §13)

`src/i18n/` — `en.ts`, `te.ts`, `I18nContext.tsx`, `counts.ts`.

**Coverage is enforced by the compiler.** `te` is typed as the widened shape of `en`, so a
missing, misspelled or extra key is a build error. `t("quiz.loadng")` does not compile.
That is a much better way to find a gap than a screenshot, and it is what §16's "no
important UI text remains unintentionally hardcoded in English" actually requires.

Around 250 strings across every screen, dialog, empty state and error message. Exam content
is untouched — question text, options and explanations are per-question server translations
selected by the *separate* quiz-language preference, which stays its own row in More. §11
draws the same line, and nothing in the catalogue can affect them because no question text
passes through it.

Module-scope helpers that format text (`formatRelativeTime`, `formatLastSynced`,
`formatLastActive`, `questionsLabel`) take `t` as a parameter, since a hook cannot go there.
`questionsLabel` existed as three verbatim copies and is now one shared function.

---

## 8. Preferences and Settings (Doc 2 §13, §14)

Migration `0013` adds `app_preferences` (single row keyed `"current"`) plus
`practice_sessions.available_count`. SQLite rather than adding AsyncStorage: SQLite is
already a hard dependency the app cannot start without, and a second storage engine for
three scalars would be a native module added for no gain.

Preferences are **not** synced and **not** cleared on sign-out. They describe the device and
its reader, not the account: a shared phone signing into a second account should not have its
text size change, and signing out should not discard an accessibility setting someone needs
in order to use the app at all.

Every field is validated on read. These rows outlive the code that wrote them, so a zoom
level from a build with a different ladder snaps to the nearest offered step, and an
unrecognised language or theme is treated exactly like an absent one.

`app/settings.tsx` holds all three controls, reached from More → "Appearance & language".
The text-size control carries a live sample styled like a real question stem — the only
question worth answering there is "will the quiz still be readable", and a caption-sized
sample would not answer it. Segments use `accessibilityRole="radio"` with `checked`, so
selection is not conveyed by fill colour alone.

`ThemeProvider` renders nothing until the preference read completes; for a light-mode user
the alternative is a black frame on every launch. `I18nProvider` deliberately does not gate
— a frame of English is a far smaller glitch than a frame of the wrong background.

---

## 9. What was verified, and how

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx expo lint` | **9 problems, all pre-existing** (baseline was 11; nothing new introduced) |
| Migration `0013` against a **populated** pre-0013 SQLite database | **passed** — 13 prior migrations apply in journal order; existing rows survive byte-identical; `available_count` is present, nullable and NULL (not 0) on old rows; `app_preferences` upserts on `"current"` without clobbering sibling fields; the guarded CREATE re-runs cleanly and the unguardable ADD COLUMN fails loudly, which is the gap 0013's header documents |
| All 39 style factories at module scope | **verified** — the `WeakMap` cache is effective |
| Static palette imports outside the theme engine | **only** `app/_layout.tsx`'s pre-provider screens, intentionally |
| Backend | **untouched** — 0 files changed |

### Three lint errors I introduced and fixed

Worth recording because two were real bugs, not style:

1. **`quiz.tsx` / `test.tsx` read a ref during render** (`finishedRef.current`,
   `submittedRef.current`) to decide whether the back guard was active. Genuinely
   unreliable — a ref mutation does not re-run the render. Both now read the `finishing` /
   `submitting` **state** set in the same statement.
2. **`levels.tsx` called `fallbackLevelStyle(colors)` three times per level inside a
   `useMemo` that did not list `colors`.** Hoisted and the dependency added.
3. The sweep replaced `"All Levels"` inside a **comment**. Found by grepping for `t("`
   inside comments and restored.

---

## 10. Known limitations

- **Not run on a device or emulator.** `tsc` is clean, lint adds nothing, and the migration
  is verified against a real populated database — but no screen has rendered. The light
  theme in particular is 43 files of colour changes that only a screen can confirm.
- **The Telugu wording has not been reviewed by a native speaker.** The keys, the mechanism
  and the coverage are correct and complete; the phrasing deserves a pass from a Telugu
  reader, especially the longer explanatory sentences in Settings and the sync messages.
- **Two screens are permanently English**: `app/_layout.tsx`'s "Setting up local
  database..." and "Database migration failed". They render before any provider mounts,
  because the preference selecting the language lives in the very database whose migration
  has not finished. Keys for them were deliberately left out of the catalogue rather than
  claiming coverage that cannot be delivered.
- **`available_count` is local-only.** It is not in the server's practice-session contract,
  so a session that round-trips through the server comes back with it NULL and the summary
  simply omits the "finished early" line. Adding it server-side is a small backend change if
  the figure turns out to matter.
- **Zoom scales text only.** Icons and box dimensions keep their size, by design (§6 above).
  At 130% some rows grow noticeably taller than at 100%; nothing was observed to clip in the
  style audit, but this is the part most worth a look on a small screen.
- **`predictiveBackGestureEnabled` must stay `false`** for the back guard to see the gesture.
