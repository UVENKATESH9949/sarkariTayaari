# First-time user onboarding and the preparation profile

**Date:** 2026-09-17
**Branch:** `feature/on-device-llm-spike` (nothing committed)
**Task source:** a supplied brief, "First-Time User Onboarding & Personalized Profile" (26 sections),
then a revised 27-section version adding content-language selection (section G below)

A new student installing the app went straight from a ~3-5 second "preparing your data" screen
into a Home page built around an exam chosen for them by display order. This adds a seven-step
first-run flow that asks who they are and what they are preparing for, saves it, uses it to set
the app up, and greets them by name — without asking a single question of anyone who was already
using the app.

---

## A. What the audit found before any code changed

The brief is AI-authored, and this project's standing rule is to check such a document against
the code rather than execute it literally. Four claims did not survive that check. All four are
recorded on the requirements themselves (`qa/requirements/onboarding.yaml`) rather than resolved
silently.

### A1. The eight-language picker does not exist to reuse

§4 lists English, हिंदी, తెలుగు, தமிழ், ಕನ್ನಡ, മലയാളം, मराठी and বাংলা, and instructs "reuse the
existing language constants".

There are two language concepts in this app and neither matches that list:

- **Interface language** — `en` and `te` only. The set is derived in
  `packages/core/src/i18n/translate.ts` from which catalogues exist, and its own comment says so.
- **Question content language** — `en` and `hi` only. The eleven-entry list in
  `mobile/src/practice/appLanguage.tsx:5` is explicitly commented as a **mock**.

Offering six languages with no catalogue would show a student an English app after they chose
Telugu. The step offers `supportedUiLanguages()`, derived from the catalogue registry, so it grows
by itself the day a catalogue is added. `validation.test.ts` asserts the offered set equals the
catalogue keys **and** explicitly rejects `hi/ta/kn/ml/mr/bn`, so the brief's list cannot creep
back in unnoticed.

### A2. "Onboard, then prepare data" is not achievable as written

§13 orders onboarding strictly before the existing data preparation. But the exam catalogue the
student is asked to choose from *is* what that preparation fetches — a fresh install has no exams
until the reference sync lands. Taken literally, step 3 would either show an empty list or sit
behind a loading screen, and the student would then meet a second loading screen after finishing.

**Resolved by running them concurrently.** The flow opens immediately, in place of the old gate,
and the sync runs behind it. Steps 1 and 2 (name, language) need no data and take a few seconds,
which is normally more than enough for the catalogue to arrive before step 3 is reached. The
brief's actual intent — a *personalised* preparation after the last answer — is delivered exactly
as described, by `PreparingProfile`.

### A3. The Home-doesn't-update bug was already fixed

§16 says changing the prepared exam elsewhere does not update Home until a reload or kill, and
asks for the state synchronisation to be fixed as part of this work.

That was true, and it was fixed on 2026-09-16 by `examsModule/activeExamContext.tsx` (see
`reports/31-active-exam-switching/`), which also found a second cause the brief did not know
about: `getFollowedExam()` had no `ORDER BY`, so a restart re-ran the same arbitrary query. **No
new fix was needed.** The obligation this work inherits is different and narrower: onboarding must
route through that provider rather than build a second exam state. It does — `addExam` +
`setActiveExam`, the same operations My Exams uses.

### A4. There is no backend profile to save to

§11 and §20 assume a server-side profile might already exist. The backend `users` table has
`email`, `password_hash`, `display_name`, `phone`, `role`, `created_at` and nothing else; there is
no preparation-profile table and no endpoint. More decisively: **onboarding runs before any
sign-in on a fresh install**, because accounts in this app are optional and it works fully signed
out. The device is necessarily the source of truth at the moment these values are written.

So the profile is device-local, in the existing `app_preferences` row. The consequence is stated
rather than hidden, in `REQ-ONBOARDING-012`: **a reinstall re-onboards.** Everything the account
holds — practice history, bookmarks, followed exams, topic mastery — still restores on sign-in;
only the onboarding answers are re-asked. Making the profile account-wide is an additive table plus an
endpoint plus a conflict rule for two devices disagreeing; nothing built here would have to move.

---

## B. What shipped

### B1. `packages/core/src/onboarding/` — the testable half

Put in the shared package for one reason above all others: **`mobile/` has no JavaScript test
runner in this project and `packages/core` does.** Extracting the profile shape and every
validation rule means they are covered by real automated tests rather than a manual pass — the
same split `evaluation/` and `i18n/` already use.

- `profile.ts` — `PreparationProfile`, `PREPARATION_LEVELS`, `DAILY_STUDY_TIMES`. Options are
  stored by stable identifier, never by the label on screen, so re-wording the UI can never
  rewrite a saved profile.
