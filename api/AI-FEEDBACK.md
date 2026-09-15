# AI Feedback — live per-student narratives (`/feedback`, `/profile-summary`)

Covers `SessionFeedbackController` (Practice, Phase 7.1), `MockAttemptFeedbackController` (Mock
Test, Phase 7.2), and `ProfileSummaryController` (Preparation Radar, Phase 7.3) — the first
endpoints in this backend that call `AIService` directly, per request, for one specific signed-in
student. Everything else under `ai/` (see [AI-CONTENT.md](AI-CONTENT.md)) is
batch-generate-then-review: an explanation for a given question is identical for every student
who sees it, so it's generated once and reused. A personal narrative is different by nature —
it's about *this* student's own state, so there is nothing to pre-generate or share.

The three endpoints all go through one `PersonalNarrativeService`, and the two `/feedback`
endpoints share everything except which table they read/persist against — same
`SESSION_FEEDBACK` task, same request/response shape. They're separate controllers rather than
one branching on `sessionKind`, because Practice sessions and Mock Test attempts already live in
genuinely separate tables (`user_practice_sessions`/`user_mock_attempts`) throughout this
backend — matching that existing split rather than introducing a new shared one just for this
feature. `ProfileSummaryController` is a different task (`PROFILE_SUMMARY`) with a different
request shape (see its own section below) but the identical flag-gate/generate/validate/
never-throw posture.

**What the model is and isn't trusted for.** The request body already carries every fact the
narrative can reference (accuracy, per-topic health/trend/state) — computed client-side by the
existing deterministic Weakness Radar/intelligence layer, the same context `SessionContext` in
`packages/core/src/ai/context/types.ts` already builds. The model is asked only to phrase those
facts into 2-4 encouraging sentences; it is never asked to compute or choose a fact itself. The
response is validated against exactly the given numbers/topic names before it is returned — see
"Grounding" below.

**Auth:** `Authorization: Bearer <token>` — any signed-in student (`requireUser`). Not public;
this is per-student generation, not content sync.

**Consumers:** Mobile (`mobile/src/ai/sessionFeedback.ts`'s `getOrBuildSessionFeedback`/
`getOrBuildMockFeedback`, called from the Practice Summary and Mock Test Result screens
respectively — both delegate to one shared internal `getOrBuildNarrative`).

---

### POST /api/practice-sessions/{sessionId}/feedback

**Purpose:** Generate a short AI-phrased feedback narrative for one just-finished session.

**Path param:** `sessionId` — identifies which session the narrative is *about*. It does **not**
need to exist in this backend's `user_practice_sessions` table yet — a device can ask for
feedback before its own sync has run. When the row does exist and belongs to the caller, the
result is opportunistically cached onto it (`feedback_narrative`/`feedback_generated_at`) so
reopening the same session's Summary screen doesn't re-generate (and re-bill) an unchanging
result. A missing/foreign session id is silently a no-op for persistence — never an error.

**Request:**
```
{
  sessionKind: "PRACTICE" | "MOCK",
  examCode: string | null,
  answeredCount: number,
  correctCount: number,
  accuracyPercent: number,
  preferredLanguage: "en" | "hi",
  topics: [
    {
      topicId: string, topicName: string, subjectName: string,
      state: string, healthScore: number | null, trend: string,
      reasonCodes: string[]
    }
  ]
}
```
Field names match `packages/core/src/ai/context/types.ts`'s `SessionContext`/`TopicSnapshot`
exactly — the mobile client builds that shared shape and sends it verbatim.

**Response:** `200 OK`:
```
{ narrative: string | null }
```
`narrative` is `null` — **never** a 4xx/5xx — whenever there is nothing to show: the
`SESSION_FEEDBACK` task is disabled in `ai_task_flags` (checked before a prompt is even built),
the provider call failed, or the response failed grounding. A caller treats this exactly like
any other `UNAVAILABLE` tier outcome — render nothing extra, the screen's own stat blocks are
already correct without it (`groundTruthFallback: null` in the shared task registry). The mobile
client falls back to `sessionFeedbackTemplate` (a canned-sentence template, `packages/core`'s
`SESSION_FEEDBACK` `DETERMINISTIC` tier) whenever this returns null.

**Grounding.** Before a narrative is returned: every number it cites must be traceable to a
number it was given (rounded), and it must name at least one topic it was actually given, when
any were supplied. Enforced server-side by `PersonalNarrativeGrounding`/
`PersonalNarrativeValidation` — a mirror of `packages/core/src/ai/schema/validate.ts`'s
`groundedNarrative`, proven to agree on every case in
`sample-data/personal-narrative-grounding-fixtures.json` (the same shared-fixture-parity
discipline `ai-answer-grounding-fixtures.json` already established for `QUESTION_EXPLANATION`).
A response that fails either check is treated the same as a disabled flag — `narrative: null`.

