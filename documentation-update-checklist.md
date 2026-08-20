# Documentation Update Checklist

**Why this file exists:** every chat session with an AI assistant starts with
zero memory of the last one. Without a fixed protocol, each new session either
re-derives "which files matter" from scratch (slow, and easy to get wrong) or
skips updating some of them (and the project's documentation quietly rots).
This file is the fixed protocol. **Read this before shipping anything, in any
session, regardless of which assistant or tool is doing the work.**

It answers two questions precisely: *how many files do I touch*, and *what
exactly goes in each one* — for the two things that happen constantly on this
project: shipping a new feature, and fixing a bug.

---

## The five files that matter, and when each one changes

| File | Updated for a new feature? | Updated for a bug fix? | What it's for |
|---|---|---|---|
| `memory/STATUS.md` | **Always** | **Always** | The single "where do I resume" entry point. Read first in every new session. |
| `reports/TICKET-STATUS.md` | **Always** | Only if it changes a ticket's status | Every ticket ever, one file, real status (done/partial/not started). |
| `reports/README.md` | Only if you created a new `reports/NN-*/` folder | No | Index of every report folder — a table of contents. |
| `reports/open-questions.md` | Only if it resolves or raises a business/technical open question | Rarely | Consolidated list of things that need a human decision, not an engineering unknown. |
| `reports/architecture-decisions.md` | Only if a real architectural choice was made (not just "which file did I edit") | Rarely | The ADR log — the "why we built it this way" record. |
| A new `reports/NN-feature-name/feature-name.md` | **Always** (for anything bigger than a one-line fix) | Only if the bug is significant enough to deserve its own write-up, otherwise fold it into the relevant existing report | The actual detailed record: what was built, what broke, what was verified. |

**Rule of thumb:** `memory/STATUS.md` and `reports/TICKET-STATUS.md` change
*every single time*, no exceptions. The other three change *sometimes*,
depending on what actually happened.

---

## Checklist A — Shipping a new feature

Run through this in order. Every "always" item is non-negotiable.

### 1. Create a dedicated report — `reports/NN-feature-name/feature-name.md`

Find the next number by checking the highest existing folder under `reports/`
(currently `13-hybrid-online-sync/` — the next one is `14-...`). Name the
folder and file after the feature in kebab-case.

**Exact structure to use** (copy this shape, don't freelance a different one —
every existing report in `reports/01-*` through `reports/13-*` follows it):

```markdown
# Feature Title

**Closes:** which ticket number, or which explicit user instruction/spec this
answers. If it expands beyond the ticket's literal wording, say so and say why.

## What existed before

What was true before this work started — confirmed by actually reading the
code/data, not assumed. If you assumed something and it turned out wrong, say
so; it's more useful than pretending you knew from the start.

## What was built

File-by-file (or module-by-module) description of the actual change. Name real
files and real function names. This is the part a future session greps for.

## Real bugs found and fixed (if any)

Not "things I improved" — actual defects found via testing, with: what was
wrong, how you found it (test failure? on-device click-through? code reading?),
and what the fix was. This project's whole verification culture rests on this
section being honest — never write "found and fixed a bug" for something you
only inferred from reading code and never actually reproduced or confirmed.

## Verified

Concrete evidence, not a claim: test suite results (name the suite, name the
pass count), actual curl output, actual screenshots, actual on-device behavior
observed. "Verified" means you did the thing and watched it work, not that the
code looks like it should work.

## Honest gaps

What wasn't verified, what's still incomplete, what a future session should
double-check. Every report in this project has this section. Never omit it to
make the work look more finished than it is.
```

### 2. Update `memory/STATUS.md` — always, four specific edits

1. **Top "Last updated" line** (line 3) — bump the date, add one sentence
   naming the new feature to the running list of "what shipped this session."
2. **"Right now" paragraph** (the section right after, under `## Right now`) —
   add a sentence describing the new feature's current state in plain terms
   (what it does, whether it's verified, any credentials/URLs someone resuming
   would need).
3. **A new bullet under `### What's done and verified`**, at the top (most
   recent first) — this is the detailed version. Use this shape:
   ```markdown
   - **Feature Name (date, ticket-or-unticketed).** Full report:
     `reports/NN-feature-name/feature-name.md`. One-paragraph summary of the
     requirement and what was built.
     - Sub-bullets for: key files/modules touched, any real bugs found and
       fixed, what was actually verified, honest gaps.
   ```
4. **`### Next up` list** — if this feature closes an item already on that
   list, remove it and renumber. If it surfaces a genuine new follow-up
   (something deliberately scoped out, a known gap), add it here instead of
   letting it live only inside the feature's own report where it's easy to
   forget.

### 3. Update `reports/TICKET-STATUS.md` — always, two edits

1. Add a row to the relevant table — either an existing Sprint/Epic table (if
   a real ticket number exists) or the current `## This session (date) — no
   ticket numbers assigned yet` table (create a new dated one if the existing
   one is from an earlier date). Use the status symbols already defined at the
   top of that file (✅ done and verified / 🔵 done with a known gap /
   ⚠️ partial / ⬜ not started).
2. If the feature is big enough to move a number in the **Top-line summary**
   table (line ~17-33), update the relevant row's Done/Partial/Not-started
   counts and the **Current product total** row.

### 4. Update `reports/README.md` — only if you created a new report folder

Add one row to the **Folder structure** table (the one listing
`01-sprint-1-backend-foundation/` through the current last folder), pointing
at the new folder, its one-line description, and the ticket range/reference.

### 5. Update `reports/open-questions.md` — only if relevant

- If this feature answers something listed under **Still open**, move that row
  up into **Already resolved**, and write the actual resolution in one or two
  sentences with a link to the new report.
- If this feature surfaces a new genuine open question (something needing a
  business/technical decision, not just an engineering task), add a new row
  under **Still open**.
- If neither applies, skip this file entirely — don't force an edit.

### 6. Update `reports/architecture-decisions.md` — only for a real architectural choice

Only if the feature involved picking between real alternatives (auth strategy,
data model shape, sync protocol, etc.) — not for "which endpoint name did you
pick." Add a new numbered ADR entry following the existing format: the
decision, the alternatives considered, why this one won.

### 7. Manual test cases — add to `reports/manual-test-cases.md` if the feature is user-facing

Add a new module section (or extend an existing one) with Positive/Negative/
Edge test cases derived from the *requirement*, not from the implementation —
see that file's own header for the exact reasoning. Update the summary sheet's
totals at the bottom.

---

## Checklist B — Fixing a bug

Bugs get a lighter touch than a full feature, but never zero touch.

### 1. Update `memory/STATUS.md` — always

Add the bug and its fix as a bullet under `### What's done and verified`
(or fold it into the relevant existing feature's bullet if one already covers
that area) using this shape:

```markdown
- **Real bug found and fixed: [short description] ([date]).** What was wrong,
  how it was found (test failure / on-device testing / user report), root
  cause, the fix, and how the fix was verified (re-ran the failing scenario,
  re-ran the test suite, re-checked on-device).
```

If the bug was found *while verifying an already-shipped feature*, add it to
that feature's **existing** report file (append a `## Update — [date]` section
at the point it was found, per the pattern already used in
`reports/11-crash-reporting-and-analytics/crash-reporting-and-analytics.md`
and `reports/12-load-test-data-seeding/load-test-data-seeding.md`) rather than
creating a brand-new numbered report folder just for a bug fix.