- `validation.ts` — name normalisation and bounds, the derived language set, exam/stage checks,
  the derived target-year window, and `validateProfileDraft` as the last gate before any write.
  It reports **all** bad fields, not the first.
- `status.ts` — `resolveOnboardingStatus`, the four-question decision that keeps existing users
  out of the flow, plus `greetingPeriod`.

**68 new tests, all passing** (`packages/core` went 195 → 263).

### B2. Mobile

| File | What |
|---|---|
| `db/migrations/0027_onboarding_profile.sql` | 8 nullable columns on `app_preferences`, no backfill |
| `db/onboarding.ts` | Profile read/write, the signal read, the stamping |
| `onboarding/OnboardingContext.tsx` | Phase, draft, write-through persistence, submit |
| `onboarding/OnboardingFlow.tsx` | The seven steps, progress, back guard, validation |
| `onboarding/OnboardingOption.tsx` | The one selectable-answer primitive |
| `onboarding/PreparingProfile.tsx` | The personalised warm-up and the welcome |
| `onboarding/AppStartGate.tsx` | Replaces `FirstLaunchGate` — one decision, not two |
| `db/examStructure.ts` | `getExamStages()` (new) |
| `db/followedExams.ts` | Auto-follow stands down while onboarding is in progress |
| `examsModule/activeExamContext.tsx` | `setActiveExam(code, { silent })` |
| `app/_layout.tsx` | Provider wiring; `AppDialogHost` moved above the gate |
| `app/(tabs)/index.tsx` | Personalised greeting |
| `packages/core/src/i18n/{en,te}.ts` | ~60 new keys, both catalogues |

### B3. Six design decisions worth knowing

**1. The completion flag is stamped at the last answer, not after the warm-up.** By then every
question has been answered and saved. An app killed during the warm-up must not ask them all
again.

**2. `onboarding_started_at` exists because the usage signals turn true *during* the flow.** The
first sync completes and `ensureExamFollowed` follows an exam while the student is still on step 3
— so a naive "has this device been used?" check would, on the next launch after a mid-flow kill,
adopt them as an existing user and never ask again. The stamp makes the decision once.
`status.test.ts` has that exact case as a named test.

**3. Answers persist as they are given.** `updateDraft` writes through on every change, so a phone
call on step 4 costs nothing. The flow holds no state that exists only in memory.

**4. The auto-follow fallback stands down while onboarding is open.** `ensureExamFollowed` now
returns early when `onboarding_started_at` is set and `onboarding_completed_at` is not. Without
it, a student who picked IBPS PO would have ended up following SSC CGL too — whichever sorts first
by display order — the instant the first sync finished behind them.

**5. Nothing on the preparation screen claims work that did not happen.** Four lines, four real
steps, each ticking when it genuinely finishes. The exam line is **omitted entirely** — not shown
ticked, not shown stuck — when onboarding finished with no exam. The warm-up waits on the *same*
signal the startup gate releases on, which is what stops the generic preparation screen appearing
after the personalised one.

**6. The stage question adapts rather than assuming a tier ladder.** It reads the real
`exam_stages` rows for the chosen exam and is not rendered at all when there are fewer than two.
An exam with one stage and an exam whose structure has not synced yet are indistinguishable to the
student, and are treated identically.

### B4. Validation, concretely

| Field | Rule |
|---|---|
| Name | Required. Trimmed, invisible characters stripped, whitespace runs collapsed, ≤40 **code points** measured after normalisation |
| Language | Must have a real catalogue |
| Exam | Must be in the device's catalogue; `null` valid (offline) |
| Stage | Must belong to the selected exam; `null` valid |
| Year | Current year + 2 at most, integer, not in the past; `null` = "not sure yet" |
| Level / study time | Must be one of the closed enum values; both required |

The invisible-character handling is not defensive habit. A zero-width space, a BOM, a bidi mark or
a non-breaking space survives `.trim()` intact, so a "name" made entirely of them would save as
blank and render as a greeting with a hole in it. They are **stripped rather than rejected**: they
arrive by accident from a paste or a keyboard, and a name that will not save with nothing visibly
wrong cannot be fixed by the person typing it.

---

## C. Verified

- **`packages/core`: 263/263 tests pass** (195 before; 68 new), both typecheck configs clean. The
  platform-purity scan picked up the three new source files and passes — nothing in them reaches
  for a React Native or browser global.
- **Mobile: `tsc --noEmit` clean**; `expo lint` at the **exact pre-existing 9-problem baseline**
  (8 errors, 1 warning), with every flagged file confirmed to be one this change never touched.
  Three violations were introduced and fixed in the same pass: a `setState` in an effect body, a
  ref written during render, and an unmemoised array feeding a `useCallback` dependency list.
