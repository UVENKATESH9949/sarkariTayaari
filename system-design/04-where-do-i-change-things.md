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
  (tabs)/
    _layout.tsx            the bottom tab bar
    index.tsx              Home
    progress.tsx           Progress
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
| Change how progress (practice/mock history) syncs | `mobile/src/sync/progressSync.ts`, `mobile/src/practice/authContext.tsx` (when it runs — sign-in, background, sign-out) |
| Add a table to the phone database | `mobile/src/db/schema.ts` then run `npx drizzle-kit generate` |

---

## Mobile app — theme, zoom and language

Dark/light mode, text zoom and UI language are one system, not three: all three read and
write the same local `app_preferences` row (`mobile/src/db/preferences.ts` — a single row
keyed `"current"`, added by mobile migration `0013`, never synced and never cleared on
sign-out — it describes the device, not the account). Two context providers mounted in
`app/_layout.tsx` hand them out: `ThemeProvider` and `I18nProvider`.

| I want to... | File |
|---|---|
| Change a screen's colours, spacing or typography | its own `buildStyles(theme)` factory passed to `useThemedStyles()` — never a bare `StyleSheet.create` |
| Add or change a colour token | `mobile/src/ui/palettes.ts` (`darkPalette` / `lightPalette`) — `lightPalette`'s type is the dark one's shape, so add to both or it won't compile |
| Change spacing/border-radius (identical in both themes) | `mobile/src/ui/theme.ts` |
| Change how text zoom is applied | `applyZoom()` inside `mobile/src/ui/ThemeContext.tsx` — see `05-why-its-built-this-way.md` before touching this |
| Add or edit a UI-language string | `mobile/src/i18n/en.ts` first, then the matching key in `mobile/src/i18n/te.ts` |
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
