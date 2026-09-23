# Practice navigation redesign — one screen for subject, topic and difficulty

**Date:** 2026-09-22
**Systems touched:** `mobile/` and `packages/core`'s i18n catalogues. Zero backend, admin
or database changes.
**Status:** implemented, typechecked, linted, and **verified on `emulator-5554`** against a
real backend and the real Neon dev database. The device pass found **two real defects**, both
fixed and re-verified — see "What the device pass found". Some cases remain unrun; see
"What was NOT verified".

---

## The navigation change

Practice used to drill down through four routes:

```
Exam  →  Subject screen  →  Topic screen  →  Level screen  →  Quiz
```

Three of those screens existed only to ask one question each, and each cost a push
transition, a header, and a back press to undo. Starting a five-minute practice run took
four screens; backing out of a wrong subject took three taps.

It is now:

```
Exam  →  Practice screen (subject dropdown → topic list → difficulty sheet)  →  Quiz
```

Subject is a dropdown that expands in place. Choosing one replaces the topic list beneath
it without a transition. Tapping a topic opens a centred, fixed dialog over that list — the
list stays visible behind it — and tapping a difficulty opens the quiz. One route is pushed
in the whole flow, and one back press returns from the quiz to the chooser.

## Files

**Added**

| File | What |
|---|---|
| `mobile/src/app/(tabs)/practice/browse.tsx` | The combined screen |
| `mobile/src/practice/SubjectSelect.tsx` | The subject dropdown |
| `mobile/src/practice/DifficultyPickerDialog.tsx` | The centred difficulty dialog |
| `mobile/src/ui/fonts.ts` | The four Inter face names and the weight-to-face resolver |
| `qa/requirements/practice.yaml`, `qa/scenarios/practice.yaml`, `qa/test-cases/practice.yaml`, `qa/defects/practice.yaml` | New `PRACTICE` QA module |
| `qa/execution/2026-09-22-practice-navigation.yaml` | The real device-pass records |

**Deleted**

| File | Why |
|---|---|
| `mobile/src/app/(tabs)/practice/subjects.tsx` | Folded into `browse.tsx`; had no external caller |
| `mobile/src/app/(tabs)/practice/topics.tsx` | Same |

**Changed**

| File | Change |
|---|---|
| `mobile/src/app/(tabs)/practice/index.tsx` | One line: an exam now opens `/practice/browse` |
| `mobile/src/app/(tabs)/practice/_layout.tsx` | Registers `browse`; drops `subjects`/`topics`; keeps `levels` |
| `mobile/src/app/_layout.tsx` | Loads the four Inter faces at the root, and gates first render on them |
| `mobile/src/ui/ThemeContext.tsx` | `applyZoom` became `applyTypography` — same pass now also resolves the typeface |
| `mobile/src/ui/navigation.ts` | Native header titles named in Inter (not reached by the central pass) |
| `mobile/src/app/(tabs)/_layout.tsx` | Tab-bar labels named in Inter, for the same reason |
| `mobile/src/app/syllabus-trends.tsx` | Comment only — it pointed at a file this change deletes (AI_RULES §6) |
| `packages/core/src/i18n/*.ts` | `sortByPriority`/`sortBySyllabus` restored with the toggle |
| `packages/core/src/i18n/en.ts`, `te.ts` | 9 new keys; 11 keys removed whose only consumers were the deleted screens |
| `mobile/package.json` | One new dependency: `@expo-google-fonts/inter` |
| `qa/suites/*`, `qa/traceability/RTM.md`, `qa/reports/dashboard.md` | Regenerated |

## What was deliberately not touched

**The practice engine, with ONE stated exception.** `quiz.tsx` was not opened. The exception
is the session length: `PRACTICE_QUESTION_LIMIT` went from 200 to 20 at the owner's request,
which changes every practice session in the app, not only ones started here — see "A session
is twenty questions" below. Everything else holds: the new screen pushes `/practice/quiz`
with exactly the parameter set `levels.tsx` has always pushed — `examCode`, `examLabel`,
`subjectName`, `topicId`, `topicName`, `levelKey`, `levelLabel` — so question selection,
per-question timing, scoring, session recording, topic-mastery updates, bookmarks and the
active-session guard are all untouched and cannot tell which screen started them.