- **`web/`: `tsc --noEmit` clean** — it consumes the same package barrel, which gained a module.
- **Migration 0027 applied to a populated pre-0027 `app_preferences` row**, off-device, against a
  real SQLite database: all 8 statements ran, the existing theme/zoom/language/active-exam values
  came back **byte-identical**, all 8 new columns are `NULL` (not `""`), a second run is correctly
  rejected rather than silently succeeding, and the partial-upsert shape both preference modules
  use writes `display_name` without touching the four pre-existing values.
- **A real barrel collision was caught by the compiler, not by review**: the new
  `ValidationResult<T>` clashed with an existing export from `./ai`. Renamed to
  `FieldValidation<T>`, which is also the better name.

---

## D. NOT verified — and the gap that matters most

**No emulator or device pass has been done for any of this.** That is the whole feature: seven
screens, a preparation sequence, a welcome, and a greeting. A clean compile proves none of it, and
this project's history is full of layout and behaviour bugs that only a screenshot found.

Specifically unexercised:

- Every screen, in both palettes, at every zoom step, and in Telugu.
- **Migration 0027 through the real drizzle migrator on a device.** A failed migration is a hard
  startup gate in this app, which makes this the highest-risk mechanical item. The SQL itself is
  verified (see above); the migrator path is not.
- The §19 case that matters most: **a real upgraded device with existing practice history**. The
  decision logic is automated and green, but nobody has watched a populated install open straight
  to Home with its data intact.
- The offline first launch, the mid-flow kill and resume, the reinstall path.
- The Android back guard and the "Leave setup?" confirmation, including whether `BackHandler`
  behaves as expected for a component rendered outside the navigator.
- `AppDialogHost` moved above the gate so onboarding can raise that confirmation. Exactly one host
  is still mounted, and every existing caller is unchanged — but no dialog has been opened on a
  device since the move.
- The ~60 new Telugu strings: added to the catalogue (coverage is compiler-enforced), **never
  rendered, and not reviewed by a native speaker.**

Two smaller disclosures:

- There is a theoretical race in which the very first reference sync completes before the
  onboarding signal read returns, which would adopt a genuine first-time user. It needs a network
  round trip to lose to a local SQLite read, so it cannot realistically happen — recorded rather
  than engineered around.
- The welcome message holds for a fixed 1.6 seconds. That is a deliberate beat after the work has
  finished and the screen says so, not progress padding.

---

## E. QA

New `ONBOARDING` module: **12 requirements, 20 scenarios, 20 test cases**
(`REQ-ONBOARDING-001..012`, `SCN-ONBOARDING-001..020`, `TC-ONBOARDING-001..020`), plus an empty
defects file. RTM **102/199/220 → 114/219/240**, and a new `regression-onboarding` suite.

**Three real executions recorded** (`qa/execution/2026-09-17-onboarding.yaml`):
`EXEC-ONBOARDING-0001/0002/0003`, all Pass, for the three fully-automated cases whose cited tests
were genuinely run in this session. Every UI and device case stays `Not Executed` — nothing was
backfilled, and the PartiallyAutomated cases are deliberately absent because their manual half has
not been run and recording a partial as a pass is exactly the rounding-up this register exists to
prevent.

Two documented deviations from the brief are recorded in the requirements' own `ambiguity` fields
(the language list, and the onboarding/preparation ordering) — marked as decided deviations, not
as open questions, so a future session does not re-litigate them as gaps.

---

## F. Next

1. **One emulator pass.** It should cover this feature and the two still-unverified changes ahead
   of it in the queue: the AI card family (2026-09-16 session 1) and, for a second time, nothing
   from the active-exam work — that one is already device-verified.
2. The upgrade case specifically, on a device with a real populated database.
3. A native-speaker review of the new Telugu strings.
4. Optional, and genuinely out of scope here: an account-backed preparation profile, if a
   reinstall re-onboarding turns out to matter to real users.

---

## G. Revision: content languages, separate from the app language

A revised brief arrived after section F with one genuinely new requirement, and it is the most
consequential thing in this whole feature: **which languages a student wants their *questions* in
is a different question from which language the *interface* speaks**, and it must be captured as
its own multi-select, capped at two.

### G1. What the audit found

| Concept | Where it lived | State before this change |
|---|---|---|
| App/interface language | `app_preferences.ui_language`, `I18nProvider` | Persisted. `en`/`te` only |
| **Content language** | `AppLanguageProvider.defaultLanguageCode` | **In memory only, never persisted, single-valued** |
| Supported content languages | the synced **`languages`** table | Real, from `GET /api/languages` |
| `LANGUAGES` array in `appLanguage.tsx` | hardcoded 11 entries | **A mock** — its own comment says so |

