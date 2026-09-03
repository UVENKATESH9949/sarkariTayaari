# AI development workflow — the day-to-day playbook

**What this file is:** an operator's manual for the human running AI-assisted development
sessions on SarkariTaiyaari — task classification, session strategy, context budgeting,
the Plan→Implement→Test→Review cycle, and 12 ready-to-paste prompts.

**What this file is not:** a set of rules Claude auto-loads. That's [`AI_RULES.md`](AI_RULES.md)
(loaded every session via [`CLAUDE.md`](CLAUDE.md)), which stays short on purpose. This file
is deliberately **not** auto-loaded — it's long, and most of it (the prompt library
especially) is written for you to read and paste, not for Claude to ingest as project
knowledge on every task. See §14 for exactly where this sits in the token-efficiency
hierarchy.

If something here ever conflicts with `AI_RULES.md` or `system-design/`, those win — this
file is process, not architecture or truth about the codebase.

---

## 1. Do you need multiple Claude sessions/roles?

Short answer: **sometimes** — not for most day-to-day work, but yes for anything that
touches more than one system or the shared contract between them. Three roles are
useful here, not because the project demands ceremony, but because each one benefits
from a genuinely different vantage point:

| Role | Responsibilities | Vantage point that matters |
|---|---|---|
| **Architect / Planner** | Requirement + impact analysis, task breakdown, acceptance criteria, risk identification, the plan | Needs to see the *whole* affected surface before anything is written — reading code with "what could this break" in mind, not "how do I make this work" |
| **Implementation Engineer** | Implement the approved plan, touch only the named files, write/update tests, run validation, review its own diff | Needs to stay narrow and disciplined — the plan is already decided; the job is execution, not re-litigating scope |
| **QA / Reviewer** | Compare implementation against requirements, hunt for regressions/security issues/API inconsistencies/architectural violations/missing tests | Needs **zero anchoring** on the implementer's own assumptions — this is the one role where a genuinely fresh session beats continuing the same one |

**How many sessions, concretely:**

| Sessions | When |
|---|---|
| **One** | Level 0–2 tasks (§2 below): tiny fixes, single-system small features/bug fixes. Plan inline in the same conversation, implement, self-review the diff. No ceremony. |
| **Two** | Level 3: one system, but the change has real surface area (a new contract, a schema change, something a fresh reviewer should double-check). Use the same session for Architect+Implementation Engineer, then a **second, fresh session** (or the `/code-review` skill, which is effectively this) as Reviewer. |
| **Three+** | Level 4–5: cross-system or architectural. One Architect/Planner session writes the task doc and splits it; a separate session per system implements its subtask (see §7); a separate Reviewer pass at the end. |

**How to actually run multiple sessions in this environment (Claude Code):**
- **Simplest, always available:** separate terminal/IDE windows, each running its own
  `claude` session in this repo. Zero context bleed between systems by construction —
  a "Backend Claude" window literally cannot see what "Mobile Claude" did except
  through git and the `api/` docs, which is exactly the isolation you want for Level 4+.
- **If you're already in a multi-session-capable harness** (this one is): a background
  subagent (the `Agent` tool) is the right tool for *research* that would otherwise
  bloat your main conversation — e.g. "read these 8 controllers and summarize the
  contract" without your planning session's context filling up with Java source. This
  is exactly how the `api/*.md` files were produced in the previous phase. Peer sessions
  (visible via `ListAgents`) can be handed a review via `SendMessage` if you're already
  running more than one window.
- Either way, the **coordination mechanism is the same**: git (branches/commits), the
  `api/` contract docs, and — for Level 4+ — a `tasks/TASK-xxx.md` file. Sessions don't
  need to talk to each other; they need a shared, written source of truth to read.

---

## 2. Task classification

