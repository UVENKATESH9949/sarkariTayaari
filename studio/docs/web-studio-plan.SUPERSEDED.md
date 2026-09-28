# Web Studio — Implementation Plan (SUPERSEDED)

> **Superseded.** After this plan was written (including a working proof —
> `lessons/profit-and-loss.json` generated and rendered through the
> unmodified pipeline), the user clarified the actual requirement: video
> generation stays manual via chat (no automated LLM/orchestration pipeline,
> no API key needed), and the only web piece wanted is a **read-only output
> library** (browse already-generated videos by subject/topic/language). See
> `docs/video-library-plan.md` for the current, much smaller plan. This file
> is kept for the record of the options considered and why (Gemini vs
> Anthropic vs OpenAI for lesson generation, the dynamic-composition
> requirement, etc.) in case the automated version is revisited later.

Status: **planning only, not implemented, not currently planned to be built.**

## 1. What this milestone is

A web-based control panel ("Web Studio") that wraps the existing Milestones
1-4 pipeline (Lesson JSON -> TTS -> narration manifest -> Remotion render) in
a UI: Create Video -> Generate -> Review -> Preview -> Approve/Regenerate.
The UI never talks to Remotion, FFmpeg, or TTS/LLM providers directly — it
talks to a small orchestration backend that already knows how to drive the
existing packages.

## 2. Decision: real LLM lesson generation is in scope (Milestone 5, folded in)

Originally this plan scoped around the fact that no LLM lesson generator
existed yet, and had "Create Video" resolve typed topics against a small
catalog of hand-authored lessons only. That gap was demonstrated concretely
in-session: a new lesson (`lessons/profit-and-loss.json`) was hand-written to
match the exact schema an LLM would need to produce, and run through the
*unmodified* existing pipeline (`validateLesson` -> `synthesize-narration.ts`
-> Remotion render) with zero changes to any Milestone 1-4 package — proving
the schema is a real contract, not just documentation.

Given that proof, and the user's choice to use a free-tier LLM API (Google
Gemini, via [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
— no credit card required) rather than skip generation or run a local model,
**real lesson generation from an arbitrary topic is now in scope** for this
milestone. This changes two things from the original plan:

