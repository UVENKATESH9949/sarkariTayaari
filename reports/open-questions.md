# Open Questions — gaps needing a real decision

Not engineering unknowns — each of these needs an answer from a business or technical owner before it should be treated as settled. See [TICKET-STATUS.md](./TICKET-STATUS.md) for what's built, [../memory/STATUS.md](../memory/STATUS.md) for what's next in priority order.

### Already resolved (kept here so the question doesn't get re-asked)

| Question | Answer |
|---|---|
| Which exam(s) to seed first | SSC CGL — later expanded to include IBPS PO Prelims |
| Sync pagination page size | 500, capped at 1000 |
| Whether a Future Vision document exists | Yes — `preparation-os-requirements.md` |
| Whether "BrainBlitz" is a real reference | Yes — a real prior/parallel product named in `offline-exam-app-requirements.md`'s V1.2 roadmap; its actual scoring logic/design was never provided, so the *port* itself is still open (see below) |
| Whether the admin console has any authentication | No, as of 2026-08-17 — now fixed. Role-based admin accounts (ADR-009): `users.role` (`STUDENT`/`ADMIN`), every content-management endpoint now requires `requireAdmin()`, first admin via `AdminBootstrapRunner` startup config, further admins via `POST /api/auth/admin/register`. See `reports/10-admin-authentication/admin-auth.md`. |
| Whether the app holds up at 10,000+ questions (TICKET-501) | Mostly, with real caveats — as of 2026-08-19 (round 2). ~37,900 questions across 11 active exams now exist (pushed further per user request, toward V1.2's TICKET-701 20k-50k target). A full sync pass takes ~236s server-side at this scale (up from ~118s at 14k, consistent scaling, not a regression). Four real backend performance bugs (bulk-import, progress-sync, batch-fetch-size, bookmark-sync) plus one mobile-side bug (unbatched SQLite writes hanging sync indefinitely) were found and fixed across both rounds. The mobile fix was re-verified at ~2.7x its original scale (round 1 fixed it at 14k; round 2 confirmed it still holds at 37,900, with a real device-side timed delta sync completing without crash or hang). The demo account now has 350 practice sessions / 85 mock attempts (confirmed via server-side restore; on-device restore was only directly re-verified at the round-1 scale, not re-checked after round 2 due to an emulator UI-interaction snag with the sign-out button). See `reports/12-load-test-data-seeding/load-test-data-seeding.md`. |

### Still open

| Gap | Category |
|---|---|
| What "port BrainBlitz's Readiness Score / Persona" (TICKET-702/703) concretely means — same formula? same brand? | Business — likely the same feature as Future Vision Epic C (Preparation Twin & Readiness v2), but that mapping was never stated explicitly anywhere |
| The "earlier distribution plan" referenced by TICKET-506 (Telegram/coaching groups) | Business — referenced but not documented anywhere available |
| Target user scale (DAU/MAU) | Business |
| Monetization model beyond the reserved, unused `questions.is_premium` column | Business — Future Vision epics H2/H3 are named as natural premium candidates but no model is committed |
| Content licensing / sourcing for questions at real scale | Business — the load test itself is done (see "Already resolved" above), but the ~37,900 questions in the database now are templated/synthetic load-test filler, not licensed or editorially authored real content; real content is still ~113 questions |
| Dropping the sync endpoint's `COUNT(*)` query (`Page` → `Slice`) | Technical — a real, identified optimization (Spring Data always issues a count query for `Page`), but `mobile/src/sync/initialSync.ts` uses `totalElements` to drive its progress-bar percentage, so this needs a mobile-side redesign first, not just a backend return-type change |
| Cloud provider / hosting for the production backend | Technical |
| Production database (stay on Neon, or a dedicated instance) | Technical |
| Push notification strategy | Technical — TICKET-705, "optional, evaluate need," never evaluated |
| A dedicated analytics platform for real product-usage analysis | Technical — TICKET-503's crash reporting + *basic* events are done (Sentry + breadcrumbs, ADR-010), deliberately without picking a vendor; a queryable cross-user analytics platform (PostHog/Mixpanel/Amplitude) remains a separate, later decision once the product has enough users for it to matter |
| LLM provider and monthly budget ceiling | Business — gates 4 separate Future Vision epics (D-v2, F-v2, G-v2, H2) |
| OCR/TTS/STT provider choice (on-device vs. cloud) for Future Vision Epic H | Technical — a real per-sub-feature trade-off, not a default answer |
| Content-ops staffing for Current Affairs (Epic G, near-daily) and Exam Logistics (Epic J, per notification) | Business — recurring people-cost, not a one-time build |
| Privacy review for voice capture (Epic H2) and photo capture (Epic H3) | Legal/Security — required before either collects real data, even in beta |
| Privacy policy / data retention policy | Legal — real user data (email, progress history) is already collected with no stated policy |
| API versioning strategy | Technical — everything is unversioned `/api/...` |
| Multi-admin roles/permissions beyond a single ADMIN role | Product — ADR-009 added one flat `ADMIN` role (any admin can do anything); finer-grained roles/permissions (e.g. content-only vs. structure-editing admins) remain undecided |
| UI localization (app chrome, not just question content) | Product — question content is bilingual (en/hi); the app UI itself is English-only |
| Real Android release keystore + signing process, Play Console submission | Technical — TICKET-505, not started; debug-signed only |
| Resume-from-partial-page for an interrupted initial sync | Technical — TICKET-304 is actually implemented (checkpoint + resume via `sync_meta`); the real mid-sync-network-drop scenario has never been fault-tested |
| Retry/backoff policy for failed syncs | Technical — not yet designed |
| Low-end/throttled device testing | Technical — TICKET-502, not done |