**Errors:** `401` with no/invalid `Authorization` header. No other error status — every other
failure mode (flag off, provider error, malformed/ungrounded response) resolves to `200` with
`narrative: null`.

**Not built, and not this endpoint's job:** `PROFILE_SUMMARY` (the Profile-screen equivalent,
Phase 7.3) shares the same prompt/validation machinery (`PersonalNarrativePrompts`/
`PersonalNarrativeGrounding` both already have a `PROFILE_SUMMARY`-shaped half) but has no
controller endpoint yet.

---

### POST /api/mock-attempts/{attemptId}/feedback

**Purpose:** Generate a short AI-phrased feedback narrative for one just-finished Mock Test
attempt. Identical request/response shape, grounding, and error behavior to the Practice endpoint
above — everything in that section applies here verbatim, substituting `attemptId` for
`sessionId` and `user_mock_attempts` for `user_practice_sessions`.

**Path param:** `attemptId` — identifies which `UserMockAttempt` row the narrative is about; same
"doesn't need to exist here yet" and "opportunistic persistence, never required" behavior as
`sessionId` above.

**One real difference, not a contract difference: what `topics` contains in practice.** A mock
attempt's stored results carry `subjectName` per question but no `topicId` (Mock Test spans an
entire exam's syllabus, unlike a single-topic Practice session), so the mobile client always
sends `topics: []` for this endpoint today — the narrative it gets back is accuracy-only, never a
per-topic diagnosis it has no grounded data to support. Nothing server-side prevents a future
caller from supplying real topic snapshots here; the empty array is the mobile client's own
current honest limit, not an endpoint restriction.

**Request/Response/Errors/Grounding:** see the Practice section above — byte-for-byte identical.

---

### POST /api/exams/{examCode}/profile-summary

**Purpose:** Generate a short "how you're doing overall" narrative for the Preparation Radar
screen's strengths/weaknesses — a coach's note, not a to-do list (that framing is Preparation
Radar/Plan's own job, not this task's).

**Task:** `PROFILE_SUMMARY`, not `SESSION_FEEDBACK` — a different `ai_task_flags` row, gated and
generated independently of the two `/feedback` endpoints above, though through the same
`PersonalNarrativeService`.

**Path param:** `examCode` — mirrors the existing `GET /api/exams/{code}/weakness-radar`
convention.

**Cached server-side, keyed on a content hash** (`user_profile_summaries`, migration V45). Unlike
the two `/feedback` endpoints — which cache onto the completed session/attempt row they describe —
a profile summary has no natural row to attach to, so it gets its own one-row-per-(user, exam)
cache. The key is a SHA-256 over exactly the facts a narrative may cite (exam, overview status,
coverage counts, and every strength/weakness with its state/trend/health). That is deliberately
**not** a `computedAt` comparison: the radar recomputes on a schedule whether or not anything a
narrative could mention actually moved, so hashing the facts means an unchanged profile is served
free, and any real change regenerates.

This replaced the v1 decision to ship with no cache at all. Real measurement (2026-09-14, against
live Groq) showed this one surface was **~48% of per-user AI calls and ~57% of per-user cost**,
entirely from regenerating identical narratives on every screen open, pull-to-refresh, or
sync-counter change. The client still issues the request each time (cheap); the server answers
from cache without spending tokens.

**Request:**
```
{
  examCode: string,
  overviewStatus: "NO_DATA" | "GETTING_STARTED" | "BUILDING" | "ON_TRACK" | "STRONG",
  topicsInSyllabus: number,
  topicsWithEvidence: number,
  strengths: [ { topicId, topicName, subjectName, state, healthScore, trend, reasonCodes } ],
  weaknesses: [ { topicId, topicName, subjectName, state, healthScore, trend, reasonCodes } ],
  preferredLanguage: "en" | "hi"
}
```
Field names match `packages/core/src/ai/context/types.ts`'s `LearnerProfileContext` exactly.
`strengths`/`weaknesses` are already ranked by the Weakness Radar (strongest/most-urgent first) —
this endpoint does no ranking of its own, only phrasing.

**A note on output ceilings, true for all three endpoints.** The wire-level `max_tokens` sent to
the provider (1000) is deliberately larger than the shared task registry's `maxOutputTokens: 300`
for these tasks. The registry figure is how long the *answer* should be; the wire cap must also
cover what a reasoning model spends thinking before it emits any answer. Measured the hard way:
`gpt-oss-120b` on a realistic 6-topic profile burned all 300 tokens reasoning and was cut off
mid-JSON (`finishReason=length`), which surfaced as a `NOT_JSON` rejection and a silent `null` —
on the exact payload shape a real student is most likely to produce. Raising the ceiling costs
nothing in expectation, since a caller is billed for tokens generated, never for the cap.

