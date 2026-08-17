# Open Questions — gaps needing a real decision

Not engineering unknowns — each of these needs an answer from a business or technical owner before it should be treated as settled. See [TICKET-STATUS.md](./TICKET-STATUS.md) for what's built, [../memory/STATUS.md](../memory/STATUS.md) for what's next in priority order.

### Already resolved (kept here so the question doesn't get re-asked)

| Question | Answer |
|---|---|
| Which exam(s) to seed first | SSC CGL — later expanded to include IBPS PO Prelims |
| Sync pagination page size | 500, capped at 1000 |
| Whether a Future Vision document exists | Yes — `preparation-os-requirements.md` |
| Whether "BrainBlitz" is a real reference | Yes — a real prior/parallel product named in `offline-exam-app-requirements.md`'s V1.2 roadmap; its actual scoring logic/design was never provided, so the *port* itself is still open (see below) |

### Still open

| Gap | Category |
|---|---|
| What "port BrainBlitz's Readiness Score / Persona" (TICKET-702/703) concretely means — same formula? same brand? | Business — likely the same feature as Future Vision Epic C (Preparation Twin & Readiness v2), but that mapping was never stated explicitly anywhere |
| The "earlier distribution plan" referenced by TICKET-506 (Telegram/coaching groups) | Business — referenced but not documented anywhere available |
| Target user scale (DAU/MAU) | Business |
| Monetization model beyond the reserved, unused `questions.is_premium` column | Business — Future Vision epics H2/H3 are named as natural premium candidates but no model is committed |
| Content licensing / sourcing for questions at real scale | Business — TICKET-501's 10,000+ question load test has never been run; real content is ~113 questions today |
| Cloud provider / hosting for the production backend | Technical |
| Production database (stay on Neon, or a dedicated instance) | Technical |
| Push notification strategy | Technical — TICKET-705, "optional, evaluate need," never evaluated |
| Analytics platform and event taxonomy | Technical — TICKET-503, not started |
| LLM provider and monthly budget ceiling | Business — gates 4 separate Future Vision epics (D-v2, F-v2, G-v2, H2) |
| OCR/TTS/STT provider choice (on-device vs. cloud) for Future Vision Epic H | Technical — a real per-sub-feature trade-off, not a default answer |
| Content-ops staffing for Current Affairs (Epic G, near-daily) and Exam Logistics (Epic J, per notification) | Business — recurring people-cost, not a one-time build |
| Privacy review for voice capture (Epic H2) and photo capture (Epic H3) | Legal/Security — required before either collects real data, even in beta |
| Privacy policy / data retention policy | Legal — real user data (email, progress history) is already collected with no stated policy |
| Admin authentication/authorization | Security — **urgent**, not just a nice-to-have; not confirmed whether the admin console has any auth at all right now |
| API versioning strategy | Technical — everything is unversioned `/api/...` |
| UI localization (app chrome, not just question content) | Product — question content is bilingual (en/hi); the app UI itself is English-only |
| Real Android release keystore + signing process, Play Console submission | Technical — TICKET-505, not started; debug-signed only |
| Multi-admin roles/permissions | Product |
| Resume-from-partial-page for an interrupted initial sync | Technical — TICKET-304 is actually implemented (checkpoint + resume via `sync_meta`); the real mid-sync-network-drop scenario has never been fault-tested |
| Retry/backoff policy for failed syncs | Technical — not yet designed |
| Low-end/throttled device testing | Technical — TICKET-502, not done |
