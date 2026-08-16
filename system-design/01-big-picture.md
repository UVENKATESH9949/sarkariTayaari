# 1. The big picture

## Three separate programs

The project is one folder, but it builds **three programs that run in three different
places**. This is the first thing to be clear about, because "the app" can mean any of
them depending on who's talking.

```
        YOU (content team)                      STUDENT
              |                                    |
              v                                    v
   +---------------------+              +---------------------+
   |   ADMIN WEBSITE     |              |    MOBILE APP       |
   |   admin/            |              |    mobile/          |
   |   runs in a browser |              |    runs on a phone  |
   +----------+----------+              +----------+----------+
              |                                    |
              | types in questions                 | downloads questions
              | and exam patterns                  | (only when online)
              v                                    v
        +-----------------------------------------------+
        |                 BACKEND                       |
        |                 backend/                      |
        |            runs on a server                   |
        +-----------------------+-----------------------+
                                |
                                v
                     +---------------------+
                     |  DATABASE (Postgres)|
                     |  hosted on Neon     |
                     +---------------------+
```

## What each one does

**`backend/` — the brain**
Holds all the real data and the rules. Nobody talks to the database directly except
this. Both the admin site and the phone app ask *it* for things.
Written in Java (Spring Boot). Runs at `http://localhost:8080` while developing.

**`admin/` — where content is created**
A website only your team uses. Add questions, define what an exam looks like, manage
subjects and topics. Students never see it.
Written in React. Runs at `http://localhost:5173` while developing.

**`mobile/` — what students use**
The actual exam-prep app. Practice questions, take mock tests, track progress.
Written in React Native (Expo).

## The important part: the phone keeps its own copy

Most apps ask the server every time you tap something. **This one doesn't.**

When a student first opens the app, it downloads the entire question bank and saves it
onto the phone. After that the app reads from the phone's own storage. No internet
needed to practise.

```
   FIRST TIME (needs internet)
   phone  ---- "give me everything" ---->  backend
   phone  <--- all questions ------------  backend
   phone  --> saves to its own storage

   EVERY TIME AFTER (no internet needed)
   phone  --> reads from its own storage
```

Why: students often have patchy data, and they practise on trains and in queues. An app
that stops working without signal is useless to them.

The cost of that choice is that new content doesn't appear instantly — it arrives the
next time the app checks in. That check is explained in
[03-how-data-flows.md](03-how-data-flows.md).

## So there are two databases

This trips people up, so say it out loud:

| Where | What | Holds |
|---|---|---|
| **Server** | Postgres (on Neon) | The real, complete data. The source of truth. |
| **Each phone** | SQLite (inside the app) | A copy of the questions, plus that student's own activity |

They are not the same database. The phone's copy is a **downloaded copy**. If you
change something on the server, the phone doesn't know until it syncs.

Details in [02-database.md](02-database.md).

## Which piece do I run?

For normal development you run all three:

```
backend    mvn -f backend/pom.xml spring-boot:run     -> port 8080
admin      npm --prefix admin run dev                 -> port 5173
mobile     cd mobile && npx expo start                -> port 8081
```

The mobile app needs the backend running to sync. The admin site needs the backend
running for everything. The backend needs nothing else (the database is in the cloud).
