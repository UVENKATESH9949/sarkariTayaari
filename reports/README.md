# Reports — how to find your way around

**Lost? Start here, in this order:**

1. **[../memory/STATUS.md](../memory/STATUS.md)** — what happened last session, and what's next. Read this first, every time you come back to the project. (This lives in `memory/`, not here — that folder is the project's own persistent resume-point, and predates this `reports/` reorganization. A `SESSION-LOG.md` briefly existed here today, duplicating it, and was deleted.)
2. **[TICKET-STATUS.md](./TICKET-STATUS.md)** — every ticket that has ever existed for this project, one file, with its real status (done / not done / partial) and a link to whatever report documents it, if one exists.
3. **[architecture-decisions.md](./architecture-decisions.md)** — the real "why we built it this way" record (10 ADRs).
4. **[open-questions.md](./open-questions.md)** — every unresolved business/technical decision, one file.
5. The dated subfolders below — the actual detailed build reports, one folder per sprint/phase.

## Folder structure

| Folder | Covers | Ticket range |
|---|---|---|
| `01-sprint-1-backend-foundation/` | Backend scaffold, questions/languages schema, CRUD API, admin app v1, bulk import | TICKET-101–110 |
| `02-sprint-2-mobile-scaffold/` | Expo app init, local SQLite schema, sync_meta, app shell, API client | TICKET-201–205 |
| `03-sprint-3-sync-engine/` | Initial sync, sync progress UI, delta sync, resume-on-interrupt, foreground/pull-to-refresh triggers | TICKET-301–307 |
| `04-content-model-redesign/` | Flat topic/exam_type → normalized Exam/Subject/Topic model; admin CRUD rework; mobile foundation + the 11 real mobile screens | Phase 1 (backend), Phase 2 = TICKET-801–810 (admin), Phases 3–4 (mobile) |
| `05-exam-structure-model/` | Exam → Stage → Paper → Section → Subject tree; difficulty levels/paper types as data; exam↔subject syllabus | Phase A = TICKET-901–908, Phase B = 911–916, Phase C = 921–928, Syllabus = 931–936 |
| `06-bookmark-sync-and-offline-indicator/` | Cross-device bookmark sync (last-write-wins) and the offline connectivity indicator | Un-ticketed / TICKET-405 |
| `07-mock-test-engine/` | Blueprint-driven, on-the-fly generated timed mock tests with negative marking | Un-ticketed |
| `08-v1.1-accounts-and-progress-sync/` | Accounts, opaque tokens, practice/mock history upload + restore | TICKET-601–605 |
| `09-motion-system-and-ui-polish/` | Shared animation tokens, the exam-grid regression it caused, Home/Progress extension | TICKET-941 |
| `10-admin-authentication/` | Role-based admin accounts, `requireAdmin()` on every content-management endpoint, bootstrap + admin-invites-admin flow, admin console login | Un-ticketed |
| `11-crash-reporting-and-analytics/` | Sentry crash reporting (inactive, no DSN yet) and breadcrumb-based basic analytics | TICKET-503 |
| `12-load-test-data-seeding/` | 11 active exams, ~37,900 questions, a real demo account with practice/mock history; 5 real performance bugs found and fixed | TICKET-501 |
| `13-hybrid-online-sync/` | Non-blocking startup + hybrid online/local data layer — screens read live from the backend while first sync is still running, full Mock Test parity, real sync status in More | Un-ticketed (user-provided spec) |
| `14-cloud-run-deployment/` | Backend deployed to Google Cloud Run — configurable CORS, Cloud Run `PORT`, Artifact Registry + Secret Manager, and the public-credentials exposure the deployment created and closed | Un-ticketed |
| `15-github-actions-apk-builds/` | Signed release APKs built by GitHub Actions — a real upload keystore, an Expo config plugin that survives `prebuild`, `run_number`-derived `versionCode`, and a signer-fingerprint check that makes shipping a debug-signed APK impossible | TICKET-505 (partial) |
| `16-black-blue-dark-theme/` | Full black+blue dark theme — new semantic token structure (`surface*` vs. `text.onAccent*` kept deliberately separate), re-skinned `Card`/`Button`/`Skeleton`/`EmptyState`/`ErrorState` and every screen, approved via a demo Artifact before any code changed | Un-ticketed |
| `17-resilient-initial-sync/` | Initial sync retries indefinitely with backoff instead of stranding the user on a transient backend failure; the floating sync banner is removed in favor of a real percentage bar on More | Un-ticketed |
| `18-practice-mock-test-exit-guard/` | Mock Test restructured into Exam Selection → Mock List (matching Practice's flow); a "Leave this test?" confirmation guards a tab switch mid-quiz/mid-test and resets the abandoned module back to its home screen | Un-ticketed |
| `19-startup-gate-and-query-limits/` | All six phases of `offline-exam-app-requirements.md` §9: first-launch gate rework (waits on reference data with a hard 5s ceiling, fixing an offline lockout by construction), `loadSessions` N+1, six new indexes, list virtualization, Mock Test data-layer facade, bulk writes, and the question pool lifted to the full 37,884-question bank. Verified on-device | Un-ticketed |
| `20-epic-l-topic-model/` | Epic L first slice (TICKET-2101/2102/2103) — `exam_topics` map with curated weightage, `topics.parent_id` for variable-depth hierarchy, `topic_prerequisites` DAG, plus cycle/cross-subject validation a constraint can't express. Backend only, no admin UI or mobile yet | TICKET-2101–2103 |

## Two source-of-truth documents live at the project root, not here

- **`offline-exam-app-requirements.md`** — the real requirements/build-log for the shipped product (Sprints 1–5, V1.0/V1.1/V1.2, the Content Model Redesign, Mock Test, Exam Structure Model). The subfolders above are the detailed reports *behind* the summaries in that document.
- **`preparation-os-requirements.md`** — the Future Vision document: 11 epics, TICKET-1001–2003, nothing built yet.

*A third document, `sdlc-documentation.md`, briefly existed at the project root as a synthesized SDLC-style overview of both of the above. It was ~80% a restatement of the two documents above in a different shape, which meant three documents to keep in sync instead of two — so it was deleted, and its only genuinely new content (the 8 ADRs and the consolidated gaps list) was pulled out into `architecture-decisions.md` and `open-questions.md` instead.*

## What's genuinely missing

As of 2026-08-19, nothing shipped is undocumented — every real, working feature has a dedicated report backfilled into one of the folders above (bookmark sync, the offline indicator, the Mock Test engine, V1.1 accounts/progress sync, the Content Model Redesign's mobile phases, and the motion system + its regression fix all previously had no report file; they do now).

What's still genuinely missing is **verification**, not documentation — each backfilled report says so plainly in its own "Honest gaps in verification" section rather than claiming more than was actually proven. Three gaps stand out: bookmark sync's mobile side has never been exercised live on a real device (bookmark → background → sign in elsewhere → confirm it appears) — see [06-bookmark-sync-and-offline-indicator/bookmark-sync.md](./06-bookmark-sync-and-offline-indicator/bookmark-sync.md); crash reporting has never actually uploaded a real event, since no Sentry project exists yet — see [11-crash-reporting-and-analytics/crash-reporting-and-analytics.md](./11-crash-reporting-and-analytics/crash-reporting-and-analytics.md); and the load-test work found real backend performance bugs and fixed two of them, but a full sync at 10,000+ questions (~118s) still isn't fully optimized, and no on-device verification was possible — see [12-load-test-data-seeding/load-test-data-seeding.md](./12-load-test-data-seeding/load-test-data-seeding.md).
