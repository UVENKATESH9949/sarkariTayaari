# 3. How data flows

## The journey of one question

You type a question in the admin site. Here's everything that happens before a student
sees it.

```
1  You fill in the Add Question form in the admin site
        |
2  Browser sends it to the backend      POST /api/questions
        |
3  Backend checks it and saves it       -> Postgres (Neon)
        |
        |   ...it now exists on the server, but no phone knows about it yet...
        |
4  A student's app checks for updates   GET /api/questions/sync?since=...
        |
5  Backend replies with what changed    (only what changed, not everything)
        |
6  App writes it into the phone's SQLite
        |
7  The student sees it in Practice
```

Steps 1–3 take a second. Step 4 happens when the app next checks — see below.

---

## The two kinds of sync

### First sync — the big download

Happens once, when the app is installed and opened for the first time.

- Downloads **everything**: all questions, all translations, all exams, all subjects,
  all the exam patterns.
- Shows a progress screen and blocks the app, because there's nothing to show yet.
- If it takes more than 2 minutes, the app unblocks and finishes in the background so
  the student isn't stuck staring at a bar.

### Later syncs — the small top-up

Happens on every app launch, and whenever the app comes back to the foreground.

- Asks only *"what changed since last time?"* using a saved timestamp.
- If nothing changed, the reply is basically empty.
- Runs quietly in the background. A small banner says "Checking for new content…".
  The student can keep using the app throughout.
- Skipped if the app already synced in the last 15 minutes, so switching apps
  repeatedly doesn't hammer the server.
- Pull down on the Home screen to force one immediately, ignoring that 15-minute rule.

```
   First launch ever      Every launch after
   ------------------     ------------------
   download everything    "anything new since <timestamp>?"
   blocks the screen      runs in the background
   slow                   usually instant
```

### What "changed" includes deletions

If you delete a question in the admin, the backend doesn't erase the row — it marks it
deleted. That mark is what tells phones to remove their copy. If the row simply
vanished, the sync reply would have no way to mention it, and phones would keep showing
a question that no longer exists.

---

## What happens with no internet

Everything except syncing keeps working:

| Works offline | Needs internet |
|---|---|
| Practice questions | Getting new content |
| Mock tests | Signing in / creating an account |
| Progress and history | Backing progress up to an account (queues locally instead) |
| Bookmarks and revision | — |

The app never blocks on the network after the first sync. It also **knows when it's
offline**, rather than only finding out when a sync fails: a small banner
("You're offline — using downloaded content") appears the moment connectivity drops, and
a sync isn't even attempted while it's showing — attempting one and reporting a failure
would make an entirely normal situation look like something broke. The moment
connectivity returns, a sync runs immediately rather than waiting for the next scheduled
check, since reconnecting is exactly when a student is most likely waiting on something
new.

That's a different, calmer banner from "a background check failed while you're actually
online" — those two situations look similar but mean different things, so they're never
shown as the same message.

---

## Important: screens don't notice a sync on their own

A screen loads its data when it opens. If a sync finishes *after* that, the screen would
happily keep showing the old data — it has no reason to look again.

So the app keeps a counter that ticks up after every successful sync. Screens watch that
counter and reload when it changes. Without it, pull-to-refresh would appear to do
nothing, which is exactly what happened before it was added.

If you build a new screen that reads from the database, include that counter or your
screen will show stale data after a sync. See
[04-where-do-i-change-things.md](04-where-do-i-change-things.md).

---

## Where the app looks for the backend

While developing, the app works out the backend address from the Metro dev server — so
it follows your laptop's IP automatically.

A **built APK has no Metro**, so it can't do that. The address has to be baked in when
the APK is built:

```
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080/api          emulator
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:8080/api      real phone on your wifi
EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api    real deployment
```

If you forget, the app falls back to `localhost` — which, on a phone, means *the phone
itself*. It installs fine and then can't load anything.