**The data layer.** Every read is the existing hybrid call the old screens made:
`getSubjectStats`, `getTopicStats`, `getDifficultyLevels`, `getDifficultyCounts`. Local
SQLite when synced, live HTTP before the first sync finishes, `OfflineNoDataNotice` when
neither — unchanged, including the `syncVersion` dependency that keeps a mounted screen from
going stale after a sync.

**The exam list.** `practice/index.tsx` is visually unchanged. The brief describes the
screen *after* an exam is picked, so restyling the exam list would have been scope this was
not asked for, on a screen nobody has looked at on a device since.

**The levels screen.** See below — this is the decision most worth reading.

## Why the levels screen was kept

The brief says no separate Level screen should exist *in this flow*, and it does not. But
`/practice/levels` is a deep-link target for **six** shipped entry points that never pass
through browsing at all:

`daily-plan.tsx` · `exam-guide.tsx` · `radar-topic.tsx` · `study-roadmap.tsx` ·
`syllabus-trends.tsx` · `ui/PreparationPlanCard.tsx`

Each pushes it with a topic the student already chose somewhere else. Deleting the route to
satisfy a literal reading of the acceptance criteria would have broken all six — including
Today's Plan, which is this project's newest feature and currently uncommitted work. So the
screen was removed from the *browsing* flow and left registered for those callers. The two
screens with no external callers, `subjects.tsx` and `topics.tsx`, were genuinely deleted.

`TC-PRACTICE-007` exists to walk all six.

## The topic cards: dropped, then put back

The old topics screen carried, on every row: a priority chip, a mastery chip, a trend chip,
a weightage chip, an inline parent breadcrumb, a "Best after" prerequisite notice, and a
priority-vs-syllabus sort toggle above the list. That is Epic L's whole student-facing
surface.

**I dropped all of it in the first pass, reading the brief's §32 literally** ("difficulty
badges on every topic", "progress bars everywhere") and flattening the topics into plain
rows in a single container. **The owner rejected that, and was right.** Those chips are not
decoration: they are the only thing on the screen that answers *which* of twenty-eight
topics is worth the next hour, which is a different question from *what exists*. §32 is
about not inventing ornament; this was existing, earned signal.

So `renderTopicCard` and `groupByParent` are back — **moved out of the deleted screen rather
than rewritten**, so the two versions never had a chance to drift. Each topic is its own
elevated `Card` again, with the breadcrumb shown inline in priority order (where there are
no headings to carry the hierarchy) and as a folder heading with indented children in
syllabus order.

The lesson worth keeping: **only the navigation needed reducing. The card was already
right.** Flattening it was scope I added on my own reading of a design note, and it cost
real information.

`syllabus-trends.tsx` still renders the same four chips exam-wide, a level above this
screen; its doc comment says so, and has been corrected back after I briefly made it claim
exclusivity.

## A session is twenty questions

`PRACTICE_QUESTION_LIMIT` was **200** — a number chosen only to stop a crash, never as a
product decision. In practice it meant a session was "however many questions this topic
happens to hold", so a 117-question topic was a 117-question sitting. It is now **20**,
matching `MIXED_PRACTICE_QUESTION_LIMIT` so both kinds of practice session are the same
length. Verified on a device: a 117-question topic now opens at "Question 1 of 20".

**This applies to every practice session app-wide**, not only ones started from this screen
— Today's Plan, the Study Roadmap and the levels screen all feed the same engine. That is
the intended reading of the request, and worth stating because it is the widest-reaching
change in this whole piece of work.

The cap's original reason still holds and must not be removed: the translation lookup binds
one SQLite parameter per matched question, so an uncapped topic can exceed
`SQLITE_MAX_VARIABLE_NUMBER`.

### The dialog stops counting and starts explaining

The per-level question counts are gone. They answered a question nobody was asking at that
moment: someone picking "Medium" does not care that the topic holds 42 of them, only how
long this will take and whether it will be the same questions as last time. In their place
is one banner — **"20 questions each session · new questions every time"** — whose number
comes from `PRACTICE_QUESTION_LIMIT` itself, so what the student is told cannot drift from
what the engine does. A level with **no** questions still says so; that is the one case
where a count-shaped statement is still the useful thing.

