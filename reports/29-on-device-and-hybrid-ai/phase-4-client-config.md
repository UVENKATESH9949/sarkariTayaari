# TASK-2701 Phase 4 — client config + per-task AI flags

Continuation of the same session as Phase 0-3 (`phase-0-architecture-and-phase-1-foundation.md`,
`phase-2-generation-and-review.md`), per the user's "ok continue with next tasks" instruction.
Covers only the client-config/per-task-flag half of Phase 4's original scope in
`tasks/TASK-2701-on-device-and-hybrid-ai.md`'s phase table — the cloud tier for uncached/
personalized tasks is separate, unstarted work.

## What shipped

**Backend**
- Migration `V42__ai_task_flags.sql` — `ai_task_flags` (one row per `AiTaskId`, `@Version`
  optimistic concurrency, mirroring `ai_content`/`ai_provider_configs`/`ai_settings`'s existing
  pattern).
- `entity/AiTaskId.java` — a 9-value enum mirroring `packages/core/src/ai/tasks.ts`'s registry.
- `entity/AiTaskFlag.java`, `repository/AiTaskFlagRepository.java`, `dto/AiTaskFlagDtos.java`.
- `service/AiTaskFlagService.java` — `listFlags()`/`clientConfig()` both synthesize a disabled,
  version-0 view for any `AiTaskId` with no row, so every known task always appears exactly once;
  `setFlag()` is the optimistic-locked upsert.
- `controller/AiTaskFlagController.java` (`/api/admin/ai-task-flags`, admin) and
  `controller/ClientConfigController.java` (`/api/client-config`, public).

**Mobile**
- `src/db/schema.ts` — `clientConfigAiTasks` table.
- `src/db/migrations/0023_client_config.sql`, registered in `migrations.js` and
  `meta/_journal.json`.
- `packages/core/src/api/clientConfig.ts` (`getClientConfig()`), added to the `api/` barrel.
- `src/sync/writeQuestions.ts` — `writeClientConfig()`, full-replace, folded into
  `writeReferenceData()` alongside `writeAiContent()`.
- `src/db/clientConfigLocal.ts` — `getLocalAiTaskFlags()`, returning an `AiTaskFlags`-shaped map
  (`Partial<Record<AiTaskId, boolean>>`) for the router/UI to consult.
- `src/questionRenderer/AiExplanationCard.tsx` — now checks
  `flags.QUESTION_EXPLANATION === true` before even querying its cached content, not just
  before rendering it.

**Admin**
- `admin/src/api.js` — `getAiTaskFlags()`/`updateAiTaskFlag()`.
- `admin/src/pages/AiControlCenter.jsx` — a new "AI Tasks" table (independent of that page's
  existing provider-level settings section) listing all 9 tasks with an Enable/Disable button
  per row.

## A real bug found and fixed

`AiTaskFlagTest.update_rejectsAStaleVersion` failed on its first run: **expected 409 CONFLICT,
got 200 OK.** The test creates a flag row via `PUT .../QUESTION_EXPLANATION` with
`expectedVersion: 0`, then immediately repeats the same call with the same `expectedVersion: 0`,
expecting the second call to be rejected as stale.

