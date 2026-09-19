# TASK-3301 — Daily task assignment (Phase 5)

**Status: SCOPED, decisions taken 2026-09-19, implementation in progress.**
Phase 5 of [TASK-2901](TASK-2901-personalization-engine.md). Depends on Phase 4
([TASK-3101](TASK-3101-personalized-roadmap-and-workload.md)) and Phase 7
([TASK-3201](TASK-3201-revision-and-assessment-timing.md)), both shipped.

**The one sentence:** Phases 4 and 7 say what there is to do and how much of it — Phase 5 says
**what to do today, in the time this student actually has.**

---

## D5.1 is now decided, and it was the blocker

> **The student's available study time never reaches the server.** `dailyStudyTime`,
> `preparationLevel` and `targetYear` live only in device-local `app_preferences` (migration 0027),
> deliberately never synced — onboarding runs before any sign-in, because accounts are optional.
> Grepping the backend for any of them returns nothing.

**Decision (2026-09-19, project owner): the phone sends the preparation profile to the server**
(option (a)). The server then holds it alongside the account, the planner can read it directly, and
the same plan comes back on the phone and on `web/`. Conflict rule: **newest write wins**, by
`updatedAt`, which is what `user_bookmarks` and `followed_exams` already do.

This was the easier option only because D3.2 already made personalization signed-in for V1. It does
**not** change the offline-first posture: onboarding still runs before sign-in, the device still
keeps its own copy, and a signed-out student still gets the whole app. The server copy is the
authoritative one **for planning**, which is a narrower claim.

**Migration 0027 predicted this exactly**, in its own comment: *"Making the profile account-wide is
an additive backend table plus an endpoint plus a conflict rule for two devices disagreeing — real
work, deliberately not done here, and nothing in this migration would have to move to do it later."*
Nothing in it moves.

---

## The finding that shapes the whole phase: study time is a band, not a number

`DAILY_STUDY_TIMES` is `UNDER_1H | ONE_TO_TWO | TWO_TO_FOUR | FOUR_TO_SIX | SIX_PLUS`. The student
never told us "90 minutes" — they told us "one to two hours". So a planner that fills "today's 90
minutes" is working from a figure **nobody supplied**.

Handled the same way Phase 4 handled workload: **pick a representative figure per band, declare it,
and report which band it came from.** The plan says how many minutes it budgeted and on what basis,
so a student who set "1–2 hours" and sees a 90-minute plan can see why.

| Band | Budgeted | Why |
|---|---|---|
| `UNDER_1H` | 45 min | Mid-point of a 0–60 band, leaning to the achievable end |
| `ONE_TO_TWO` | 90 min | Mid-point |
| `TWO_TO_FOUR` | 180 min | Mid-point |
| `FOUR_TO_SIX` | 300 min | Mid-point |
| `SIX_PLUS` | 360 min | The floor of an open-ended band — never invent an upper bound the student did not give |
| absent | 60 min | A stated default for an account that has never onboarded, labelled as such |

These are **assumptions, not measurements**, and the payload labels them so. The honest alternative
— refusing to plan a day until the student types an exact number — is a worse product and still
would not be a measurement.

---

## Decisions

| | Decision | Taken |
|---|---|---|
| **D5.1** | Where the planner's time budget comes from | **The profile syncs to the server**, newest write wins. Owner, 2026-09-19. |
| **D5.2** | Assignments persisted or derived | **Persisted**, already decided in TASK-2901 and not reopened. Without a record of what was *assigned*, "no Percentage activity" cannot distinguish never-assigned / ignored / abandoned / completed-offline-not-synced — and Phase 6 cannot adapt without that distinction. |
| **D5.3** | What a task resolves to | **An existing screen**: a topic at a difficulty (`/practice/levels`) or a timed re-test. A task that opens a screen which does not exist is not a task. |
| **D5.4** | How the day is filled | **Revision first, then the roadmap**, both capped by the budget. Phase 7 already ranks what is most overdue; Phase 4 already ranks what matters most next. Neither is re-ranked here. |
| **D5.5** | What a band becomes in minutes | The table above, declared in the payload. |

### D5.4, stated plainly

Overdue revision beats new learning for the same minutes, because a topic already learned and now
fading is cheaper to recover than a new one is to build — and because Phase 7's ordering already
encodes urgency. But revision never takes the **whole** day: it is capped at half the budget, so a
student with a long backlog still makes forward progress. That cap is a judgement, named as a
constant, and is the kind of thing Phase 6 may later tune from real behaviour.

---

## What this phase builds

1. **Migration V48 — `user_preparation_profiles`.** One row per user: display name, primary exam,
   stage, target year, preparation level, daily study time, `updated_at`. Additive; nothing
   existing moves.
2. **`GET` / `POST /api/me/preparation-profile`** — read and last-write-wins upload, mirroring the
   shape `/api/topic-progress/sync` already uses.
3. **Migration V49 — `study_tasks`.** The persisted assignment (D5.2): user, date, type, topic,
   subject, planned minutes and question count, source (roadmap or revision), status, timestamps.
4. **`GET /api/me/daily-plan?examCode=`** — today's tasks, generating and persisting them on first
   read of a given day, returning the existing ones thereafter.
5. **Mobile** sends the profile on sign-in and whenever onboarding writes it.

### Out of scope, deliberately

- **No re-planning when the day goes badly** — that is Phase 6, and it needs these assignments to
  exist first.
- **No new ranking.** Phases 4 and 7 rank; this phase fills a day from their output.
- **No readiness score**, unchanged from every phase before it.
- **No screen.** Like Phases 3, 4 and 7, this ships as a contract; the client surface is separate
  work and is the program's largest visible gap.

### Exit criteria (🟡 Gate 3)

A student with a 1–2 hour setting gets tasks summing to roughly 90 minutes, each pointing at a
screen that already exists, none naming a topic with no questions behind it — and every one of them
recorded as assigned, so Phase 6 can later tell an ignored task from one that was never given.