**The fresh-set half of that sentence is conditional, and that matters.** It is true on the
local path, where `getPracticeQuestions` draws with `ORDER BY RANDOM()` — checked on the
device rather than assumed, by running the same topic and difficulty twice and confirming
the two sessions opened on different questions. It is **not** true on the live path used
before the first sync completes, which pages the backend deterministically and only
shuffles the page it received. So the clause is dropped in live mode rather than printing a
promise the app cannot keep.

## The coverage bar

Each topic card now carries a 0–100% bar reading `{practised}/{total} · {percent}%` — on
the test device, "32/117 · 27%" for Pipes & Cisterns and "5/127 · 4%" for Problems on
Trains, both from real history.

**The numerator is `COUNT(DISTINCT question_id)`, and that choice is the whole design.**
`user_topic_progress.attemptedCount` already exists and is the obvious thing to reach for,
but it accumulates — `existing + totalCount` on every session — so a student who practises
a 117-question topic five times reaches 100 against 117 and would eventually read past
100%. That figure measures the *volume* of practice; a 0–100% bar needs *coverage*, and
only a distinct count can honestly give it.

New `getTopicCoverage` applies **exactly** the same subject, exam and `isDeleted` predicates
as `getTopicStats`'s count. That is what guarantees the numerator is a subset of the
denominator: practise a topic under "All exams" and the questions you saw that are not
tagged to *this* exam drop out of both sides. The render also clamps with `Math.min` — belt
and braces, because a bar rendering past full is the kind of thing nobody notices until a
screenshot.

**A stated limitation: practice results only.** Mock attempts also answer questions, but
combining them needs the UNION of the two id sets — adding two `count(distinct …)` results
would double-count anything answered in both and could render "134 of 117". The honest
union needs raw SQL this module has no precedent for, or pulling every attempted id into
JS. The label makes the narrower claim, and this is on the Practice screen.

A topic with zero questions shows no bar at all, rather than a 0% one: an empty bar there
would be a statement about the student when it is really a statement about the content.

## Typography and colour

**Inter is a new dependency** — `@expo-google-fonts/inter`, four faces
(Regular/Medium/SemiBold/Bold), imported one subpath at a time so Metro does not bundle all
eighteen weights plus italics. `expo-font` was already installed. AI_RULES §3.7 discourages
new dependencies; this one was explicitly requested and there is no Inter on either
platform, so it has to ship as an asset.

Two decisions inside that:

1. **Each weight is named as its own family, and `fontWeight` is removed once it has been
   resolved.** Android does not synthesise a weight from one family name — `fontFamily:
   "Inter"` plus `fontWeight: "600"` silently renders Regular there while iOS renders
   SemiBold, so the two platforms disagree in a way only a device shows. Screens never write
   a family name themselves; `applyTypography` does it, so the wrong form is not expressible
   at a call site.

2. **Inter is applied app-wide**, at the owner's decision. It is injected centrally in
   `useThemedStyles`, in the same pass that applies zoom - screens keep writing ordinary
   `fontWeight` declarations and never name a face, and `applyTypography` resolves the weight
   to a family and then drops the `fontWeight`. A style counts as text if it declares
   `fontSize`, `fontWeight` or `color`. One place to get right rather than 334.

   The one way this could misfire is a nested `<Text>` whose child sets a size but no weight
   inside a bold parent - it would get Regular instead of inheriting Bold. **All eight
   nested-`Text` sites in the app were enumerated and checked before this landed**; every one
   of their children declares its own `fontWeight`, so none is affected. The native header
   title and the tab-bar labels are named explicitly in `ui/navigation.ts` and
   `(tabs)/_layout.tsx`, because neither is built from a themed style factory and so the
   central pass never reaches them.

**Colours are existing palette tokens, not the hex values in the brief.** That looks like a
deviation and is not: the light palette already *is* the requested system —
`brand.primary` is `#2563EB` exactly, `bg` is `#F2F5FA` against the brief's `#F4F7FC`,
`border` is `#DBE2EC` against `#DCE4EF`. Hardcoding the brief's navy and pastels would have
produced an unreadable screen in dark mode, which is precisely the failure this project's
first light-theme attempt already made once (see the note in `packages/core/src/design/palettes.ts`).
The pastel icon circles the design calls for come from the **synced subject row**
(`icon`/`color`/`colorBg`), so an admin restyling a subject restyles it here too, and every
topic under a subject shares one tint rather than each row inventing its own — which is the
brief's §8 rule, already satisfied by the data model.

