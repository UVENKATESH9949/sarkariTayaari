# 4. Where do I change things?

A lookup table for "I want to do X — which file?"

---

## Content changes (no code at all)

These are done in the admin site. **Do not write code for these.**

| I want to... | Where |
|---|---|
| Add or edit a question | Admin → Questions |
| Add many questions at once | Admin → Bulk Import |
| Add a new exam | Admin → Exams |
| Say what subjects an exam covers | Admin → Exams → Structure → Syllabus |
| Define an exam's papers and sections | Admin → Exams → Structure |
| Add a subject or topic | Admin → Subjects / Topics |
| Add a difficulty level (e.g. "Very Hard") | Admin → Difficulty Levels |
| Add a language | Admin → Languages |
| Change a subject's icon or colour | Admin → Subjects → edit |

All of this reaches phones through the normal sync. No release needed.

---

## Mobile app — screens

Screens live in `mobile/src/app/`. The folder structure *is* the navigation: a file at
`app/(tabs)/progress.tsx` becomes the Progress tab.

```
mobile/src/app/
  _layout.tsx              app-wide setup (sync, providers)
  revise.tsx               Revise screen (pushed, not a tab)
  account.tsx              sign in / sign up / signed-in view (pushed, not a tab)
  exam-guide.tsx           one exam's Guide (dates/eligibility/documents/fees/etc.)
  my-exams.tsx             Following/Recommended/Explore — reachable from More, pre-dates the Exams tab
  exam-compare.tsx         side-by-side comparison, capped at 2 exams
  exam-calendar.tsx        every followed-or-all exam's Important Dates, grouped by month
  syllabus-trends.tsx      Subject -> Topic -> Sub-topic overview (weightage/trend/priority/mastery)
  preparation-radar.tsx    Weakness Radar: which topics need attention, and why (pushed, from Progress/More)
  radar-topic.tsx          one topic's diagnosis + recommended plan (pushed from the radar)
  (tabs)/
    _layout.tsx            the bottom tab bar (Home/Practice/Mock Test/Exams/Progress-hidden/More)
    index.tsx              Home
    exams.tsx              the Exams module's own discovery listing (search/filter/sort/sections)
    progress.tsx           Progress (href: null — reachable via Home/More, not a tab button)
    more.tsx               More / settings
    practice/
      index.tsx            pick an exam
      subjects.tsx         pick a subject
      topics.tsx           pick a topic
      levels.tsx           pick a difficulty
      quiz.tsx             answering questions
      summary.tsx          result after a session
      history.tsx          past sessions
    mock-test/
      index.tsx            pick a paper
      start.tsx            instructions + availability
      test.tsx             the timed test
      result.tsx           score and review
```

## Mobile app — everything else

| Folder | What lives there |
|---|---|
| `mobile/src/db/` | reading and writing the phone's database |
| `mobile/src/sync/` | downloading content from the backend, and syncing a signed-in user's own activity back up |
| `mobile/src/api/` | calling backend endpoints |
| `mobile/src/practice/` | shared state (bookmarks, session history, language, sign-in) |
| `mobile/src/constants/` | small display helpers |

Useful specifics:

| I want to... | File |
|---|---|
| Change how questions are picked for Practice | `mobile/src/db/practiceContent.ts` |
| Change how a mock test is assembled or scored | `mobile/src/db/mockTest.ts` |
| Change how exam structure is read | `mobile/src/db/examStructure.ts` |
| Change when content syncing happens | `mobile/src/sync/SyncContext.tsx` |
| Change what a content sync writes | `mobile/src/sync/writeQuestions.ts` |
| Change how the app knows it's offline | `mobile/src/sync/NetworkStatusContext.tsx` (detection) + `OfflineBanner.tsx` (the message shown) |
| Change how bookmarks sync to the server | `mobile/src/sync/bookmarkSync.ts` (the sync logic), `mobile/src/db/bookmarks.ts` (local reads/writes), `mobile/src/api/bookmarks.ts` (the network calls) |
| Change how followed exams sync to the server | `mobile/src/sync/followedExamSync.ts`, `mobile/src/db/followedExams.ts`, `mobile/src/api/followedExams.ts` — line-for-line mirrors the bookmark files above |
| Change the Exams module's discovery listing (search/sort/filter/sections) | `mobile/src/app/(tabs)/exams.tsx` (the screen), `mobile/src/examsModule/ExamCard.tsx` + `statusLabels.ts` (the card), `mobile/src/api/examDiscovery.ts` (the network call) — backend side is `ExamDiscoveryService`/`ExamController` (`GET /api/exams/discover`) |
| Change how progress (practice/mock history) syncs | `mobile/src/sync/progressSync.ts`, `mobile/src/practice/authContext.tsx` (when it runs — sign-in, background, sign-out) |
| Change the Weakness Radar formula | `TopicHealthService.java` **and** `mobile/src/intelligence/topicHealth.ts` — the rules exist twice on purpose (signed-out students' attempts never reach a server), so change both and bump `ALGORITHM_VERSION` in both. `sample-data/weakness-radar-fixtures.json` is the agreed expected output. **Run `node scripts/check-topic-health-parity.js` afterwards** — it fails if the two sides' constants, versions or weight sums have drifted |
| Change what the radar recommends (the action rules) | `WeaknessRadarService.recommend` **and** `mobile/src/intelligence/localRadar.ts`'s `recommend` — same two-copies rule |
| Change radar wording, state labels or colours | `mobile/src/intelligence/radarPresentation.tsx` (shared by both radar screens, so a state can't be labelled two things) |
| Change where the radar comes from (server / cache / on-device) | `mobile/src/data/weaknessRadarData.ts` — the only thing the screens call |
| Change per-question time capture | `mobile/src/practice/useQuestionTimer.ts` (used by `practice/quiz.tsx` and `mock-test/test.tsx`) |
| Add a table to the phone database | `mobile/src/db/schema.ts` then run `npx drizzle-kit generate` — but see "Two traps worth memorising" below before shipping what it generates |

---

## Mobile app — theme, zoom and language

Dark/light mode, text zoom and UI language are one system, not three: all three read and
write the same local `app_preferences` row (`mobile/src/db/preferences.ts` — a single row
keyed `"current"`, added by mobile migration `0013`, never synced and never cleared on
sign-out — it describes the device, not the account). Two context providers mounted in
`app/_layout.tsx` hand them out: `ThemeProvider` and `I18nProvider`.

That same row also carries the active exam (migration `0026`, read through
`examsModule/activeExamContext.tsx`) and the first-time onboarding profile (migration `0027`,
`mobile/src/db/onboarding.ts`). Three modules therefore write one row, and they coexist because
**each builds its upsert from only the fields it was given** — none ever writes a column it does
not own. Note there is no `preferred_language` column: onboarding's language step writes
`ui_language`, the same one Settings writes, so the two cannot drift.

| I want to... | File |
|---|---|
| Change what onboarding asks, or add a step | `mobile/src/onboarding/OnboardingFlow.tsx` (the step list is a literal array at the top) |
| Change a validation rule for an onboarding answer | `packages/core/src/onboarding/validation.ts` — and its test, which is where these rules are actually proven |
| Change who gets shown onboarding at all | `packages/core/src/onboarding/status.ts` (`resolveOnboardingStatus`) plus `mobile/src/db/onboarding.ts` for the signal read |
| Change what happens between the last answer and Home | `mobile/src/onboarding/PreparingProfile.tsx` — every checklist line must stay a real step |
| Change which screen the app shows before the navigator mounts | `mobile/src/onboarding/AppStartGate.tsx` — the one gate; do not add a second |

| I want to... | File |
|---|---|
| Change a screen's colours, spacing or typography | its own `buildStyles(theme)` factory passed to `useThemedStyles()` — never a bare `StyleSheet.create` |
| Add or change a colour token | `mobile/src/ui/palettes.ts` (`darkPalette` / `lightPalette`) — `lightPalette`'s type is the dark one's shape, so add to both or it won't compile |
| Change spacing/border-radius (identical in both themes) | `mobile/src/ui/theme.ts` |
| Change how text zoom is applied | `applyZoom()` inside `mobile/src/ui/ThemeContext.tsx` — see `05-why-its-built-this-way.md` before touching this |
| Add or edit a UI-language string | `packages/core/src/i18n/en.ts` first, then the matching key in `te.ts` — the catalogues moved into the shared package in TASK-2601 Phase 0, so web renders the same strings; `te.ts` is typed as `en`'s shape, so a missing key is a compile error |
| Read the current translation in a component | `useT()` (or `useI18n()` for `language` + `t` together), from `mobile/src/i18n/I18nContext.tsx` |
| Change what's stored as a device preference | `mobile/src/db/preferences.ts` (`AppPreferences`, `loadPreferences()` / `savePreferences()`) |
| Change the theme/zoom/language settings screen | `mobile/src/app/settings.tsx` |

**`useThemedStyles(factory)` is used by roughly 43 screen/component files** — there's no
single folder for them; `grep -r useThemedStyles mobile/src` finds them all. Every one
follows the same shape:

```ts
const buildStyles = ({ colors, typography, shadow }: Theme) =>
  StyleSheet.create({ /* body reads exactly like the old static style sheet */ });
```

**Question/option/explanation text is a separate system and does not go through
`mobile/src/i18n/`.** That's the existing per-question server translation, selected by its
own quiz-language preference (see `02-database.md`'s `question_translations`) — the i18n
catalogue only covers app chrome (buttons, labels, dialogs, error/empty states).

---

## Admin accounts

The admin console requires signing in. To create the **first** admin, set
`admin.bootstrap-email` / `admin.bootstrap-password` in `application-local.yml` and start
the backend once — it creates that account if no admin exists yet, then does nothing on
every later boot. To add a **teammate**, sign in as an existing admin and call
`POST /api/auth/admin/register` (no UI for this yet — it's a backend-only endpoint).

Every content-management endpoint requires an admin token
(`authService.requireAdmin(authorization)`); the mobile-facing read endpoints used for
content sync stay public on purpose — see ADR-009 in `reports/architecture-decisions.md`.

## Backend

Every feature is the same four layers. Follow them in order:

```
Controller   the URL              backend/src/main/java/.../controller/
    |
Service      the rules            .../service/
    |
Repository   database queries     .../repository/
    |
Entity       the table            .../entity/
```

`dto/` holds the shapes that go in and out over the network — deliberately separate
from entities so a database change doesn't accidentally change your API.

| I want to... | Where |
|---|---|
| Add a new endpoint | a controller, then service |
| Change a validation rule | the service (or annotations on the DTO) |
| Add a database table | a new migration in `db/migration/`, then an entity |
| Change what sync sends | `QuestionService` + `QuestionMapper` |
| Change how a student's topic health is scored | `service/TopicHealthService.java` — one isolated, versioned service, and the only place the formula lives. See the two-copies note in the mobile table above |
| Change how the radar turns health into advice | `service/WeaknessRadarService.java` (bucketing, ranking, the action rule table) |

---

## Admin site

```
admin/src/
  api.js         every backend call, in one file
  pages/         one file per screen
  components/    shared bits (Modal, icons)
```

| I want to... | File |
|---|---|
| Call a new backend endpoint | `admin/src/api.js` |
| Change the questions list or filters | `admin/src/pages/QuestionsList.jsx` |
| Change the add/edit question form | `admin/src/pages/QuestionForm.jsx` |
| Change the exam structure editor | `admin/src/pages/ExamStructure.jsx` |
| Change bulk import checks | `admin/src/validateQuestions.js` |
| Investigate "why does the app say I'm weak in this topic?" | `admin/src/pages/WeaknessRadar.jsx` — read-only evidence view; there is deliberately no override |

---

## The big one: adding a field to questions

This is the change that touches everything. In order:

```
1  backend/src/main/resources/db/migration/V5__whatever.sql     add the column
2  backend/.../entity/Question.java                             add the field
3  backend/.../dto/QuestionResponse.java  (+ Create/Update)     let it in and out
4  backend/.../dto/QuestionMapper.java                          map it
5  backend/.../service/QuestionService.java                     save it
6  admin/src/pages/QuestionForm.jsx                             let admins type it
7  mobile/src/db/schema.ts                                      add the column locally
8  mobile: npx drizzle-kit generate                             make the migration
9  mobile/src/api/reference.ts or questions.ts                  add to the type
10 mobile/src/sync/writeQuestions.ts                            store it on sync
11 whichever screen shows it
```

Miss step 10 and the field arrives from the server and is silently dropped. That's the
usual cause of "the data is there but the app doesn't show it".

---

## Two traps worth memorising

**A new screen that reads the database must watch the sync counter.** Otherwise it shows
whatever was there when it opened and never updates after a sync:

```tsx
const { syncVersion } = useSyncStatus();

useEffect(() => {
  loadMyData().then(setData);
}, [syncVersion]);        // <- without this, the screen goes stale
```

**Never edit anything inside `mobile/android/`.** That whole folder is generated from
`mobile/app.json` and is wiped and rebuilt on the next build. Change `app.json` instead.

**`npx drizzle-kit generate` cannot be trusted as-is for a local migration.** Its snapshot
state doesn't match this schema's real migration history, so it has repeatedly produced
a full `CREATE TABLE` for tables that already exist, or unguarded index/`ADD COLUMN` DDL
with no `IF NOT EXISTS` — and a failed local migration is a hard gate (`app/_layout.tsx`
renders "Database migration failed" and the app cannot start at all). Always read the
generated `.sql` file before shipping it: guard every `CREATE TABLE`/`CREATE INDEX` with
`IF NOT EXISTS`, and for an `ADD COLUMN` on a table that may already have rows, give it a
`DEFAULT` (SQLite has no `ADD COLUMN IF NOT EXISTS` at all) — see migrations `0007`,
`0011`–`0013`, `0016`, and `0017` for the corrected pattern each time this bit.

**Wrapping a list row breaks any percentage width on it.** `FadeInItem` (the fade-in
animation wrapper used on every list) inserts a view between the list container and the
row. A percentage width like `width: "48%"` on the row now measures against the
wrapper, not the container — the row silently stops being the size you told it to be.
This is exactly the bug that broke the Practice exam grid once already. `FadeInItem`
takes a `style` prop for exactly this reason — give *it* the percentage width, and let
the row inside fill 100% of that:

```tsx
<FadeInItem index={i} style={styles.gridItem}>   {/* the 48% goes here */}
  <PressableScale style={styles.card}>...</PressableScale>   {/* this is width: "100%" */}
</FadeInItem>
```
