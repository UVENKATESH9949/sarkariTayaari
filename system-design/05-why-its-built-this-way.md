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

## Things that are known-imperfect

Being honest about what's not finished, so you don't assume it's done:

- **Per-section timers aren't enforced.** A paper's total time is correct and each
  section's limit is displayed, but the test runs one overall countdown. IBPS-style
  section locking isn't built.
- **Release APKs are signed with a debug key.** Fine for internal testing, not for the
  Play Store, and an APK built on a different machine won't install over one built here.
- **Progress lives only on the phone.** Uninstall and it's gone. Syncing it up needs
  user accounts, which is planned for v1.1.
- **No offline indicator.** A failed sync shows a banner, but the app never tells the
  student they're offline.
- **Content is thin.** Every subject still has one topic called "General". The structure
  supports real sub-topics; nobody has written them yet.