Icons stay Ionicons outline variants. The app has one icon family and the brief says to keep
using it.

## Two defects avoided by construction, not by luck

Both are the same shape, and both are the pattern this codebase has hit before (see
`ui/PreparationPlanCard.tsx`):

- **Switching subject cannot show the previous subject's topics under the new subject's
  name.** Topics are stored with the key they were loaded for; a mismatched key renders as
  loading, so the wrong list is never rendered at all rather than merely being unlikely.
- **The difficulty sheet cannot show one topic's counts under another topic's name.** Same
  mechanism. This is the one number on that sheet a student could act on wrongly.

Selection is also *derived* rather than stored by an effect, which avoids the
`react-hooks/set-state-in-effect` rule and, more usefully, handles two cases an effect would
have needed teaching separately: a sync that removes the selected subject falls back instead
of rendering empty, and the default lands on a subject that actually has questions rather
than one that happens to sort first.

`TC-PRACTICE-002` and `TC-PRACTICE-006` are the regression guards for the two above; both
say in their own remarks that removing the key comparison makes them fail silently.

## Checks run

| Check | Result |
|---|---|
| `packages/core` `tsc --noEmit` | Clean |
| `mobile` `tsc --noEmit` | Clean |
| `mobile` `expo lint` | **9 problems (8 errors, 1 warning) — the exact documented baseline**, all in files this change did not touch |
| QA generators | RTM 159/306/329 → **164/316/339**; `regression-practice.yaml` created |

Three lint violations were introduced and fixed rather than suppressed: an unused import, a
`useMemo` dependency that changed every render, and a genuine synchronous `setState` inside
an effect in the difficulty sheet — the last rewritten into the keyed-loaded-state form
described above, which fixed the lint rule and the stale-counts defect together.

**An environment note, and it is already in `memory/STATUS.md`:** `tsc` initially rejected
`router.push("/practice/browse")` with the route file sitting on disk, because expo-router's
typed routes are **generated** into `.expo/types/router.d.ts` and had not been regenerated.
A brief Metro run on a scratch port fixed it (`practice/browse` present, `topics`/`subjects`
gone, `levels` retained), and that Metro instance was stopped afterwards — confirmed by PID.
The fix is never to cast the path.

## What the device pass found

Run on `emulator-5554` (AVD `Pixel_7`) with a dev client against Metro, a real Spring Boot
backend on `localhost:8080`, the real Neon dev database, and a signed-in account. Records:
`qa/execution/2026-09-22-practice-navigation.yaml`.

**The flow works, and the headline claim holds.** Practice then SSC CGL opened the single
screen with real data (Quantitative Aptitude, 3158 questions, 28 topics). The dropdown
expanded in place with the selected subject tinted and check-marked; switching to Reasoning
replaced the list and the heading together, with no transition. Tapping Analogy raised the
sheet over the still-visible list, and Medium opened the quiz. **One back press from the
quiz returned to the Practice screen** - the old flow needed three.

Several numbers cross-checked exactly, which is stronger evidence than any one of them alone:
the sheet's Medium count (33) matched the quiz's "Question 1 of 33"; "All Levels 118"
equalled 47+33+38; a second topic gave 140 = 37+62+41 and its quiz read 62; and
"Number System 128" agreed between the new Practice screen, Syllabus & Trends and the levels
screen.

### DEF-PRACTICE-001 - Inter was only PARTIALLY applying, and it surfaced as clipped tab labels

The first two bottom-tab labels rendered permanently as **"Ho..." and "Practi..."** while
"Mock Test", "Exams" and "More" - all longer - were fine. React Navigation's tab bar measures
each label once and sizes the item from that measurement; the app rendered before the faces
were registered, so those two were measured in the platform font and then re-rendered wider
in Inter, keeping the narrow measured width for the life of the process.

**The accessibility tree said it was fine.** A `uiautomator` dump reported the full text with
bounds that fit, which reads as a clean pass; the pixels showed the ellipsis persisting. This
project's own notes already warn that the screenshot is the authority, and this is another
instance of exactly that.