Two things follow. The brief's instruction to "reuse the existing supported-language
configuration" means the **synced table**, not that array. And the content language was not
merely single-valued — it was *never written down at all*, so a student's choice did not survive
an app restart. Asking for content languages in onboarding would have had no effect whatsoever
without closing that gap first.

**Hindi is the case that proves the two must stay separate**: it has real question content and no
UI catalogue. Derive one from the other and a Hindi-studying student becomes unservable. A test
asserts exactly this — `hi` is valid as a content language and invalid as an interface language.

### G2. What shipped

- **`packages/core/src/onboarding/`** — `contentLanguages: string[]` on the profile,
  `MIN`/`MAX_CONTENT_LANGUAGES`, `validateContentLanguages`, and `toggleContentLanguage`. That
  last one exists because the behaviour at the cap is the rule most likely to rot into
  "helpfully" evicting the oldest selection; it is pure, so it is tested rather than trusted.
- **Migration 0028 — `content_language_preferences`**, one row per language plus `display_order`.
  A table rather than a column, for three reasons: it is genuinely multi-valued and this
  codebase's existing representation for that is a table (`question_exams`, `section_subjects`),
  never a delimited string or JSON; the future sync system has to answer "does this device want
  Telugu?" *inside a SQL query*, which is a subquery against a table and a parse-then-filter
  against a blob; and it keeps `app_preferences` what it has always been, one row of scalars.
- **A new step 3** — checkboxes (not radios: the control has to say "this adds" rather than "this
  replaces"), the remaining options dimmed at the cap but **still tappable**, because the tap is
  what produces the explanation. An inert control that says nothing would be worse than a refusal
  that does.
- **`AppLanguageProvider` now persists.** It reads the stored selection, `defaultLanguageCode`
  becomes the first chosen language, and choosing a default *reorders* the selection rather than
  replacing it — so there stays exactly one stored answer. The public API is unchanged, so no
  existing consumer needed editing.

### G3. Two real bugs found while building it, neither by review

1. **`AppLanguageProvider` sits above `OnboardingProvider` in the tree**, so it had already done
   its single read by the time onboarding wrote the answer — the choice would have reached the
   quiz only after the *next* app start. Fixed with an explicit `refresh()` that the preparation
   screen calls as part of its own work.
2. **A mojibake corruption I introduced and then caught.** Writing the Telugu strings through a
   `.encode().decode("unicode_escape")` step re-read their UTF-8 bytes as Latin-1, leaving the
   catalogue full of `à°®`-style sequences with **zero** actual Telugu characters. Caught by
   checking code points rather than trusting the terminal — which was itself showing mojibake for
   unrelated reasons, exactly the trap this project has on record. Repaired by the reverse
   transform and verified: no mojibake markers in either catalogue, 8,024 genuine Telugu
   characters in `te.ts`. **Worth remembering: on this machine the terminal renders UTF-8 as
   cp1252, so "it looks like mojibake" is not evidence either way — check `ord()`.**

### G4. Deliberately NOT built

The brief's section 14 is explicit, and it is respected exactly: no multilingual question sync,
no filtering, no translation, no language fallback, no language-specific delta sync, no rendering
changes, no large downloads. This change **captures and stores** the preference in a shape that
system can consume, and asserts nothing about behaviour that does not exist yet. That boundary is
recorded on `REQ-ONBOARDING-013` itself rather than left implicit.

### G5. Verified (revision)

- **`packages/core`: 278/278** (263 before; 15 new), both typecheck configs clean.
- Mobile `tsc` clean; `expo lint` still at the **exact 9-problem baseline**. One impure state
  updater was introduced and fixed in the same pass, the same class as the earlier one.
- `web/` `tsc` clean.
- **Migration 0028 verified off-device against a populated database**: existing preferences
  unchanged, table created empty (correct for a device that was never asked), re-run safe via
  `IF NOT EXISTS`, order preserved, reordering changes the default, the duplicate case rejected
  by the primary key, and the future sync system's own query
  (`SELECT EXISTS(... WHERE language_code='te')`) returning the right answer.

### G6. Still not verified

Everything in section D still applies, plus: **no device pass for the content-language step.** The
checkbox rendering, the dimmed-at-cap state, the refusal message and the Telugu strings for this
step have never been on a screen. QA: `REQ-ONBOARDING-013`, `SCN-ONBOARDING-021..025`,
`TC-ONBOARDING-021..025`, all `Not Executed`. RTM 114/219/240 → **115/224/245**.

