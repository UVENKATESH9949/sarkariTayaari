# User Analytics API

Covers `UserAnalyticsController` (`/api/me/analytics`) — summarised views of **the calling
student's own behaviour**, derived on read from their practice and mock history. Built by
TASK-2801 as the data foundation a future personalization engine reads from.

For the raw history itself (sessions, attempts, per-question answers) see
[USER-PROGRESS.md](USER-PROGRESS.md). For the per-topic *diagnosis* (health, confidence, state)
see [WEAKNESS-RADAR.md](WEAKNESS-RADAR.md) — that is a different question and a different
service; this file is measurement, not verdicts.

## What this API is, and what it deliberately is not

**It reports what a student did.** It does not say what they should do next. There is no
recommendation, no "you are weak in X", no readiness score and no study plan here. Those belong
to a planning layer that does not exist yet; keeping it out is what lets that layer be rewritten
later without re-deriving what actually happened.

**Nothing here is stored.** Every figure is computed from `user_practice_session_results` and
`user_mock_attempt_results` on each request. There is no aggregate table, no nightly job and no
cached total — the attempt rows are immutable, so a figure is always reproducible, and a stored
copy would be a second thing that can be wrong. If profiling ever demands a cache, the shape to
copy is `user_topic_health` (V24): rebuildable, algorithm-versioned, safe to drop wholesale.

**No AI is involved.** Accuracy, averages, counts, streaks and trends are arithmetic.

## Auth and isolation

Every endpoint requires `Authorization: Bearer <token>` (401 otherwise). There is **no user-id
path or query parameter anywhere in this file** — the acting user comes from the token, so one
account cannot address another's analytics. Raw attempt rows are never returned by these
endpoints; history stays behind `/api/progress`.

## Three rules that decide what the numbers mean

Read these before comparing any figure here against one computed elsewhere.

1. **Unattempted answers are excluded entirely — never counted wrong.** A mock test is timed and
   running out of it is normal. Scoring skipped questions as mistakes manufactures weakness out
   of the clock, and accuracy's denominator is therefore *answered*, never *offered*.
2. **`PENDING_REVIEW` answers are excluded from both numerator and denominator.** A descriptive
   answer awaiting a human marker is attempted but unscored. (No such row exists yet —
   descriptive types are not authoring-enabled.)
3. **`null` is a real answer and never falls back to zero.** An accuracy of `null` means
   "nothing attempted", not 0%. An `averageTimeMs` of `null` means no attempt in that group
   carried a measured time — `time_ms` is nullable and absent means unmeasured, so averages
   divide by the *timed* attempts, never by all of them. On `/trends`, a `direction` of
   `INSUFFICIENT_DATA` means the comparison could not be made, not that nothing changed.

## Three things that are genuinely approximate, stated rather than hidden

- **Study time under-reports old history.** `totalStudyTimeMs` sums practice session durations
  and mock elapsed time. Practice sessions recorded before migration `V47` carry **no duration**
  — the device measured it and never uploaded it — so they contribute nothing.
  `practiceSessionsWithoutDuration` is returned alongside precisely so the total is
  interpretable rather than quietly short. Mock attempts have always carried their elapsed time.
- **Average time is thin for older history, and was absent entirely on the web.** `time_ms` is
  nullable and `averageTimeMs` divides only by the attempts that carry one, so the figure is
  always honest — but its coverage varies. Mobile has captured it since `V24`; **`web/` captured
  nothing until TASK-2801 added `web/src/questions/useQuestionTimer.ts`**, so every answer given
  in a browser before that is permanently unmeasured and contributes to no average.

- **Classification is snapshotted at upload, not at answer time.** Since `V47` each attempt
  stores the topic/subject/difficulty/PYQ flag it was classified as, so retagging a question
  later cannot rewrite history. The remaining gap is narrow: a device that practises offline for
  weeks while an admin retags a question records the newer tagging. Attempts whose question was
  hard-deleted before `V47`'s backfill have no classification at all and are excluded from the
  per-topic/subject/difficulty views — never bucketed under a fabricated "Other".

## Time zones

"Today", a streak and a weekly bucket all depend on where the student is, and this app stores no
time zone on `users` (onboarding never asked; the profile is device-local). Endpoints that need a
day boundary accept an optional `zone` — an IANA id such as `Asia/Kolkata`. **Default is UTC**,
and an unknown zone is a `400`, never a silent fallback to a different day boundary than the
caller asked for.

## Window

Every read is bounded to the **last 365 days**, matching the evidence window Weakness Radar
already uses, so a student with years of history cannot turn one screen into a full-table scan.

---