Fixed by **gating first render on `useFonts`** in `app/_layout.tsx`. Fixing it in the tab bar
would have covered one symptom, while any measure-once component has the same exposure. It
costs nothing against the project's "never block the app opening" rule: the faces are bundled
assets loading in parallel with the SQLite migration, which is slower and already gates. A
font *error* releases the gate rather than holding it, so a failed font can never trap a
student on a loading screen.

**The fix then exposed the larger problem it had been masking:** the same Home screen
re-rendered visibly wider and heavier afterwards, meaning parts of the app had been silently
falling back to the platform font. Without the gate, "Inter app-wide" was only partly true.

### DEF-PRACTICE-002 - the sheet could not size to its own rows (and the sheet itself was wrong)

The last difficulty row was sliced by the tab bar and "All Levels" was not visible at all.
**The root cause is that the rows lived in a `ScrollView`, and a ScrollView reports no
intrinsic height** - so the sheet, which sizes to its content, could never size to the rows.
Its height came out as the header plus whatever the ScrollView happened to be handed, and
`flexShrink: 1` let that collapse further. Measured: a sheet 370dp tall holding ~573dp of
content, with `uiautomator` reporting "All Levels" at *inverted* bounds (y2332 to y2201,
bottom above top) because it was clipped out entirely.

**My first two fixes were wrong, and I recorded the first one as verified.** The sequence
matters more than the final line:

1. `overflow: "hidden"` + `flexShrink: 1` - stopped the list *painting* outside the card. That
   looked like a fix and was really just hiding the overflow; the rows were still unreachable.
2. Replacing `maxHeight: "80%"` with a concrete dp value from `useWindowDimensions()` - a real
   improvement, since a percentage resolves against a `flex: 1` backdrop inside a `Modal` which
   Yoga does not reliably treat as definite. It moved everything up ~95px. But the cap was
   never the binding constraint, so "All Levels" stayed clipped.
3. The actual fix: **the rows are a plain `View`.** A View reports a height, so the sheet grows
   to fit them; the dp cap survives only as a guard rail against a pathological number of
   synced levels.

**What misled attempts 1 and 2:** an early bounds dump happened to show four fitting rows, so
the layout looked correct and I wrote it up as verified. It was not reproducible, because the
sheet's height depended on whatever the ScrollView was handed on that measure pass. A layout
that is right only sometimes is not right, and **a single passing measurement is not evidence
when the value is nondeterministic.** The owner's screenshot is what exposed it.

Verified by bounds this time, not by eye: all four rows at y1224/1450/1676/1901, valid and
non-inverted, with ~48dp of clearance above the tab bar, and "All Levels 128" = 47+42+39.

**And then the owner rejected the bottom sheet outright**, which was the right call: a sheet
has to fight for the bottom of the screen against the tab bar and the gesture bar, and that
is precisely where it kept losing rows. It is now a **centred, fixed dialog** -
`DifficultyPickerDialog` - sized to its content, capped at 380dp wide, fading in rather than
sliding, with no drag handle to imply a gesture that does not exist. Measured in light mode:
the card spans y706-1690 on a 2400px screen, so its centre is y1198 against a screen centre
of y1200; 361dp wide; all four rows visible with the topic list still legible behind it and
nothing near the footer. The whole class of bug goes away with the edge it was fighting.

**The dark-mode pass then found a third problem, fixed in the same round.** As a floating
card it barely separated from the page: `colors.surface` is `#0F131C` against a `#0A0D14`
background, and the 0.38 backdrop wash that works in light mode changes almost nothing on a
near-black page, so the card read as a faint outline. Fixed the way this palette says to -
in dark, a surface lifts by being *brighter* than its ground - by moving the card onto the
`elevated` Card variant's own tokens (`surfaceElevated` + `border`) and making the backdrop
theme-aware: `rgba(2,4,8,0.66)` in dark against `rgba(13,21,36,0.38)` in light. **One wash
for both themes is the trap.**

**Neither defect was reachable by reading, and neither was reachable by one screenshot.**
Both files typecheck, lint clean and are structurally correct; both bugs live entirely in how
React Native resolves measurement at paint time, and both needed measured bounds rather than
a glance to confirm.