1. A new package, `packages/lesson-generator`, calls Gemini and produces a
   validated `Lesson`, with a repair/retry loop for invalid output (per the
   project brief's "don't blindly trust generated content" principle).
2. Because lessons are no longer a small fixed set, `apps/studio` needs **one
   dynamic Remotion composition** parameterized by lesson id, instead of
   hand-adding a `<Composition>` per lesson (see section 4a) — that was
   deferred in the previous version of this plan specifically because it had
   no payoff without real generation; it now does.

Language/difficulty fields feed the generation prompt for real (they
influence what Gemini produces). Duration is a *target*, not a guarantee —
the actual length still follows measured narration, per Milestone 3's
principle; the UI must not promise an exact duration. **Voice** continues to
map to the two real `TTSProvider` implementations (local SAPI, OpenAI).

## 3. Architecture

```
apps/web        Vite + React + TypeScript — the UI only. No generation logic.
apps/server     Node + Express — orchestration/API layer (the "control room" backend)
apps/studio     Existing Remotion app (Milestones 1-4) + ONE new dynamic composition
packages/lesson-generator NEW — Gemini-backed topic -> validated Lesson, with retry
packages/video-pipeline   NEW — reusable generation orchestration (Node-only)
packages/lesson-engine    UNCHANGED — schema + validation + JSON->scene rendering
packages/tts              UNCHANGED — provider-independent narration
packages/subtitle-engine  UNCHANGED
packages/shared           UNCHANGED — theme/config reused by apps/web directly
```

Why two new *apps* instead of restructuring `apps/studio`: the spec's
suggested `apps/studio/web` + `apps/studio/video` nesting would require
moving every existing Remotion file and rewriting their relative imports —
exactly the kind of "force a structure" the spec itself warns against.
Adding sibling apps (`apps/web`, `apps/server`) is the minimum clean change.

```
Web UI (apps/web)
    v  fetch()
Server API (apps/server)
    v
lesson-generator: topic+instructions -> Gemini -> validateLesson (retry on failure) -> lessons/<id>.json
    v
video-pipeline: synthesize narration -> bundle -> render (generic "Lesson" composition, inputProps: {lessonId})
    v                                  v                      v
lesson-engine (schema/render)      tts (providers)      @remotion/bundler + @remotion/renderer
```

## 4. New package: `packages/lesson-generator`

- `LessonGenerationProvider` interface (mirrors `TTSProvider`'s pattern):
  `generate(input: GenerationInput): Promise<Lesson>`, where `GenerationInput
  = { topic, instructions?, exam, subject, language, difficulty }`.
- `GeminiLessonGenerationProvider` — plain `fetch()` to Gemini's REST API
  (consistent with how `OpenAITTSProvider` avoids an SDK dependency), using
  `responseMimeType: "application/json"`. The prompt embeds: the schema
  description, the 5 available scene types and their fields, and 1-2
  few-shot examples (the Profit and Loss lesson generated in-session is a
  ready-made one).
- Retry loop: on `validateLesson()` failure, re-prompt once or twice with the
  specific validation errors appended ("Your previous output failed schema
  validation: `scenes.2.answer.atFraction: Required`. Fix and return the
  full corrected JSON."), per spec section 15/17. After the retry budget is
  exhausted, throw a typed `LessonGenerationError` with the last validation
  errors attached — the server turns this into the honest "AI generation
  failed" UI state (section 20), never a fabricated result.
- On success: writes `lessons/<slug>.json` (slug derived from topic + a short
  id to avoid collisions) so every generated lesson is a real, inspectable,
  re-renderable file — not a black box in a database.

## 4a. Required Remotion change: one dynamic composition

Today, each lesson needs a hand-written `apps/studio/src/lessons/<x>.tsx` +
a `<Composition>` entry in `Root.tsx` (fine for 3 hand-maintained lessons,
not viable once lessons are generated on demand under arbitrary ids). Add:

- One new composition, `id: "Lesson"`, `component: LessonComposition`,
  registered with `calculateMetadata(({ props }) => ...)` — Remotion's
  documented mechanism for computing `durationInFrames` dynamically per
  input. Given `props.lessonId`, it reads that lesson's
  `narration-manifest.json` (already on disk from the synthesis step, which
  always runs before render) to compute the total duration — the same math
  `buildLessonScenes`/`computeSequenceDuration` already do.
- `LessonComposition` itself receives `{ lessonId }` and loads the matching
  lesson JSON + manifest via a webpack "dynamic import with expression"
  (`import(\`../../../../lessons/${lessonId}.json\`)`), using Remotion's
  `delayRender()`/`continueRender()` pattern for the async load — a
  documented, standard Remotion idiom for props-driven async data.
- The three existing hardcoded compositions (`PercentageBasics`,
  `SimpleInterestBasics`, `ProfitAndLoss`) are left in place (harmless,
  zero risk) rather than migrated — no reason to touch working code. The
  server's render step always targets the new generic `"Lesson"` composition
  with `inputProps: { lessonId }` for anything it generates, so the catalog
  the server needs to maintain shrinks to just "which lesson ids exist,"
  not "which lesson id maps to which composition id."

## 5. New package: `packages/video-pipeline`

- `createProvider(name)` — moved from the CLI script; maps `"openai" |
  "local"` to a `TTSProvider` instance + file extension. Shared by CLI and
  server.
- `synthesizeLessonNarration(lesson, provider, fileExtension, outputDir,
  onProgress?)` — extracted from the current script body; writes audio +
  returns a `NarrationManifest`. `onProgress(sceneId, index, total)` lets
  callers report real per-scene status.
- `renderLessonVideo({ entryPoint, lessonId, outputPath, onProgress })` —
  new. Uses `@remotion/bundler`'s `bundle()` + `@remotion/renderer`'s
  `selectComposition`/`renderMedia` programmatically against the generic
  `"Lesson"` composition (section 4a), so `onProgress` gets **real**
  frame-encoding percentages, not a simulated bar. Requires adding
  `@remotion/bundler` and `@remotion/renderer` as dependencies (version-match
  the already-installed `remotion`/`@remotion/cli`, 4.0.525).
- `scripts/synthesize-narration.ts` shrinks to: read lesson JSON, call
  `createProvider` + `synthesizeLessonNarration`, write the manifest. No
  behavior change, no duplicated logic with the server.

## 6. New app: `apps/server` (Express + TypeScript, run via `tsx`)

In-memory job store (a `Map`), plus one small JSON index file
(`output/videos-index.json`) for the "My Videos" library — explicitly not a
database, but leaves a clean seam for a real one later.

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | Centralized options: languages, difficulties, durations, voices (derived from real `TTSProvider`s) |
| POST | `/api/videos` | Body: `{topic, instructions?, language, difficulty, duration, voiceId}` -> `{jobId}`. Always attempts real generation now (no catalog-only fallback) |
| GET | `/api/videos/jobs/:jobId` | Poll status: `{stage, progress, stageDetails[], error?, videoId?}` |
| GET | `/api/videos` | List generated videos (from the JSON index) |
| GET | `/api/videos/:videoId` | Single video record: metadata + lesson scene structure (for the review page) |
| POST | `/api/videos/:videoId/regenerate` | Re-runs generation with the video's original stored input -> `{jobId}` |
| GET | `/media/output/*` | Static-serves rendered MP4s for the `<video>` player / download |

Job stages, all real: `generating-lesson` (Gemini call + validation/retry) ->
`generating-narration` (real per-scene TTS progress) -> `preparing-visuals`
(bundling) -> `rendering-video` (real `renderMedia` progress) ->
`finalizing` -> `completed` | `failed`. A `failed` job carries which stage
failed and a human-readable reason (schema validation exhausted retries, TTS
error, render error) — never silently treated as success.

## 7. New app: `apps/web` (Vite + React + TypeScript + react-router-dom)

Pages: `Dashboard` (light summary/placeholder), `CreateVideo` (the form),
`GenerationProgress` (`/generate/:jobId`, polls status every ~1.5s, renders
the checklist from the spec's mock), `VideoReview` (`/videos/:videoId`,
player + scene list + Regenerate + Download), `MyVideos` (library list),
`Templates` (placeholder cards, informational only — but real templates would
plug into `lesson-generator`'s prompt, so the page should say so), `Settings`
(shows *which* providers are configured server-side via `/api/config`,
never keys).

`src/services/api.ts` — the only place that calls `fetch`:
`createVideo()`, `getGenerationStatus(jobId)`, `getVideo(id)`,
`listVideos()`, `regenerateVideo(id)`, `getConfig()`.

Styling: plain CSS using design tokens imported directly from
`@sarkaritaayari/shared`'s `theme` (already a plain-JS export, consumable by
Vite/React with no changes).

No timeline editor, no keyframe UI, no drag-and-drop — scene review is a
simple expandable list (id, heading/title, narration text, duration).

## 8. Root-level wiring

- `npm run dev:server`, `npm run dev:web` (individual), plus `npm run
  dev:studio-web` using `concurrently` (new, justified dependency) to run
  both together.
- `apps/server` env: reuses the existing root `.env`, adds `GEMINI_API_KEY`
  alongside the existing `OPENAI_API_KEY` — same file, same gitignore
  treatment, no new secret-handling mechanism.

## 9. Testing plan (once implemented)

1. `tsc --noEmit` across every package/app (including the new ones).
2. Confirm `scripts/synthesize-narration.ts` still works unchanged after the
   video-pipeline extraction (regression check on Milestones 1-4).
3. Unit-level check of `lesson-generator`'s retry loop using a mocked
   provider that deliberately returns invalid JSON once, then valid JSON —
   confirm it recovers instead of failing on the first bad attempt.
4. Start `apps/server` alone; `curl` through the full flow for a genuinely
   new topic (not one of the 3 existing lessons) end to end: create -> poll
   to completion -> fetch video record -> confirm the MP4 file is real and
   non-trivial size. Also re-run Percentage Basics / Simple Interest /
   Profit and Loss through the same path.
5. `curl` a request designed to make Gemini fail schema validation
   repeatedly (or temporarily point at a bad API key) and confirm the job
   ends in a clean `failed` state with a readable reason, not a hang or a
   fake success.
6. Start `apps/web`; drive the real UI flow in a browser before calling this
   done — per the project's standing rule that a frontend change isn't
   verified until exercised in a live browser.
7. Re-render `PercentageBasics`/`SimpleInterestBasics`/`ProfitAndLoss` via
   the *existing* `npm run render:*` scripts directly (bypassing the server)
   to confirm the Milestone 1-4 pipeline and the 3 hardcoded compositions are
   untouched.

## 10. Explicit non-goals (unchanged from the request)

No database, no auth, no multi-user, no cloud deploy, no timeline editor. The
existing 3 hardcoded compositions are not migrated to the dynamic one (no
benefit, only risk).

## 11. Open decisions worth confirming before implementation starts

- Ports for `apps/server` (suggest 4000) and `apps/web` (Vite default 5173).
- Exact Gemini model id to target (e.g. `gemini-2.0-flash` or `gemini-2.5-flash`
  depending on what's current/free-tier-eligible at implementation time).
- Retry budget for lesson generation (suggest 2 retries = 3 attempts total)
  and request timeout.
- Whether `concurrently` is acceptable as a new dependency (small, dev-only).