**Response/Errors/Grounding:** identical shape and rules to the two `/feedback` endpoints above
(`{ narrative: string | null }`, `401` only failure status, grounding checked against every
number/topic name actually supplied). The mobile client (`mobile/src/ai/profileSummary.ts`'s
`getOrBuildProfileSummary`) falls back to `profileSummaryTemplate` (`PROFILE_SUMMARY`'s
`DETERMINISTIC` tier) whenever this returns null, and skips calling this endpoint at all when
`topicsWithEvidence` is 0 — nothing to summarise yet, matching the screen's own "invitation, not
an empty radar" state for a student who hasn't practised.

---

### POST /api/questions/{questionId}/mistake-analysis

**Purpose:** Why *this* student got *this* question wrong — TASK-2701 Phase 7.4
(`MISTAKE_ANALYSIS`). The fourth Phase 7 task and the only one whose payload is structured rather
than a single narrative, because the classification is what makes it actionable: "you misread the
question" and "you have never learned this" call for different next steps, and a free-text
paragraph cannot be counted or filtered later.

**Auth:** signed-in user (`requireUser`). Nothing is stored, but the request body carries that
student's own history.

**Request body**

| Field | Notes |
|---|---|
| `questionText`, `options` | The question as shown. |
| `correctAnswerText` | **Verified**, supplied to the model, never asked of it — the rule the whole `ai/` layer is built on. |
| `selectedAnswerText` | What the student picked, or `null` when they left it unanswered (normal in Mock Test). |
| `subjectName`, `topicName` | |
| `topicState` | The **qualitative** topic-health label (`NEEDS_ATTENTION` …), never a score. |
| `timesAnsweredWrong` | How often this question appears wrong in their retained history, **including the attempt being analysed** — so `1` is a first miss and `2+` a repeat. Rendered into the prompt in words, not as a count (see below). |

**Response:** `{ mistakeType, explanation, suggestedAction }`, every field `null` together when the
task is disabled, the provider fails, or validation rejects the output. A payload that fails
validation is discarded whole — never shown with one salvaged field. `401` is the only failure
status; nothing else is an error to the student.

`mistakeType` is one of the nine values in `MISTAKE_TYPES`
(`packages/core/src/ai/schema/types.ts`), and the Java copy in `MistakeAnalysisValidation` must
stay in step with it.

**Generated only on an explicit tap.** The Wrong Answers list can hold hundreds of rows, so
generating as cards render would spend a model call each. The mobile client
(`mobile/src/ai/mistakeAnalysis.ts`) caches per question **in memory** for the session: a finished
wrong answer is immutable history, so it never needs asking twice within a session. Deliberately
not a durable cache — unlike `PROFILE_SUMMARY`, which regenerated automatically on every screen
open and needed one (V45).

**No grounding check on the output, unlike the three endpoints above — and this is the one real
design difference worth reading before changing anything here.** Both of that rule's halves were
tried against real Groq output and both rejected *correct* analyses:

- the topic-name rule rejected *"you picked 50 km/h, but 120 km over 2 hours is 60"* for never
  naming the topic — but this task's subject is one question, not a topic;
- the number rule rejected an analysis for citing `0.15` while correctly working 15% out as a
  decimal. Showing the working **is** the explanation on a quantitative question, so a
  literal-number allowlist fights the feature itself.

The protection those rules give — no invented statistic about the student — is instead achieved
on the **input** side: no numeric learner fact is sent at all (the topic state goes as a label,
the repeat signal in words), and the prompt states that any such figure would be invented.
*Residual risk, stated rather than hidden:* a model could still hallucinate a performance figure
unprompted and nothing would catch it. Accepted because the verified answer is supplied and the
authored explanation always renders above this card.

**Why the repeat signal is qualitative.** A real Groq call read a bare `1` under a "wrong before"
label as "once before" and returned `REPEATED_MISTAKE` for a first-time miss — telling the student
they had "repeatedly confused" something they had got wrong once. The prompt now says it in words
("This is the first time they have missed this question"), which removes the ambiguity and keeps a
countable statistic out of the prompt at the same time.

**Fallback:** `mistakeAnalysisTemplate` (`MISTAKE_ANALYSIS`'s `DETERMINISTIC` tier) whenever this
returns null. It can only establish `REPEATED_MISTAKE` or `KNOWLEDGE_GAP` — every other type needs
a model to actually read the question and its distractors, and guessing between them would produce
a confident-sounding diagnosis with nothing behind it.