Root cause: Hibernate's `@Version` column is bumped by an `UPDATE`, never by the entity's
initial `INSERT`. `AiTaskFlagService.setFlag()`'s optimistic-lock check compares
`flag.getVersion()` (null for a not-yet-persisted entity, treated as `0L`) against
`expectedVersion` — correct for the *check*, but after `repository.save()` on that first call,
the row's real persisted version was still `0`, not `1`. A second call with `expectedVersion: 0`
therefore matched the *actual* current version and was wrongly allowed through — silently
defeating optimistic concurrency for the very first toggle of any never-before-touched task (two
admins racing to enable the same untouched task for the first time could both "succeed" without
either seeing the other's change).

Fixed by adding a setter to `AiTaskFlag` and, in `AiTaskFlagService.setFlag()`, explicitly
assigning `flag.setVersion(1L)` on the creating save only (when `repository.findById(taskId)` was
empty). Hibernate honors an already-non-null version on a transient entity as its insert value
rather than seeding its own default — confirmed by re-running the test. Existing-row updates
(the `findById` non-empty path) are untouched and continue to auto-increment normally (1→2→3…).

## Verified

- Backend: `mvn compile` clean. `AiTaskFlagTest` run against the real dev Neon database —
  **5/6 first run** (`update_rejectsAStaleVersion` failing as above), **6/6 after the fix**.
- Mobile: `npx tsc --noEmit` clean. `npx expo lint` — exactly the pre-existing 9-problem baseline
  (8 errors, 1 warning); none in any file this phase touched (`AiExplanationCard.tsx`,
  `writeQuestions.ts`, `clientConfigLocal.ts`, `schema.ts`, `migrations.js`, `_journal.json`,
  the new migration SQL).
- Admin: `npm run build` clean. `oxlint` — the exact pre-existing one-warning baseline
  (`AuthContext.jsx`, a file this phase never touched).

## Verified live on `emulator-5554` — the flag genuinely gates cached content, end to end

Same isolated-verification pattern Phase 3 established: a scratch backend on port 8090 plus a
separate Metro instance, so the concurrent session's own dev backend on port 8080 was never
touched (confirmed via PID before and after). This device's local question bank is a frozen
pre-question-pool-lift snapshot (the 2026-09-02 STATUS.md finding), so the question a fresh
`ai_content` seed targets has to be one this device already has locally — found via a direct
SQLite query against the pulled device database (`"What is 5 + 7?"`, under SSC CGL), then
bookmarked by inserting the row directly into a pulled copy of the local database and pushing it
back (random practice sampling can't reliably land on one specific question, the same difficulty
Phase 3 documented and worked around the same way).

Seeded one grounded, `PUBLISHED` `ai_content` row for that exact question via a scratch,
since-deleted seed runner (mirroring Phase 3's own `AiContentSeedRunner` precedent — no real
Anthropic key exists on this machine).

**Negative case, confirmed by direct SQLite inspection of the device, not just a screenshot:**
with `client_config_ai_tasks.QUESTION_EXPLANATION = 0` synced locally and the real published
`ai_content` row *also* synced locally (`published = 1`), Revise → Bookmarked rendered the
question's ordinary authored explanation but genuinely no "AI EXPLANATION" card. This is the
scenario Phase 3 alone could never exercise, since the flag didn't exist yet — cached content
being present was always sufficient to render it before this phase.

**Positive case, same device, same content, no re-seed:** enabled the flag via
`PUT /api/admin/ai-task-flags/QUESTION_EXPLANATION` against the scratch backend, tapped Sync Now
on-device, confirmed via SQLite that the local flag flipped to `1`, and the exact same cached
content then rendered correctly — sparkle icon, "AI EXPLANATION" label, the seeded
`whyCorrect`/`whyOthersWrong`/`examTip` text all present and correct.

**A second real, minor finding, noted rather than fixed:** disabling the flag afterward returned
`version: 1` in the PUT response body, while a fresh `GET /api/admin/ai-task-flags` immediately
after showed the true persisted value was already `2` — the response reflects the entity's
in-memory version before Spring's deferred flush actually runs the versioned `UPDATE`, so a
caller reusing a mutation response's own `version` for an immediate next call (rather than
refetching) could hit a spurious 409. **Not unique to this new code** — `AiContentReviewService`
has the identical shape (`save()` with no explicit `flush()`) and would show the same behavior;
left as-is to stay consistent with that existing sibling rather than introduce asymmetric
handling in only one of the two. Both this session's new "AI Tasks" table and the existing
provider-settings section on the same admin page already refetch after every mutation rather
than trust the response's own version, so this never actually surfaces to a real caller.

**Full cleanup performed:** the seeded `ai_content` row and the scratch seed-runner file (never
committed) deleted; the flag disabled again server-side; the test bookmark removed via the app's
own "Remove bookmark" button (the one pre-existing real bookmark confirmed untouched); the
minted admin token revoked; the scratch backend (8090) and scratch Metro (8081) processes
stopped, confirmed by PID; the `adb reverse` mapping removed; the app force-stopped. The
concurrent session's own dev backend (port 8080) was confirmed untouched throughout.

## Not verified

- **No admin console click-through in a real browser for the new "AI Tasks" table.**
  `npm run build`/`oxlint` are clean, and the flag-toggle behavior was verified end-to-end via
  direct API calls plus the on-device pass above — the browser UI itself was not driven by
  Playwright this session, unlike the provider-level settings section on the same page.
- The full backend regression suite was not re-run this phase (only the targeted
  `AiTaskFlagTest` class) — the same scoped-run judgment call Phase 2 made, for the same reason
  (new files plus one additive migration, touching no existing entity/service/controller other
  than the version-seeding fix, which is scoped to `AiTaskFlagService`/`AiTaskFlag` alone).

## Documentation updated

- `api/AI-CONTENT.md` — new section documenting `GET /api/client-config`,
  `GET /api/admin/ai-task-flags`, `PUT /api/admin/ai-task-flags/{taskId}`; the file's stale
  "Not yet built" list (which still said "Phase 4" and "no mobile consumer" despite Phase 3
  already shipping both) corrected in place per `AI_RULES.md` §6.
- `tasks/TASK-2701-on-device-and-hybrid-ai.md` — phase table row 4 and a new Implementation
  status entry.
- `memory/STATUS.md` — Phase 4 addendum under the existing Phase 0-3 session heading.
- `qa/requirements/ai.yaml`, `qa/scenarios/ai.yaml`, `qa/test-cases/ai.yaml` — REQ-AI-016
  (client-config feed), REQ-AI-017 (admin per-task control), SCN-AI-033/034, TC-AI-033/034.
  RTM regenerated: **93/175/192**.

## Not done (disclosed, not silently dropped)

- The cloud tier for uncached/personalized tasks — the other half of this phase's original scope
  in the phase table — is genuinely separate, unstarted work.
- Phase 5 (the benchmark harness gating whether Phase 6's on-device inference is ever built) has
  not started.