### Deep links: four of six exercised, two blocked by account data

| Entry point | Result |
|---|---|
| Home "Focus next" card | PASS - Blood Relations to levels, All Levels 167 = 40+57+70 |
| Today's Plan | PASS - Awards & Honours to levels, All Levels 59 |
| Study Roadmap | PASS - Science & Technology to levels, 66 matching the roadmap card |
| Syllabus & Trends | PASS - Number System to levels, 128 matching the Practice screen |
| Exam Guide prepare checklist | BLOCKED - all five rows disabled, "Complete prerequisites first" |
| Preparation Radar to radar-topic | BLOCKED - "0 of 61 topics practised", no topic card exists |

Both blocks are this account's **data**, not the change. All four that ran resolve the
identical `/practice/levels` registration, so the route is demonstrably intact - but that is
an inference for the other two, not an observation.

### Dark mode

Verified on the screen, the dropdown, the sheet and the quiz: page, cards, borders and the
tab bar all repaint, the hierarchy is unchanged, every label is legible, and the selected
subject is a dark blue tint with a blue checkmark. The theme was returned to light, as found.

### A pre-existing defect observed and deliberately NOT fixed

On the **levels** screen in light mode, the "All Levels" card renders `text.onAccent` (white)
on `Card variant="filled"`, which resolves to `surfaceElevated2` - `#EAEFF7`, a pale
blue-grey. White on near-white. Both `levels.tsx` and `Card.tsx` are untouched by this change
(confirmed via `git status`), so this predates it and is not a regression. It is left alone
because fixing unrelated visual bugs while implementing a feature is the scope creep
`AI_RULES` section 3.10 warns against - flagged here for a decision instead.

One more honest observation, also not a regression: the subject/topic icon circles keep their
admin-synced **light** pastel fills in dark mode, so they read as bright discs. `toSubjectMeta`
has always behaved this way and the old subjects screen did the same; the redesign makes it
more prominent by putting a larger circle on every topic row.

## What was NOT verified

- **TC-PRACTICE-003** - a zero-question topic shown dimmed and inert. Every topic tried had
  questions.
- **TC-PRACTICE-008** - offline behaviour. The device read from local SQLite throughout
  (which is the offline path), but airplane mode and the never-synced empty state were not
  exercised; the latter is awkward on this emulator image, as this project's notes record.
- **TC-PRACTICE-010** - search. The field renders and its clear button is wired, but no query
  was ever typed on a device.
- **TC-PRACTICE-004 is Blocked, not Pass.** The quiz was opened with the right topic,
  difficulty and question set - the parameter hand-off this change actually touches - but no
  session was finished, so session recording, per-question timing and the history entry were
  not observed. They are unchanged code this change never opened.
- **TC-PRACTICE-002 and -006 are weaker passes than written.** On a fully synced device the
  reads resolve too fast for the loading skeleton to be seen, so both are verified as "the
  wrong list/counts never appeared" rather than "the skeleton was observed".
- **Content zoom** on this screen (TC-PRACTICE-009 step 4) was not run - worth checking, since
  `applyTypography` now touches every text style in the app.
- **The two Telugu strings are mine and unreviewed**, the same caveat the rest of that
  catalogue carries. Inter has no Telugu coverage, so those glyphs fall back to the platform
  font by design; that was not looked at.
- **Search remains scoped to the selected subject's topics** - a deliberate limitation, not a
  defect. Searching every subject costs one read per subject, a round trip each in live mode.
- **The exam-list screen was not restyled**, so there is a visual seam behind the new screen.
- **The rest of the app was not swept** after the typeface went global. 43 screens changed
  typeface; the ones seen on a device were Home, Practice, the quiz, Today's Plan, the Study
  Roadmap, Syllabus & Trends, the Exam Guide, More and the Preparation Radar.
- **Nothing has been committed.**

## QA

New `PRACTICE` module: `REQ-PRACTICE-001..005`, `SCN-PRACTICE-001..010`,
`TC-PRACTICE-001..010`. All ten cases are `ManualOnly` and `Not Executed` with no invented
result — mobile has no automated test runner in this project, and nothing has been run.
`qa/defects/practice.yaml` is empty and says why. No execution file was created, because no
execution happened.