| Level | What it is | Examples in this project |
|---|---|---|
| **0 — Content-only** | No code at all | Add a question, add an exam, edit syllabus/icons via the Admin UI (`system-design/04`'s "content changes" table) |
| **1 — Tiny code change** | One file, one system, no schema/API/nav/auth impact | Fix a copy string, adjust a style constant, bump a config default, fix an off-by-one |
| **2 — Small feature/fix, one system** | Multiple files, still one system, no contract change | Add a filter to the admin question list, fix a mobile sync edge case, add form validation |
| **3 — Feature with its own contract surface, one system** | Changes what the system exposes, but only one consumer type | A new admin-only endpoint + screen, a new mobile screen with a local-only migration, adding a field within one system's boundary |
| **4 — Cross-system feature** | Touches ≥2 of backend/admin/mobile, or a schema change that ripples through sync | Exam Guide Phase 1, Epic L, accounts + progress sync — this project's actual "epic" shape |
| **5 — Architectural / security-sensitive** | Changes a cross-cutting mechanism, not a feature | Auth/token scheme, CORS policy, deploy pipeline/secrets, sync protocol semantics, keystore/signing, anything ADR-worthy |

| | Context | Session structure | Planning | Approval | Task doc | Testing | Review | Docs updated | Git |
|---|---|---|---|---|---|---|---|---|---|
| **L0** | None — this isn't a Claude task | — | No | No | No | Verify in the Admin UI | No | No | No code, nothing to commit |
| **L1** | Tier 1 (auto-loaded) + the one file; `system-design/04` only if unsure which file | One | Informal, inline | No (unless it touches auth/nav — escalate to L5's rule) | No | Compile/typecheck/lint for that system | Self-review the diff | None, unless correcting stale docs (`AI_RULES.md` §6) | Direct commit or a small branch, matching existing practice |
| **L2** | Tier 1 + relevant `system-design/*` + the relevant `api/*.md` (read-only, to confirm you're not breaking it) + the files | One (brief plan inline, or a short Plan Mode pass) | Yes, brief | Quick sanity check if it touches widely-shared code | No | Compile/typecheck/lint + actually exercise the change | Self-review; `/code-review` (low/medium) if shared code is touched | `system-design/04` only if its lookup table changed | Feature branch, PR optional |
| **L3** | Tier 1 + full relevant `system-design/*` + relevant ADRs + the affected `api/*.md` | One, using Plan Mode explicitly with an approval gate before implementing | Yes, written | **Yes** | Optional, recommended if scope could drift | Compile/typecheck/lint + integration test for the endpoint + manual exercise | `/code-review` (medium); `/security-review` if auth-adjacent | The affected `api/*.md` + `system-design/*` in the same change; a `reports/<NN-topic>/` entry if it's a real, permanent feature | Feature branch, reviewed before merge |
| **L4** | Full `system-design/`, all relevant `api/*.md`, relevant ADRs, `tasks/TASK-xxx.md` | 2–3: one Architect/Planner session, then one session per affected system (see §7) | Yes, formal | **Mandatory**, and again if the contract changed after subtasks started | **Required** | Per-system compile/typecheck/lint + integration tests for new endpoints + manual exercise of the *whole* flow once all systems land + regression check of what the schema change touches | `/code-review` per system's diff, plus one integration pass across all three | `api/*.md`, `system-design/02` if schema changed, `reports/<NN-topic>/`, `memory/STATUS.md` — all required | One branch per subtask, or one shared branch done sequentially; **backend merges first** (§9) |
| **L5** | Everything relevant + every existing ADR (check you're not relitigating a settled decision without new information) + `open-questions.md` | Architect/Planner session mandatory; implementation only after sign-off, ideally starting from the *approved plan*, not the planning session's full exploration history | Mandatory, formal | **Mandatory, non-negotiable** (§15) | **Required**, plus a new ADR once decided | Full relevant suite + manual verification + an explicit rollback plan | `/code-review` (high/max) **and** `/security-review`, mandatory | New ADR in `reports/architecture-decisions.md` (required), `system-design/*`, `AI_RULES.md` if a rule itself changes, `memory/STATUS.md` | Dedicated branch, no direct commits to `main`, human merges personally |

---

## 3. Context budgeting — the decision table

| Task shape | Required docs | Source scope | Full repo? |
|---|---|---|---|
| Content-only change | None | None (Admin UI) | No |
| Small UI bug (mobile or admin) | `system-design/04` (find the file) | The one screen/component + its direct imports | No |
| Backend bug, no contract change | `system-design/02` + `04` | The controller→service→repository chain for that feature | No |
| API change (new/changed endpoint) | The affected `api/*.md` + relevant ADR (e.g. ADR-009 for public/admin split logic) | Controller + DTO + service, plus a grep of `mobile/src/api/*.ts` and `admin/src/api.js` for real consumers | No |
| Database/schema change | `system-design/02` + the migration history tail (last 2–3 `V*.sql` files, to match naming/style) | The entity + repository + the migration itself | No |
| Cross-system feature | Full `system-design/`, all relevant `api/*.md`, relevant ADRs, the `tasks/TASK-xxx.md` | Per-subtask source scope only (backend session reads backend, not mobile, and vice versa) | Rarely — only if the feature is genuinely repo-wide, which none so far have been |
| Auth/security change | `AI_RULES.md` §4's traps, ADR-001/003/009, `system-design/02`'s users/tokens tables | Every call site of `requireUser`/`requireAdmin`, not just the one being changed | Sometimes (a search across all controllers, not a full read) |
| Architecture change | Every ADR, `open-questions.md`, all `system-design/*` | Whatever the decision actually touches, decided *after* the plan is scoped, not before | Sometimes |
| Documentation-only fix | Just the doc being fixed + whatever fact you're correcting it against | N/A | No |

**The rule underneath this table:** load the docs for the row, then load source *only after* you know which files the docs point you to. Never read `backend/`, `mobile/`, or `admin/` wholesale as a first step — `system-design/04` and the `api/` contract exist specifically so that never has to happen.

---

## 4. Session management — concrete rules

**Continue the current session if:**
- The task is Level 0–2.
- You're mid-subtask on a Level 3–4 task and context is still focused (not dominated by a different, unrelated exploration).
- It's a quick, obvious follow-up to something just implemented in this same conversation.

**Start a new session if:**
- The previous session already got auto-summarized (you've lost the ability to `git diff`-check its exact reasoning) or ran long enough that early context is stale.
- You're starting a task unrelated to what's currently in the conversation — cheaper to start clean than to carry irrelevant context.
- The current session is full of one system's files and the new task is a different system entirely.

**Use a separate session (different window) per system if:**
- Level 4+, and more than one system's work will happen concurrently, or you want hard isolation (a backend session that literally cannot touch mobile files by accident).

**Use a reviewer session/pass if:**
- Level 3+ (recommended), always for Level 4–5 (mandatory).
- The implementer session has iterated on the same bug 3+ times — that's the signal it may be anchored to a wrong assumption; a fresh look catches what iteration inside the same context won't.
- Concretely: `/code-review` (this repo has the skill installed) is the default mechanism — pick effort by task level (low/medium for L1–2, high for L3, max for L4–5). `/security-review` is mandatory for anything auth/security-adjacent regardless of level.

---

## 5. The workflow, stage by stage

| Stage | Claude does | You do | Claude must NOT | Artifact | Stop condition |
|---|---|---|---|---|---|
| **1. Intake** | Classify the task's level (§2), name likely affected systems | Give the requirement | Start coding | A one-line classification | You confirm the level, or correct it |
| **2. Baseline check** | `git status`/`git diff --stat`, record what's *already* dirty before this task touches anything (§10) | Confirm nothing important is being missed | Assume pre-existing changes belong to this task | The "before" file list | Baseline recorded |
| **3. Context loading** | Read exactly the row in §3's table | — | Read the whole repo by default | — | Docs read |
| **4. Impact analysis** | Affected files/modules/endpoints/DB, regression risk, relevant ADRs/open questions | Sanity-check against your own knowledge of the area | Write code | A findings list (Prompt 2) | You've seen it |
| **5. Plan** | Files to touch, order, tests, docs to update, what needs approval | Read it | Implement | A plan (Prompt 3), a `tasks/TASK-xxx.md` for L4–5 | — |
| **6. Approval** | Wait | Approve or redirect — mandatory for L3+ | Proceed without it at L3+ | Your go-ahead | Approved |
| **7. Implementation** | Touch only named files, re-check against the baseline | Available if Claude hits an unplanned fork | Expand scope silently, touch baseline-dirty files without flagging it | The diff | Plan executed |
| **8. Testing** | Compile/typecheck/lint **and** actually exercise the change (§11) | — | Report a clean build as "it works" | Test results, explicitly labelled verified-vs-inferred | Real verification done or explicitly flagged as not possible |
| **9. Diff review** | Self-review; list files changed/added/deleted | Read the diff yourself | — | A change summary | You've seen the diff |
| **10. Independent review** | (fresh session/`/code-review`) find regressions, contract drift, security issues | Decide whether this task warrants it (§4) | Rubber-stamp its own work as the reviewer | Findings list | Findings addressed or accepted |
| **11. Documentation update** | Update `api/*.md`/`system-design/*`/ADR per what actually changed | — | Skip this and call the task done | Doc diff | Docs match reality |
| **12. Completion** | `memory/STATUS.md` resume point, what's verified vs not, risks | Decide what to commit | Commit without being asked | Status update | You're ready to close or hand off |

---

## 6. Reusable prompts — copy/paste

These assume you've read the requirement to Claude already; each is meant to be pasted as-is (with the `<...>` filled in) at the matching stage.

### Prompt 1 — New task analysis
```
I have a new requirement: <describe it>.

Before doing anything else:
1. Classify this task's level (0-5) per AI_WORKFLOW.md's task classification table.
2. Tell me which systems it likely touches (backend/admin/mobile) and why.
3. Tell me exactly which docs you need to plan it (system-design/*, api/*.md, ADRs) per
   AI_WORKFLOW.md's context decision table, and read only those - nothing else yet.
4. Check whether this is already covered by reports/open-questions.md or
   reports/TICKET-STATUS.md before treating it as new.
5. Do NOT write or modify any code yet.

Give me your classification and reading list, then stop and wait for me.
```

### Prompt 2 — Impact analysis
```
For <task/feature>, perform an impact analysis before planning:
1. Which systems (mobile/backend/admin) are affected, and why.
2. Which files/modules per system - start from system-design/04-where-do-i-change-things.md,
   don't guess.
3. Which API endpoints are affected. Check the relevant api/*.md for the current contract.
   State plainly whether this needs a NEW endpoint or a CHANGE to an existing one's
   request/response/auth.
4. Whether a database migration is needed, and whether it's additive or could break an
   existing consumer.
5. Which existing ADRs (reports/architecture-decisions.md) or open questions
   (reports/open-questions.md) are relevant - are we about to relitigate something already
   decided, or duplicate something that already exists?
6. What could regress - name specific existing features that share code or data with this
   change.

Do not write code. Report findings only.
```

### Prompt 3 — Planning
```
Based on the impact analysis above, produce an implementation plan for <task>.

For each affected system, list:
- Files to create/modify.
- Order of implementation (cross-system: backend/API lands before its consumers).
- Tests you'll run.
- Docs you'll update (api/*.md, system-design/*, a tasks/ doc if this is Level 4-5).

Flag anything that needs my explicit approval before you touch it: schema change, API
breaking change, auth change, navigation change, anything Level 5 per AI_WORKFLOW.md's
mandatory-approval list.

Do not implement yet - wait for my approval.
```

### Prompt 4 — Implementation
```
Plan approved. Implement exactly what's in the plan above - no more, no less.

Before you start: run `git status` and tell me what's already modified/untracked that is
NOT part of this task, so we both know what must stay untouched (AI_RULES.md's
pre-existing-changes rule).

Then implement, staying inside the files you named in the plan. If you discover the plan
was wrong about a file or a fact, stop and tell me rather than silently expanding scope.
```

### Prompt 5 — Testing
```
Run the appropriate checks for what you just changed:
- Compile/typecheck/lint for every system you touched.
- Then actually exercise the change for real - curl the endpoint, run the query, or launch
  the app on the emulator (never the physical device; ask me first if you need it, per
  AI_RULES.md's emulator rule) - rather than treating a clean build as proof it works.

Tell me explicitly what you verified for real versus what you're only inferring from a
clean compile.
```

### Prompt 6 — Code review (fresh session, or `/code-review`)
```
You are reviewing a diff you did not write - you have no attachment to the approach taken.

Read: the actual diff (`git diff --stat` first for scope, then the full diff), the relevant
api/*.md and system-design/*.md for the area touched, and the task description: <paste
task/plan>.

Look specifically for:
- Unnecessary changes outside the stated scope.
- Missing edge cases.
- Anything that could break existing functionality - check what else calls the changed
  code, don't assume it's isolated.
- Security issues.
- API/contract inconsistencies with what api/*.md says should be true.
- Database problems, race conditions.
- Offline/sync correctness (system-design/03 and 05 state the rules that must hold -
  write-once vs last-write-wins, the sync counter, soft-deletes as sync markers).
- Inconsistent error handling.
- Missing tests.
- Documentation that's now out of date.

Report findings ranked by severity. Don't just say "looks good."
```
*(Prefer the installed `/code-review` skill when available — pass `--fix` if you want findings applied automatically, and pick effort by task level per §4.)*

### Prompt 7 — Debugging
```
Something is broken: <describe the symptom>.

Before proposing a fix:
1. Reproduce it if possible - run the actual code path, don't just read it and guess.
2. Check reports/open-questions.md and system-design/05-why-its-built-this-way.md - is
   this a known, already-flagged issue or a documented trade-off, not a bug?
3. If this is "works on the emulator, not on a real device" - check whether the backend
   was actually deployed before suspecting the app (AI_RULES.md's two-deploy-pipelines
   trap).
4. Identify root cause, not just the symptom.

Only then propose a fix, and tell me what you verified versus assumed.
```

### Prompt 8 — Cross-system feature
```
<Feature name> touches backend + admin + mobile.

Before implementing:
1. Write a tasks/TASK-xxx.md from tasks/TEMPLATE.md covering all three systems, with the
   backend/API subtask ordered first since admin and mobile both consume its contract.
2. Get my approval on that task doc.
3. Then implement the backend subtask fully, including updating the relevant api/*.md file
   to match what you actually built - not the plan.
4. Stop and tell me the API contract is ready (with the api/*.md diff) before starting
   admin or mobile work. Those sessions should treat api/*.md as ground truth, in case the
   backend implementation diverged from the original plan.
```

### Prompt 9 — Refactoring
```
I want to intentionally refactor <area> - this is not a feature or bug fix, don't bundle it
with one.

Before touching anything:
1. Identify every consumer of the code being refactored - grep, don't assume.
2. Confirm behavior is unchanged. This must be a pure restructuring, not a chance to also
   fix things you notice along the way.
3. If you find a real bug while reading the code, tell me separately rather than silently
   fixing it inside the refactor diff.
4. Run the full relevant test suite before and after to confirm no behavior change.

Do not refactor anything I didn't ask about, even if it looks messy.
```

### Prompt 10 — Architecture change
```
I'm considering an architectural change: <describe it>. This is a Level 5 task - do not
implement anything.

Instead:
1. Check reports/architecture-decisions.md for whether this relitigates an existing ADR,
   and if so, what specifically is different now that justifies revisiting it.
2. Lay out at least one real alternative and its trade-offs, the way this project's own
   ADRs do.
3. Identify every consumer/system this would affect.
4. Identify the migration/rollback path.

I will decide whether to proceed. If I do, write the decision as a new ADR in
reports/architecture-decisions.md before any implementation starts.
```

### Prompt 11 — Session handoff
```
We're stopping here for now. Before we end:
1. Update memory/STATUS.md with what shipped this session, what's verified vs not, and the
   exact next step - match the file's existing style.
2. If this was reports/-worthy work, write or update the reports/<NN-topic>/ entry.
3. Tell me exactly what's uncommitted right now (`git status`), so I know the state of the
   working tree before I close this window.

Do not commit anything unless I've explicitly asked you to.
```

### Prompt 12 — Completion
```
This task is done. Before I close it out:
1. List every file changed/added/deleted.
2. Confirm which docs you updated (api/*.md, system-design/*, ADRs) and which you
   deliberately did not, and why.
3. Update memory/STATUS.md's resume point.
4. Tell me what was verified for real versus only compiled/typechecked.
5. Tell me any risk or known gap I should be aware of, even a small one.

Do not mark anything "done" that wasn't actually exercised.
```

---

## 7. Cross-system development — worked example

Take a plausible next epic from this project's own backlog: **Push notifications**
(`reports/open-questions.md`: TICKET-705, "optional, evaluate need," never evaluated). This
is genuinely cross-system — backend needs to store device tokens and expose a send
mechanism, admin needs a compose/send screen, mobile needs to request permission, register
a token, and handle a received/tapped notification.

```
EPIC: Push notifications (resolves TICKET-705)
        |
        v
1. Architect/Planner session (no code)
   - Decide the provider (a real technical decision - flag for approval, don't default
     silently)
   - Write tasks/TASK-xxx-push-notifications.md, split into 3 subtasks, backend first
        |
        v
2. Backend Claude session (fresh; reads system-design/02, ADR-001/003, api/AUTH.md for
   auth-style consistency)
   - New migration, device-token storage, send-trigger endpoint(s)
   - Writes api/PUSH-NOTIFICATIONS.md documenting the real, shipped shape
        |
        v
3. Admin Claude session (fresh; reads only api/PUSH-NOTIFICATIONS.md + admin's existing
   pages/api.js pattern from system-design/04)
   - Compose/send screen, delivery log
        |
        v
4. Mobile Claude session (fresh; reads api/PUSH-NOTIFICATIONS.md + system-design/03 +
   ADR-007 for what's compatible with the Expo/expo-sqlite setup)
   - Permission request, token registration, notification handling
        |
        v
5. Integration testing (§11) - send a real notification from admin, confirm it's received
   on the emulator. Not three separate clean builds; one real end-to-end check.
        |
        v
6. reports/<NN>-push-notifications/, an ADR if the provider choice was non-obvious,
   memory/STATUS.md update
```

The **API contract is the seam** between steps 2→3 and 2→4 — admin and mobile sessions
never need to read backend Java; they read `api/PUSH-NOTIFICATIONS.md`, which is only
trustworthy once step 2 says it reflects what was actually built (see §8).

---

## 8. The API contract as the boundary

`api/` exists so a mobile or admin task never has to read backend Java, and a backend
task never has to read mobile/admin source to know who calls it. Rules for keeping that
true:

- **Creating an endpoint:** decide public vs admin using the actual test ADR-009 used —
  "does an unauthenticated client need this for offline content sync?" — not a default.
  Document it in the relevant `api/*.md` in the **same change** that implements it.
- **Additive changes** (new optional field, new endpoint): low-risk. Update `api/*.md`;
  note how existing consumers handle an unknown/absent field.
- **Breaking changes** (removing/renaming a field, making optional required, changing a
  status code's meaning): identify every real consumer by grepping
  `mobile/src/api/*.ts` and `admin/src/api.js` — not by trusting the doc, which can drift
  (see `api/EXAM-GUIDE.md`'s note that `GET /api/exam-guides` was documented as "what
  mobile syncs" but has no actual caller). Sequence it: ship an additive-compatible
  version first, migrate clients, remove the old shape in a later change. Requires
  approval (Level 4+).
- **Auth changes** (adding/removing `requireUser`/`requireAdmin` on an existing endpoint):
  always requires explicit approval. This is exactly the accidental-exposure/
  accidental-lockout class of mistake ADR-009 exists to prevent — never a side effect of
  an unrelated change.
- **Error changes:** keep the `{"error": string}` shape and the status-code semantics in
  `api/README.md`'s table. Don't invent a new error envelope for one endpoint.
- **Versioning:** there is none (flagged in `open-questions.md`). Don't invent a scheme
  unilaterally inside a feature change — that's a Level 5 decision needing an ADR.
- **Updating docs:** part of the definition of done (`AI_RULES.md` §3.5), and must
  reflect what was actually shipped, not the plan — plans and implementations diverge.
- **Testing consumers:** after any contract change, grep the real client code for callers
  and verify each still works against the new shape. Don't just trust that the doc update
  makes it true.

---

## 9. Git + Claude workflow

This repo's own history is solo, trunk-based commits (no PR merge commits visible) — the
workflow below matches that instead of imposing a heavier process it doesn't already use.

- **Branching:** Level 0–1 can go direct to `main`, matching existing practice. Level 2+
  gets a short-lived branch (`feat/<slug>` or `fix/<slug>`; use `feat/TASK-xxx-<system>`
  for Level 4 subtasks) — enough for a clean `git diff` to review before merging.
- **Claude never commits unasked.** Claude prepares and stages; you decide when and
  whether to commit, every time — this holds regardless of task level.
- **Inspect before merging:** `git diff --stat` for scope, then the full `git diff`.
  Anything outside the plan's named files gets flagged, not silently included.
- **Merging cross-system work:** backend merges first (its contract is the dependency
  root); admin and mobile merge once the `api/*.md` reflects what backend actually
  shipped — not what was planned before backend started.
- **Separate branches** are worth it whenever you want a clean diff for `/code-review` to
  look at, or whenever more than one system's work is happening concurrently.

---

## 10. Pre-existing changes — the strict protocol

**Claude must never assume all current git changes belong to the current task.** This
matters here specifically: `git status` at any point in this project's life can show
untracked/modified files from a session that's mid-flight in another window (this was
literally true during the previous phase of this project's own documentation work).

Protocol, every task:

1. **Before touching anything**, run `git status` and `git diff --stat`. This is the
   *baseline* — everything already dirty here existed before this task and is not this
   task's to touch, stage, or discard, unless the task explicitly says otherwise.
2. If something in the baseline is in the way of what you need to do, **stash it aside
   (with `-u` for untracked) or ask** — never discard it.
3. **After implementing**, diff the current state against the baseline. Only that delta
   is this task's change set.
4. **Stage only the delta.** A broad `git add -A`/`git add .` that would sweep in
   baseline files is exactly what this protocol exists to prevent.
5. If the task genuinely needs to modify a file that was already dirty before it started,
   **say so explicitly to the human before touching it** — don't fold someone else's
   in-progress edit into this task's diff silently.

This is Prompt 4's first line in practice — worth remembering even outside that exact
prompt.

---

## 11. Testing strategy

| Task type | Build/typecheck | Unit | Integration | API (real call) | UI (emulator/browser) | E2E | Regression check |
|---|---|---|---|---|---|---|---|
| Tiny change (L1) | Yes | If touched | — | — | Only if UI-visible | — | Skim nearby usages |
| UI feature (mobile/admin) | Yes | If exists | — | — | **Yes — actually run it** | — | Check shared components' other screens |
| Backend feature, no contract change | Yes | If service logic | If DB-touching | Yes, curl the changed endpoint | — | — | Check other callers of the changed service |
| API change | Yes | Yes | Yes | **Yes — every changed endpoint, success and error paths** | If a client exists, exercise it | Recommended | Grep + test every real consumer, not just the doc |
| Database/schema change | Yes | N/A | Yes, against a populated DB (this project's own bar — e.g. mobile migration `0013` verified against real pre-migration rows) | Yes if response shape changed | If mobile/admin surfaces the field | Recommended | Confirm existing rows survive byte-identical |
| Cross-system feature | Yes, all systems | Yes | Yes | Yes | Yes | **Yes — the full flow once all systems land** | Mandatory, explicit |
| Auth/security change | Yes | Yes | Yes | Yes — both allowed *and* denied paths (401/403) | Yes | Yes | Mandatory + `/security-review` |
| Offline/sync change | Yes | Yes | Yes | Yes | **Yes — actually go offline on the emulator** | Yes | Mandatory |
| Architecture change | Yes | Yes | Yes | Yes | Yes | Yes | Mandatory, full pass + rollback plan |

**"Clean build ≠ feature works" is not a slogan here — it's this project's own repeated
finding.** A `MultipleBagFetchException` was caught only by actually calling the sync-all
endpoint, not by a clean `mvn compile`. An em-dash encoding bug shipped and compiled fine
for who knows how long before it was noticed. A priority-scoring formula compiled,
typechecked, and passed review while being silently wrong until real seeded output was
read. Compile/typecheck/lint verify *correctness of syntax and types* — they say nothing
about *correctness of behavior*. Treat them as a floor, not a finish line.

---

## 12. AI code review

```
Requirements
    |
    v
Implementation (git diff)
    |
    v
Architecture (system-design/*, ADRs)
    |
    v
API contract (api/*.md)
    |
    v
Tests
    |
    v
Potential regressions
```

Use Prompt 6 (§6) or the installed `/code-review` skill — prefer the skill when
available; it's built for exactly this and supports `--fix` (apply findings) and effort
levels (match to task level per §4). For anything auth/security-adjacent, `/security-review`
is mandatory in addition, not instead.

The reviewer looks for, specifically: unnecessary changes, missing edge cases, broken
existing functionality, security problems, API inconsistencies, database problems, race
conditions, offline-sync issues, inconsistent error handling, performance problems,
incorrect assumptions, missing tests, documentation drift. A reviewer that just says
"looks good" hasn't done the job.

---

## 13. Failure-mode safeguards

| Failure mode | Safeguard | Enforced where |
|---|---|---|
| Reading too much context | Tiered context budget | §3, `AI_RULES.md` §1 |
| Making assumptions | "Ask, don't guess" on ambiguity/architecture; audit AI-authored specs before building | `AI_RULES.md` §3.16, §4 |
| Changing unrelated files | Pre-existing-changes baseline protocol | §10 |
| Breaking navigation | Don't touch `mobile/src/app/` routing unless required | `AI_RULES.md` §3.11 |
| Changing API contracts by accident | `api/*.md` update is part of "done"; grep real consumers | §8 |
| Ignoring existing architecture | Mandatory read-order before planning | `AI_RULES.md` §1 |
| Duplicating components | Prefer existing patterns; reuse pass via review | `AI_RULES.md` §3.8, §12 |
| Unnecessary dependencies | Explicit rule, citing ADR-002/003 precedent | `AI_RULES.md` §3.7 |
| Refactoring during feature work | Explicit rule; Prompt 9 isolates refactors | `AI_RULES.md` §3.10 |
| Skipping real testing / trusting a clean build | "Clean build ≠ works" rule + testing table | §11, `AI_RULES.md` §3.13/§5 |
| Forgetting doc updates | Doc update is part of "done"; Prompt 12 checklist | `AI_RULES.md` §2/§3.18 |
| Assuming the emulator reflects prod | Two-deploy-pipelines trap | `AI_RULES.md` §4 |
| Editing generated native code | Never edit `mobile/android/` | `AI_RULES.md` §4 |
| Confusing `exam_subjects`/`section_subjects` | Explicit callout, both docs and code | `AI_RULES.md` §4, `system-design/02` |
| Driving the wrong device | Emulator-only rule, pin `-s emulator-5554` | `AI_RULES.md` §4 |

---

## 14. Token efficiency — what Claude reads, and when

| Tier | Contents | When |
|---|---|---|
| **1 — Always** | `AI_RULES.md`, `memory/STATUS.md` | Auto-loaded every session via `CLAUDE.md`. Kept deliberately short. |
| **2 — Task-dependent** | The relevant `system-design/*.md`, the relevant `api/*.md`, relevant ADR(s), a `tasks/TASK-xxx.md` if one exists | Read once the task's level and affected systems are known (§2, §3) |
| **3 — Source-dependent** | The actual source files, their tests, migration files, DTOs | Read only once Tier 2 has pointed at exactly which ones |
| **4 — Rarely** | `offline-exam-app-requirements.md`, `preparation-os-requirements.md`, full `reports/<NN>/` folders, the whole repo | Only when genuinely needed for historical/product-decision context — not a default |
| **Not a Claude-context tier at all** | **This file, and its prompt library** | Read by *you*, the developer, to decide how to run a session and what to paste. Claude doesn't need to have ingested this file as "project knowledge" to do a task correctly — `AI_RULES.md` already carries everything Claude itself needs by default. Keeping this out of the auto-loaded chain is itself a token-efficiency decision: every Level-1 fix would otherwise pay for reading a 12-prompt library it will never use. |

---

## 15. When NOT to let AI decide alone

Mandatory human approval, no exceptions, regardless of how confident the plan looks:

- Auth/token scheme, CORS policy, anything in `ADR-001/003/009`'s territory.
- Any migration that isn't purely additive (dropping/renaming a column, changing a
  constraint on existing data).
- API breaking changes (§8).
- Deploy pipeline, secrets, the signing keystore — losing or leaking any of these is
  effectively unrecoverable (see `ADR-012`'s own "sharpest consequence" note).
- Data deletion (there's no account-deletion feature yet, and none should appear as a
  side effect of something else).
- Privacy-sensitive features — voice/photo capture (Future Vision Epic H2/H3), analytics
  scope beyond what's already decided (ADR-010).
- Production deploy timing/rollout decisions.
- Any Level 5 architectural trade-off (§2) — write the ADR after the human decides, never
  before.

This isn't distrust of the plan quality — it's that these are exactly the categories
where being wrong is expensive or irreversible, which is the same bar the base system
prompt already applies to destructive git/file operations.

---

## 16. Project growth strategy

Current scale (measured, not estimated): ~171 backend Java files, ~110 mobile TS/TSX
files, ~27 admin JS/JSX files, 18 migrations, 23 `reports/` folders — call it ~300–400
meaningful files. At this size:

| Scale | What changes | What does NOT get added yet |
|---|---|---|
| **Now (~300–400 files)** | Nothing. Docs (`system-design/`, `api/`, ADRs) + `AI_RULES.md` + git + real testing + focused sessions are fully sufficient. | RAG, vector search, multi-agent orchestration, custom tooling — all pure overhead here |
| **~500 files** | Watch for `system-design/04`'s lookup table starting to miss real destinations — the signal to prune/expand *that table*, not to add tooling. Consider one lightweight CI check: flag when a `controller/`/migration file changes without a matching `api/*.md`/`system-design/02` diff in the same PR — a grep-based check, not an AI-powered one. | Semantic search, RAG |
| **~1000 files** | Consider a proper code-search index if `Explore`/grep-based agents start taking noticeably long or costly. Consider splitting `reports/README.md`'s flat table by quarter/year if it gets unwieldy. MCP tools become worth it *if* an external system of record (a real ticket tracker, say) replaces the markdown mirrors — query it live instead of keeping a doc in sync by hand. | Multi-agent orchestration (this session's own `Workflow` tool) — still not justified by file count alone |
| **5000+ files, or genuinely concurrent contributors (human or AI)** | This is where RAG/vector search over the codebase, multi-agent orchestration, and CI-enforced automated review earn their complexity — because past this point no single session can hold "where does X live" in working memory even with excellent docs, and the coordination cost of multiple concurrent editors exceeds what git branches + a markdown lookup table can manage. | — |

**Explicit "not yet":** at today's scale, with one active contributor plus AI, adopting
RAG, a vector database, or a custom multi-agent framework would add real operational
complexity (things to configure, keep in sync, and debug) for no measured benefit. The
existing documentation system plus disciplined session/context habits (§1–§4) already
gets a fresh Claude session productive without reading the repository — that's the actual
goal, and it's already met.

---

## 17. The practical playbook

**"I have a new feature. What exactly do I do?"**

1. Classify it (§2). Level 0? Stop — go use the Admin UI, this isn't a Claude task.
2. `git status` — record the baseline (§10) before anything else.
3. Pick the session shape for this level (§1, §4).
4. Load only what §3's table says for this task shape.
5. Impact analysis (Prompt 2) for Level 2+.
6. Plan (Prompt 3); write `tasks/TASK-xxx.md` for Level 4–5.
7. Get approval — mandatory Level 3+.
8. Implement (Prompt 4) — named files only, re-check the baseline.
9. Test for real (Prompt 5, §11) — not just a clean build.
10. Review the diff yourself; `/code-review` (+ `/security-review` if relevant) for
    Level 3+, in a genuinely fresh session for Level 4–5.
11. Update docs as part of "done" — `api/*.md`, `system-design/*`, an ADR for Level 5.
12. Hand off or close out (Prompt 11/12) — `memory/STATUS.md`, explicit verified-vs-not.
13. You decide whether and when to commit. Claude prepares; it never commits unasked.
