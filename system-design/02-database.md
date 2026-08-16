# 2. What's stored, and where

## Two databases, different jobs

**Server database (Postgres on Neon)** — the real one. Everything an admin types.

**Phone database (SQLite, inside the app)** — a downloaded copy of the content, *plus*
things that only exist on that phone (which questions this student bookmarked, their
past sessions).

The phone never sends content back. Content only travels server → phone.

---

## The server tables, in four groups

### Group 1: the questions themselves

```
questions                one row per question
  |                      (correct answer, difficulty, which topic)
  |
  +-- question_translations    the actual text, one row per language
  |                            ("What is 5+7?" in English, in Hindi...)
  |
  +-- question_exam_types      which exams this question is used in
```

**Why is the question text in a separate table?**
Because one question exists in several languages. Rather than columns like
`text_english`, `text_hindi`, `text_telugu` (which would need a code change every time
you add a language), each language gets its own row. Adding Telugu is then just data.

English is always required. Other languages are optional per question.

### Group 2: how content is organised

```
subjects        Quantitative Aptitude, Reasoning, English, General Awareness...
   |
   +-- topics   Percentages, Time & Work, ...  (a topic belongs to one subject)
                     |
                     +-- questions
```

A question sits in exactly **one topic**. A topic sits in exactly **one subject**.

**Subjects and topics are shared by all exams.** There is no "SSC CGL's Quant" and
"IBPS's Quant" — there is one *Quantitative Aptitude*, used by both. About 70% of the
syllabus is the same across these exams, so duplicating it would mean typing every
question several times.

### Group 3: what an exam looks like

This is the part that grew most, so take it slowly. A real government exam is not flat
— it has rounds, papers inside rounds, and sections inside papers.

```
exams                SSC_CGL
  |
  +-- exam_stages         "Tier 1"          (a round: Prelims, Mains, Tier 1...)
        |
        +-- exam_papers        "Tier 1 (CBE)"   (one sitting: 60 min, +2 / -0.5)
              |
              +-- paper_sections    "Quantitative Aptitude"  (25 questions)
                    |
                    +-- section_subjects   which subjects this section pulls from
```

Real example, SSC CGL:

```
SSC_CGL
└── Tier 1                                     (stage)
    └── Tier 1 (Computer Based Examination)    (paper: 60 min, +2 / -0.5)
        ├── General Intelligence and Reasoning   25 Q  -> subject: Reasoning
        ├── General Awareness                    25 Q  -> subject: General Awareness
        ├── Quantitative Aptitude                25 Q  -> subject: Quantitative Aptitude
        └── English Comprehension                25 Q  -> subject: English
```

Notice the section is called *"General Intelligence and Reasoning"* but the subject is
just *"Reasoning"*. The section name is what the real exam calls it; the subject is
where the questions actually live. That's why they're linked rather than being the
same thing.

### Group 4: lookup lists

Small tables that exist so these things aren't hardcoded in the apps:

| Table | Holds | Example |
|---|---|---|
| `languages` | available languages | en, hi |
| `difficulty_levels` | difficulty options + their colour and icon | easy, medium, hard |
| `paper_types` | kinds of paper, and whether a mock test can be made from it | objective (yes), descriptive (no) |
| `exam_subjects` | which subjects an exam covers | see below |

---

## The two subject links — the confusing bit

There are **two** places that connect subjects to exams. They look similar. They are
not the same, and both are needed.

```
exam_subjects        "SSC CGL covers Quant, Reasoning, English, GA"
                     -> the SYLLABUS. Used when browsing Practice.

section_subjects     "This 25-question section pulls from Reasoning"
                     -> the PAPER LAYOUT. Used when building a mock test.
```

Why both:

- A student browsing Practice for SSC CGL should see its four subjects. That's a
  syllabus question. It should work **even if nobody has written the paper pattern
  yet**.
- A mock test needs finer detail: *this specific section*, 25 questions, from *this*
  subject. That's a layout question.

Before `exam_subjects` existed, browsing had to be worked out from the sections — which
meant an exam with no paper pattern showed **every** subject, including ones it doesn't
cover. SSC CHSL had exactly that problem.

**They can't disagree with each other.** When you save a section, its subjects are
automatically added to the exam's syllabus. So the syllabus is always at least
everything the sections use, and usually the same.

One subject belongs to many exams. Right now:

```
Quantitative Aptitude  ->  SSC_CGL, SSC_CHSL, IBPS_PO
Reasoning              ->  SSC_CGL, SSC_CHSL, IBPS_PO
English                ->  SSC_CGL, SSC_CHSL, IBPS_PO
General Awareness      ->  SSC_CGL, SSC_CHSL
```

---

## The phone's own tables

The phone copies the content tables above, and adds these — which exist **only** on that
phone and are never uploaded:

| Table | Holds |
|---|---|
| `sync_meta` | when this phone last downloaded content |
| `followed_exams` | which exam this student is preparing for |
| `practice_sessions` + `practice_session_results` | past practice sessions, question by question |
| `mock_test_attempts` + `mock_test_attempt_results` | past mock tests, with scores |
| `bookmarks` | questions the student saved |

If the student uninstalls the app, this is all lost. Syncing progress to the server is
planned but not built yet (that's v1.1 in the requirements doc).

---

## Changing the database

You never edit tables by hand. You write a **migration** — a `.sql` file that describes
the change — and the backend runs it automatically on startup.

```
backend/src/main/resources/db/migration/
    V1__init_schema.sql              the original tables
    V2__content_model_redesign.sql   subjects/topics/exams
    V3__exam_structure.sql           stages/papers/sections
    V4__exam_subjects.sql            the syllabus link
```

Rules: **never edit a migration that has already run** — write a new one. They run in
order, once each, and the backend records which have been applied.

The phone has its own separate migrations under `mobile/src/db/migrations/`, generated
by a tool rather than written by hand.
