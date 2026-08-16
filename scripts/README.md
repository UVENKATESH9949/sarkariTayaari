# Seed scripts

Re-runnable scripts that populate **reference data** — the scaffolding questions get
filed against. They talk to the running backend over its normal API, so start the
backend first.

```powershell
mvn -f backend/pom.xml spring-boot:run     # in another terminal

.\scripts\seed-topics.ps1                  # sub-topics for every subject
.\scripts\seed-structures.ps1              # exam patterns + syllabuses
```

Both are safe to run twice. Anything that already exists comes back as a 400 and is
skipped rather than duplicated.

## What they create

**`seed-topics.ps1`** — ~100 sub-topics across the six subjects (Percentages, Syllogism,
Reading Comprehension, Indian Polity and so on). It deliberately leaves the existing
"General" topic in each subject alone, because the original seed questions are filed
under it and deleting it would break them.

**`seed-structures.ps1`** — stage → paper → section patterns for SSC CHSL, IBPS PO Mains,
IBPS Clerk, RRB NTPC and RRB Group D, with each section linked to the subjects it draws
from. Exam syllabuses fill in automatically as a side effect, since saving a section
adds its subjects to the exam's syllabus.

## What they deliberately do not create

**Questions.** Exam patterns and syllabus lists are published facts and safe to script.
Question content needs subject-matter judgement and is authored through the admin UI.

## Verify the patterns before trusting them

Marks, timings and question counts **change between years**. The values here reflect the
patterns at the time of writing. Check the current official notification before showing
them to students — especially SSC, which restructured Tier 2 in 2022.

The multi-module structures (SSC CGL Tier 2, SSC CHSL Tier 2) are **not** included.
They nest sessions and modules inside a paper in a way that needs a decision about how
to model it — worth doing deliberately rather than guessing.
