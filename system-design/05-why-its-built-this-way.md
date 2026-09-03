# 5. Why it's built this way

Some things look strange until you know the reason. If you're about to "simplify"
something here, read the entry first — most of these were simple once, and got this way
because the simple version broke.

---

## Why the phone stores its own copy

**Students practise without reliable internet.** On trains, in queues, in areas with
patchy data. An app that needs a connection for every question is useless to them.

The trade-off is real: new content doesn't appear instantly, and the first launch has to
download everything. Both were judged worth it.

---

## Why subjects are shared instead of per-exam

Roughly **70% of the syllabus is identical** across SSC, IBPS and RRB. Quantitative
Aptitude is Quantitative Aptitude.

If each exam owned its own subjects, you'd type every shared question several times —
and then fix every typo several times. Instead a question is written once and tagged to
every exam it applies to.

---

## Why there are two subject↔exam links

Covered in [02-database.md](02-database.md), but the short version:

- `exam_subjects` — *what the exam covers*. Needed for browsing, and must work before
  anyone has written the paper pattern.
- `section_subjects` — *what a specific paper section pulls from*. Needed to build a
  mock test.

They were one thing (sections only) and it broke: an exam with no pattern defined showed
**every** subject in the app, including ones it doesn't teach.

---

## Why nothing about exams is hardcoded

Exam patterns change. SSC CGL's Tier 2 was restructured in 2022. New exams get added.
Difficulty schemes vary.

If those lived in code, each change would mean editing files, rebuilding, and shipping
an app update to the store — and students who didn't update would see wrong information.

So they're data. An admin adds "Very Hard" as a difficulty and it appears in the app
after the next sync, with no release.

The rule this puts on the app: **display whatever arrives**. Don't write code that
assumes there are exactly three difficulty levels or exactly six subjects. If you find
yourself typing a list of exam-domain values into a `.ts` file, that's the mistake.

The line: **app structure stays in code** (the tab bar, the screens, how the quiz
behaves). Only exam facts are data. This isn't a CMS.

---

## Why question text lives in its own table

One question, several languages. Columns like `text_english`, `text_hindi` would mean a
database change and a release every time you add a language.

With a separate row per language, adding Telugu is data entry. English is required as
the base; other languages are added per question as translations are ready, and a
question with no Telugu translation simply falls back to English.

---

## Why deleting a question doesn't delete the row

It gets marked as deleted instead.

Phones sync by asking *"what changed since last time?"*. If the row were really gone, the
answer couldn't mention it, and every phone would keep showing a deleted question
forever. The deletion marker is what travels.

---

## Why the sync timestamp is the *start* time, not the finish time

Subtle, and it was a real bug.

A sync takes a few seconds. If a question is edited during those seconds and you record
the finish time, that edit falls in the gap — after the previous sync, before the new
timestamp — and is **never picked up again**.

Recording the start time means the next sync re-fetches a few rows that were already
handled. Harmless, because saving the same row twice does nothing. The alternative was
silent, permanent data loss.

---

## Why bookmark sync needed its own rule

Practice sessions and mock attempts are easy to sync: they're written once and never
edited, so a device just uploads whatever it hasn't uploaded yet, keyed by its own id.
Uploading the same one twice by accident does nothing extra.

A bookmark isn't like that. The *same* question can be bookmarked, then un-bookmarked,
then bookmarked again — possibly from two different phones signed into the same
account. There's no "upload it once" here; there's only "what's the current truth."

The rule: whichever change has the newer timestamp wins, and un-bookmarking is a marker,
not a delete. Without the marker, a phone that removed a bookmark while offline would
see it silently reappear the next time it restored from the server — the server would
have no record a removal ever happened, so it would look like the un-bookmark had never
worked.

## Why screens watch a sync counter

React screens load their data when they open. Tab and back-stack state is preserved, so
a screen you opened five minutes ago is still mounted and still showing what it loaded
then.

Without a signal, a completed sync would update the database and change nothing on
screen — pull-to-refresh would look broken. The counter is that signal.

---

## Why the native `android/` folder isn't in git

It's generated from `mobile/app.json`, and regenerated on every build. Committing it
would mean two sources of truth, and the generated one always wins — so an edit made
there disappears without warning.

It's also 2.3 GB.

---

## Why the backend tests are off by default in CI

They run against a **real database** and clean up after themselves. Two builds running at
once would tread on each other's data and fail in confusing ways.

They're worth turning on once there's a dedicated CI database, which is why the switch
exists rather than the tests being deleted.

---

## Why `useThemedStyles(factory)` wraps every style sheet instead of a plain `StyleSheet.create`

The mobile app used to be dark-only, with 496 `colors.*` references across 43 files inside
static, module-level `StyleSheet.create` calls evaluated once at import. Adding a light
theme meant those values had to become a function of which theme is active — but rewriting
496 individual references was both the expensive part of the job and the most likely place
to introduce a mismatch.

