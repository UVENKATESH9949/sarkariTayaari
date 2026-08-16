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
| `mobile/src/sync/` | downloading content from the backend |
| `mobile/src/api/` | calling backend endpoints |
| `mobile/src/practice/` | shared state (bookmarks, session history, language) |
| `mobile/src/constants/` | small display helpers |

Useful specifics:

| I want to... | File |
|---|---|
| Change how questions are picked for Practice | `mobile/src/db/practiceContent.ts` |
| Change how a mock test is assembled or scored | `mobile/src/db/mockTest.ts` |
| Change how exam structure is read | `mobile/src/db/examStructure.ts` |
| Change when syncing happens | `mobile/src/sync/SyncContext.tsx` |
| Change what a sync writes | `mobile/src/sync/writeQuestions.ts` |
| Add a table to the phone database | `mobile/src/db/schema.ts` then run `npx drizzle-kit generate` |

---

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