## GET /api/me/analytics/overview
**Purpose:** headline totals, study time, last activity and streaks.
**Auth:** user
**Query:** `zone` (optional, IANA id; default UTC)
**Response:**
```
{
  totalPracticeSessions: number,
  totalMockAttempts: number,
  totalQuestionsAttempted: number,        // excludes unattempted and pending-review
  totalCorrect: number,
  overallAccuracy: number | null,         // 0-100, one decimal; null when nothing attempted
  totalStudyTimeMs: number,               // see "under-reports old history" above
  practiceSessionsWithoutDuration: number,
  lastActiveAt: ISO-8601 | null,
  daysSinceLastActivity: number | null,   // in `zone`
  currentStreakDays: number,              // consecutive active days ending today (or yesterday)
  longestStreakDays: number
}
```
**Notes:** the current streak survives "nothing yet today" — it breaks only once a whole day has
passed with no activity, so opening the app in the morning does not report a streak already lost.

## GET /api/me/analytics/subjects
**Purpose:** per-subject performance, practice and mock reported both together and apart.
**Auth:** user
**Response:** array, ordered by attempts descending
```
[{
  subjectId: uuid,
  subjectName: string | null,             // null if the subject row no longer exists
  attempts: number,
  accuracy: number | null,
  averageTimeMs: number | null,
  practiceAccuracy: number | null,
  mockAccuracy: number | null,            // null = never answered in a mock, not 0%
  lastAttemptedAt: ISO-8601
}]
```

## GET /api/me/analytics/topics
**Purpose:** the same per topic, plus a derived direction of travel.
**Auth:** user
**Response:** array, ordered by attempts descending
```
[{
  topicId: uuid,
  topicName: string | null,
  subjectName: string | null,
  attempts: number,
  accuracy: number | null,
  averageTimeMs: number | null,
  practiceAccuracy: number | null,
  mockAccuracy: number | null,
  lastAttemptedAt: ISO-8601
}]
```
> **There is deliberately no `trend` here, as of TASK-3001 (2026-09-19).** This endpoint shipped
> with one, and it was a duplicate: `user_topic_health.trend_direction` (`PerformanceTrend`,
> shipped with Weakness Radar in `V24`) already answered the same question about the same student
> and topic, over a different window, with a different evidence floor and a differently-spelled
> fourth value — so the two could disagree. Phase 3 resolved it in the health model's favour,
> because that version has a *flagged* stale-window fallback that lowers confidence rather than
> fabricating a direction. **Analytics reports facts; direction is a judgement and has one owner.**
> Read it from [`LEARNING-STATE.md`](LEARNING-STATE.md). Nothing consumed this field when it was
> removed. (Epic L's `TopicTrend.Direction` — RISING / STABLE / FALLING — is a third vocabulary
> but correctly separate: it describes the **exam's** PYQ frequency, not the student.)

**Unpaged**, deliberately: bounded by the topics one student has actually attempted (tens, not
thousands), and a planner wants the whole picture in one read. It gains a `Page` if a student's
breadth ever makes that untrue.

## GET /api/me/analytics/difficulty
**Purpose:** per difficulty band.
**Auth:** user
**Response:** array, in the admin-curated `difficulty_levels.display_order` (Easy before Hard —
alphabetical would read as a bug)
```
[{ difficultyCode: string, difficultyLabel: string | null,
   attempts: number, accuracy: number | null, averageTimeMs: number | null }]
```

## GET /api/me/analytics/activity
**Purpose:** what happened inside one window.
**Auth:** user
**Query:** `window` — `TODAY` | `7D` | `30D` | `90D` (default `7D`); `zone` (optional)
**Response:**
```
{ window, from: ISO-8601, questionsAttempted, correct, accuracy: number | null,
  studyTimeMs, practiceSessions, mockAttempts }
```
**An unknown `window` is a `400`**, not a silent default — a typo returning a different period's
numbers is worse than an error.

## GET /api/me/analytics/trends
**Purpose:** accuracy per week over recent history.
**Auth:** user
**Query:** `weeks` (default 8, clamped to 2-52); `zone` (optional)
**Response:**
```
{
  bucket: "WEEK",
  points: [{ periodStart: ISO-8601, questionsAttempted, correct, accuracy: number | null }],
  direction: "IMPROVING" | "DECLINING" | "STABLE" | "INSUFFICIENT_DATA"
}
```
**Weeks with no activity are returned with zero counts and a null accuracy, not omitted** — a
quiet week is a fact about the student, and dropping it would let a client draw a continuous line
through a gap that was not there. Built from the session/attempt rows, which already carry their
own counts, so a year-long chart never touches the per-question tables.

---

## Consumers

None yet. The endpoints exist so a planning layer and the app's Progress/Home screens can read
real figures instead of the hardcoded `MOCK.streakDays` / `MOCK.readinessPercent` constants still
in `mobile/src/app/(tabs)/index.tsx`. Replacing those is deliberately a separate piece of work.

**Signed-out students are not covered.** Accounts are optional in this app and a signed-out
student's history never reaches the server, so these endpoints describe signed-in activity only.
Weakness Radar already mirrors its algorithm on-device for that case
(`mobile/src/intelligence/localRadar.ts`, kept in step by `scripts/check-topic-health-parity.js`);
this one deliberately does not, to avoid a second copy of the arithmetic before anything consumes
the first.