The fix: each file's style sheet becomes a small factory, `({ colors, typography, shadow }:
Theme) => StyleSheet.create({ ... })`, passed to `useThemedStyles()`. Because the factory
**destructures** the tokens from its parameter, every existing `colors.something` reference
inside the body keeps resolving to the same name — only the wrapper and the import line
changed. That's what made a 43-file change reviewable as a diff at all, and it's why a
style sheet in this codebase is a function, not a constant: don't "simplify" one back to a
bare `StyleSheet.create` without re-deriving how it would then see the active theme.

`StyleSheet.create` is still only run once per theme per file, not once per render — a
`WeakMap` cache in `mobile/src/ui/ThemeContext.tsx`, keyed by the factory function's own
identity (a stable module-level `const`) and then by `"{mode}:{zoom}"`. This depends on
every `buildStyles` being declared at module scope, not inside a component.

## Why zoom is applied centrally (`applyZoom`), not at each style declaration

Text zoom (90%–130%, Settings) could have meant multiplying `fontSize` at every
declaration. There are 174 `fontSize` and 26 `lineHeight` declarations across those same 43
files — that would have been 200 places to remember, and every style added afterward would
need the same discipline forever.

Instead `applyZoom()` (`mobile/src/ui/ThemeContext.tsx`) post-processes the *finished*
style sheet after `StyleSheet.create`, scaling only `fontSize` and `lineHeight`. It cannot
be forgotten because it runs once, over everything the factory returns, rather than being
opt-in per line.

Only those two properties are touched — box dimensions and vector icon sizes are
deliberately left alone. Text grows inside containers that mostly have no fixed height, so
rows get taller rather than clipped; an icon inside a fixed-size circle would look broken if
grown without the circle. This is also why zoom cannot be implemented as a single global
transform on the root view (which would scale layout, not just text) — that shortcut was
considered and rejected for exactly this reason.

## Why `te.ts` is typed as `Widen<Catalogue>` instead of `Catalogue` itself

Telugu translations (`mobile/src/i18n/te.ts`) are typed against the *shape* of the English
catalogue (`typeof en`, effectively "every key `en` has, as a string"), not against the
literal string-value types TypeScript would otherwise infer for `en`'s own object literal.

The point of typing `te` at all is **key coverage**, not value equality: `te` must define
every key `en` defines (a missing, misspelled or extra key is a compile error, not a
runtime fallback silently rendering an English string or a raw dotted key), but its *values*
are obviously and correctly different strings, in a different script. A type that also
pinned values would either be trivially unsatisfiable (Telugu text is never equal to the
English literal) or would have to erase the string literal types back to `string` — at
which point it would no longer catch `t("quiz.loadng")` as a typo, which is the entire
reason this exists. Widening only the *value* type while keeping the *key* structure exact
is what makes both things true at once: `t()`'s dotted-path autocomplete
(`mobile/src/i18n/I18nContext.tsx`'s `Paths<Catalogue>`) still works, and `te.ts` cannot
silently drift out of sync with `en.ts` as new keys are added.

## Why preferences (theme/zoom/language) live in SQLite, aren't synced, and don't gate the whole app the same way

`app_preferences` (mobile migration `0013`) is a device setting, not account data — a
shared phone signing into a second account shouldn't have its text size change, and signing
out shouldn't discard an accessibility setting someone needs in order to use the app at
all. That's why it's excluded from every sync path that touches practice history,
bookmarks or topic progress.

It's a SQLite table rather than a second storage mechanism (e.g. AsyncStorage) because
SQLite is already a hard dependency the app cannot start without — adding a second engine
for three scalars would be a native dependency added for no real gain.

`ThemeProvider` renders nothing until its preference read completes, but `I18nProvider`
does not gate the same way. That asymmetry is deliberate, not an oversight: a user who
chose light mode seeing a flash of the (wrong) dark background for one frame on every
launch is a real visual bug; a flash of English before a Telugu preference loads is a much
smaller glitch, and the whole tree already sits behind `ThemeProvider`'s gate by the time
anything renders, so in practice the language read has almost always landed too.

## Why the quiz's "Previous" is read-only, not "change your answer"

The quiz is immediate-feedback by design: the first tap on an option reveals the correct
answer and explanation and disables the other options. Adding a Previous button (Doc 2's
build-improvements request) does not change that — Previous lets a student review an
already-graded question, not re-answer it. Making Previous allow changing an answer would
require redesigning the whole quiz around deferred grading (nothing revealed until the
student finishes), which is a materially different product decision than "let people look
back."

## Why finishing early needed a counting change, not just a new button

Once a quiz could be finished before every question was answered, `total_count` could no
longer mean both "how many questions were in the set" and "how many the student actually
answered" — until this change, both were always the same number, because finishing
everything was mandatory. Reusing `total_count` for "offered" while introducing early
finishing would have silently corrupted every accuracy percentage already computed from it
(8 read sites, the sync payload, the backend entity, and Epic L's own
`CHECK (correct_count <= attempted_count)`). `total_count` now always means *answered*, and
a new, local-only `available_count` separately records what was offered — display-only,
never part of an accuracy calculation.

---

## Things that are known-imperfect

Being honest about what's not finished, so you don't assume it's done:

- **Per-section timers aren't enforced.** A paper's total time is correct and each
  section's limit is displayed, but the test runs one overall countdown. IBPS-style
  section locking isn't built.
- **Release APKs are signed with a debug key.** Fine for internal testing, not for the
  Play Store, and an APK built on a different machine won't install over one built here.
- **An interrupted first sync resumes, but that resume was never fault-tested for real.**
  The checkpointing logic is built (`sync_meta.resume_page`) and the normal path works;
  simulating a genuine mid-sync network drop to prove the resume itself needs a
  deliberate setup that hasn't been done.
- **No account deletion.** Signing up and syncing progress both work; there's no way for
  a student to ask for their account and data to be removed.
- **Content is thin.** Every subject still has one topic called "General". The structure
  supports real sub-topics; nobody has written them yet.