### 2. Update `reports/TICKET-STATUS.md` — only if it changes a ticket's status

E.g., a bug fix that finally lets a 🔵 (done-with-a-known-gap) ticket become a
clean ✅. If the ticket's status doesn't change, skip this file.

### 3. Everything else (README.md, open-questions.md, architecture-decisions.md, manual-test-cases.md) — only if the bug fix genuinely touches what those files track

A bug fix rarely needs a new report folder, a new ADR, or a new open question.
Don't force it. If in doubt, it's `memory/STATUS.md` alone that must never be
skipped.

---

## The verification discipline behind all of this

Every file above exists to support one rule this project runs on: **never
claim something works without having actually watched it work.** A "Verified"
section that says "ran the test suite, 78/78 passed" is trustworthy. A
"Verified" section that says "this should work correctly" is not, and should
never be written. If you didn't test it, the honest move is to say so in
**Honest gaps**, not to skip the section or soften the claim.

This is also why bugs get found *by testing*, not just by re-reading code —
several real bugs this project has shipped fixes for were only caught because
someone actually ran the feature on a real device or against the real
database, not because the code looked wrong on inspection.

---

## One more thing: git commits

This project's convention (not enforced by tooling, just precedent) is **one
commit per feature or fix**, not one giant commit per session — see the git
log for examples (`Add role-based admin authentication...`,
`Add crash reporting and breadcrumb-based analytics...`,
`Seed load-test data and fix 5 real performance bugs...`). Cross-cutting
documentation-only changes (updating `memory/STATUS.md`,
`reports/TICKET-STATUS.md`, etc. for several features at once) can be their
own final commit, as seen in `Reconcile status docs, ticket tracker, and ADRs
with this session's work`. **Never commit or push without the user explicitly
asking for it in that session** — this has been true throughout the project's
history and should stay true regardless of which assistant is working on it.
