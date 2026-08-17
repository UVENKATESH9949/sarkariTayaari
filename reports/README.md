# Reports — how to find your way around

**Lost? Start here, in this order:**

1. **[../memory/STATUS.md](../memory/STATUS.md)** — what happened last session, and what's next. Read this first, every time you come back to the project. (This lives in `memory/`, not here — that folder is the project's own persistent resume-point, and predates this `reports/` reorganization. A `SESSION-LOG.md` briefly existed here today, duplicating it, and was deleted.)
2. **[TICKET-STATUS.md](./TICKET-STATUS.md)** — every ticket that has ever existed for this project, one file, with its real status (done / not done / partial) and a link to whatever report documents it, if one exists.
3. **[architecture-decisions.md](./architecture-decisions.md)** — the real "why we built it this way" record (8 ADRs).
4. **[open-questions.md](./open-questions.md)** — every unresolved business/technical decision, one file.
5. The dated subfolders below — the actual detailed build reports, one folder per sprint/phase.

## Folder structure

| Folder | Covers | Ticket range |
|---|---|---|
| `01-sprint-1-backend-foundation/` | Backend scaffold, questions/languages schema, CRUD API, admin app v1, bulk import | TICKET-101–110 |
| `02-sprint-2-mobile-scaffold/` | Expo app init, local SQLite schema, sync_meta, app shell, API client | TICKET-201–205 |
| `03-sprint-3-sync-engine/` | Initial sync, sync progress UI, delta sync, resume-on-interrupt, foreground/pull-to-refresh triggers | TICKET-301–307 |
| `04-content-model-redesign/` | Flat topic/exam_type → normalized Exam/Subject/Topic model; admin CRUD rework | Phase 1 (backend), Phase 2 = TICKET-801–810 (admin) |
| `05-exam-structure-model/` | Exam → Stage → Paper → Section → Subject tree; difficulty levels/paper types as data; exam↔subject syllabus | Phase A = TICKET-901–908, Phase B = 911–916, Phase C = 921–928, Syllabus = 931–936 |

## Two source-of-truth documents live at the project root, not here

- **`offline-exam-app-requirements.md`** — the real requirements/build-log for the shipped product (Sprints 1–5, V1.0/V1.1/V1.2, the Content Model Redesign, Mock Test, Exam Structure Model). The subfolders above are the detailed reports *behind* the summaries in that document.
- **`preparation-os-requirements.md`** — the Future Vision document: 11 epics, TICKET-1001–2003, nothing built yet.

*A third document, `sdlc-documentation.md`, briefly existed at the project root as a synthesized SDLC-style overview of both of the above. It was ~80% a restatement of the two documents above in a different shape, which meant three documents to keep in sync instead of two — so it was deleted, and its only genuinely new content (the 8 ADRs and the consolidated gaps list) was pulled out into `architecture-decisions.md` and `open-questions.md` instead.*

## What's genuinely missing

Not every completed piece of work has a report file in these folders. Real, shipped, working features with **no dedicated report** (documented only in the base requirements doc's narrative, or in git commit messages):

- Sprint 4 — Practice Flow (TICKET-401–405)
- V1.1 — Accounts + Progress Sync (TICKET-601–605) — see git commits "step 1/2/3 of progress sync"
- Mock Test engine (its own full build, `offline-exam-app-requirements.md` §6)
- Content Model Redesign Phases 3–4 (mobile foundation + the 11 mobile screens)
- The motion/animation system (TICKET-941) — see git commits `6958225`, `e1bb245`, `d66022b`
- Bookmark sync + the offline connectivity indicator (this session, no ticket number assigned yet)

`TICKET-STATUS.md` tracks all of these anyway, with an honest "no report" note instead of a link. Backfilling proper reports for these is a reasonable future task, not done yet.
