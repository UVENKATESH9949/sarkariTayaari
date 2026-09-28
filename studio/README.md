# SarkariTaayari AI Video Studio

An independent, experimental project for generating educational videos for
Indian government-exam preparation using AI-assisted content creation and
programmatic (Remotion) video rendering.

## Where this sits now

This folder used to be a separate repository at `C:\AIVideos`. It now lives inside
the main SarkariTaiyaari repository, at `studio/`, so the lesson schema, the
renderer and the app that serves the finished videos are all in one place.

**Nothing about how you generate a video changed.** It is still a command-line
toolchain — Remotion renders through a headless browser and narration is
synthesised by local Windows text-to-speech — neither of which can run inside the
Spring backend or the admin website, so this was not merged into either.

**It is its own npm project, like `mobile/` and `admin/`.** It is deliberately NOT
a workspace of the root `package.json`: this folder is already a workspace root of
its own (`apps/*`, `packages/*`), and nesting one inside another makes npm resolve
the two sets against each other. Run `npm install` here, not at the repository root.

**How a rendered video reaches students:**

```
studio/lessons/<id>.json   ->  blueprint, pasted into the admin AI Videos page
studio/output/<id>.mp4     ->  the file, attached on that same page
                                        v
                          Admin watches it, presses Accept & publish
                                        v
                          Backend uploads it to Cloudinary and links it to the topic
                                        v
                          Mobile AI Videos shows it under that topic
```

The upload is the integration point because this studio has no API. The topic is
chosen from a dropdown of real topics rather than matched on name — the studio
says "Profit and Loss" where the app's topic is "Profit & Loss", and guessing
across that gap is how a lesson ends up filed under the wrong topic.

The rest of this document describes the studio itself and is unchanged.

## Status: Milestone 4 complete + Video Library

Three lessons exist today: **Percentage Basics**, **Simple Interest**, and
**Profit and Loss** — the last one authored in-chat as a live proof that the
Lesson JSON schema is a real contract: it was written by hand to the exact
shape an LLM would need to produce, then run through the *unmodified*
pipeline (`validateLesson` → synthesize → render) with zero engine changes.
See [Video Library](#video-library) below for how to browse all of them.

**Video generation is intentionally manual for now** — done in a chat session
like this one, not via a self-serve web form or an automated LLM pipeline.
That direction (a `packages/lesson-generator` calling an LLM API at runtime)
was designed and then deliberately shelved; see
`docs/web-studio-plan.SUPERSEDED.md` if it's revisited later. AI-generated
images per topic are also a deliberate non-feature right now — decided
per-video, in-chat, when a topic actually calls for one.

Milestone 1 proved Remotion alone could produce a professional, motion-driven
educational video. Milestone 2 proved the scene architecture generalizes
across topics. Milestone 3 proved the pipeline can be narration-driven
(duration follows measured audio, not a guess). Milestone 4 replaces
hand-written lesson code with a **validated Lesson JSON schema**:

```
lessons/<id>.json  (hand-authored today, LLM-generated from Milestone 5)
        v
validateLesson()  <- zod schema, rejects malformed input with a clear error
        v
   +----+----+
   |         |
narration   visual scene specs (fractional timing, e.g. "reveal at 32%")
   v         v
TTS       lessonToSceneSpecs() + buildLessonScenes()
   v         v
   +----+----+
        v
Remotion render
```

A lesson is now a single JSON file under `lessons/`. Both the narration
synthesis script and the Remotion app read the *same* file — there is no
lesson-specific TypeScript left to write. `apps/studio/src/lessons/*.tsx`
shrank to ~10 lines each: load the lesson JSON, validate it, load the
narration manifest, build scenes. Adding a lesson is now purely a data change.

**Current TTS provider: local Windows SAPI voice** (no API key required).
Voice quality is robotic — this validates timing/subtitles/motion/pipeline
correctness, not final narration quality. Swapping to a cloud provider
(OpenAI TTS is already implemented, needs a funded API key) is a one-flag
change; see [Switching TTS provider](#switching-tts-provider).

## Repository layout

```
lessons/<id>.json                Lesson JSON — narration + visual content + timing, per scene

apps/studio/                     Remotion app: composition registration only
  public/audio/<lessonId>/        Generated narration audio + narration-manifest.json (gitignored)
  src/Root.tsx                    Registers each lesson as a Composition
  src/lessons/<topic>.tsx          ~10 lines: validate lesson JSON, load manifest, build scenes

packages/lesson-engine/          Lesson JSON schema, validation, and JSON -> scene rendering
  src/schema.ts                   zod schema (Lesson, discriminated union of 5 scene types)
  src/validateLesson.ts           Parses + validates, throws a readable per-field error list
  src/renderScene.tsx              Scene-type dispatch: JSON props -> the matching scene-engine component
  src/lessonToSceneSpecs.ts        Lesson -> LessonSceneSpec[] for buildLessonScenes

packages/scene-engine/           Reusable, prop-driven scene components + sequencing
  src/scenes/                      TitleScene, ConceptScene, ExampleScene, FormulaScene, SummaryScene
  src/SceneSequence.tsx            Crossfade sequencing + per-scene audio + optional background music
  src/buildLessonScenes.ts         Turns (content specs + narration manifest) into SequenceScene[]
  src/SceneContainer.tsx           Shared background/layout wrapper
  src/SubtitleOverlay.tsx          Renders whichever subtitle is active for the current frame
  src/AnimatedCounter.tsx          Spring-driven number counter

packages/tts/                    Provider-independent narration
  src/types.ts                     TTSProvider interface
  src/providers/OpenAITTSProvider.ts    Cloud provider (needs OPENAI_API_KEY + billing)
  src/providers/LocalSapiTTSProvider.ts   Local Windows provider (no key, robotic voice)
  src/audio/getAudioDuration.ts     Reads duration from the audio file itself (music-metadata)
  src/audio/measureLoudnessGain.ts   ffmpeg loudnorm analysis -> volume gain for consistent loudness

packages/subtitle-engine/        Narration text + duration -> synced Subtitle[] cues
  src/generateSubtitles.ts         Sentence-aware splitting, proportional timing, word-timing support

packages/shared/                 Centralized video config, theme tokens, shared types (incl. NarrationManifest)

scripts/synthesize-narration.ts  Offline step: lesson JSON -> TTS -> manifest. Not run during render.
scripts/build-library.ts        Scans lessons/ + output/ -> library/library.json
scripts/serve-library.ts        Minimal static file server for the library/ page

library/                         Read-only video browser (plain HTML/CSS/JS, see "Video Library" below)
  index.html / style.css / app.js  Real source, tracked
  library.json                     Generated by build-library.ts, gitignored

compositions/                    Reserved for a future multi-lesson composition registry
templates/                       Reserved for visual templates (styling variants)
assets/                          Reserved for illustrations, icons (not audio — see public/audio/ above)
output/                          Rendered videos, named output/<lessonId>.mp4 (gitignored)
tests/ docs/                     Reserved as they arrive; docs/ has the (superseded) Web Studio design
```

## Requirements

- Node.js 18+ (developed on Node 24)
- No system FFmpeg needed for rendering — Remotion bundles its own compositor.
  `ffmpeg-static` is used separately for loudness *measurement* only.
- Windows, for the local SAPI TTS provider (uses PowerShell + System.Speech).
- An `OPENAI_API_KEY` with billing enabled, only if using the OpenAI provider.

## Setup

```bash
npm install
cp .env.example .env   # only needed for the OpenAI provider — fill in OPENAI_API_KEY
```

## Generating a lesson end to end

1. **Synthesize narration** (reads `lessons/<id>.json`, writes audio + manifest to `apps/studio/public/audio/<id>/`):
   ```bash
   npm run synthesize:percentage-basics          # OpenAI TTS (needs OPENAI_API_KEY + billing)
   npm run synthesize:percentage-basics:local    # Local Windows voice, no key needed
   npm run synthesize:simple-interest-basics
   npm run synthesize:simple-interest-basics:local
   npm run synthesize:profit-and-loss
   npm run synthesize:profit-and-loss:local
   ```
   This must be re-run any time `lessons/<id>.json` changes — the render step
   never calls the TTS provider itself.

2. **Render the video** (purely deterministic — reads the manifest, no network calls):
   ```bash
   npm run render:percentage-basics
   npm run render:simple-interest-basics
   npm run render:profit-and-loss
   ```

Output lands in `output/<id>.mp4` (H.264/AAC MP4, 1920x1080) — that exact
path is also what [Video Library](#video-library) looks for, so a lesson
shows up there automatically once rendered this way.

## Previewing scenes during development

Launch the interactive Remotion Studio (hot-reloading timeline + player):

```bash
npm run studio
```

To render a single frame as a still, or a scene's exact frame range, without
rendering the whole video:

```bash
cd apps/studio
npx remotion still PercentageBasics ../../output/still.png --frame=1400
```

## Switching TTS provider

`scripts/synthesize-narration.ts` takes the provider as its second argument
(`openai` is the default, `local` is the other implemented option):

```bash
tsx scripts/synthesize-narration.ts lessons/percentage-basics.json openai
tsx scripts/synthesize-narration.ts lessons/percentage-basics.json local
```

Nothing else in the codebase depends on which provider was used — lesson
files only ever read the resulting manifest. Adding a third provider (e.g.
ElevenLabs) means implementing `TTSProvider` in `packages/tts/src/providers/`
and adding one branch to `createProvider()` in the synthesis script.

## The Lesson JSON schema

A scene in `lessons/<id>.json` looks like this (full schema in
`packages/lesson-engine/src/schema.ts`):

```json
{
  "type": "concept",
  "id": "concept",
  "narration": "Let's start with the word itself. “Percent” means “per hundred.” ...",
  "heading": "What does \"Percent\" mean?",
  "breakdown": [{ "text": "Per" }, { "text": "Per Hundred", "emphasis": true }],
  "grid": { "fillTarget": 40, "start": 0.32, "end": 0.68, "resultPrefix": "40 out of 100 =", "resultValue": "40%" }
}
```

Two design choices worth knowing:

- **Timing is fractional (0-1), not frames.** `start`/`end` describe *when
  within this scene's final duration* something happens (e.g. "the grid
  fills between 32% and 68% through"). Absolute frame numbers only make
  sense once narration audio has been measured, which happens after this
  JSON is written — `renderScene()` converts fractions to frames at render
  time, once `durationInFrames` is known.
- **Colors are semantic tokens**, not hex codes (`"color": "accent"` or
  `"muted"`, mapped in `renderScene.tsx`). This keeps the schema
  template-friendly and is what an LLM should output in Milestone 5, rather
  than reasoning about a specific hex palette.

`validateLesson()` runs a zod schema over the whole file before anything
else happens — this is the "don't blindly trust generated content"
checkpoint the project brief calls for, and it already produces useful
per-field errors (verified: a scene missing required fields fails with
`scenes.0.title: Invalid input: expected string, received undefined`, not a
raw stack trace).

### Adding a new lesson

1. Create `lessons/<topic>.json` following the schema above (5 scene types
   available: `title`, `concept`, `example`, `formula`, `summary`).
2. Add `synthesize:<topic>` / `synthesize:<topic>:local` scripts pointing at it.
3. Create `apps/studio/src/lessons/<topic>.tsx` (copy `percentageBasics.tsx`
   and change the two JSON import paths).
4. Register it as a `<Composition>` in `apps/studio/src/Root.tsx`.

If a lesson needs a visual shape none of the five scene types support, that's
a signal to add a new scene type to `scene-engine` + `lesson-engine`, not to
bend an existing one.

## How narration drives duration and visuals

`durationInFrames` for a scene is only known *after* synthesis measures the
actual audio. `renderScene()` places visual beats as a fraction of it (e.g.
"fill the grid between 32% and 68% through the scene") instead of a fixed
frame count, so the same JSON adapts whether the narration ends up being 15
seconds or 35 seconds.

Padding: each scene gets a configurable lead-in (silence before narration
starts, default 0.35s) and tail (silence after it ends, default 0.6s),
settable per scene via `leadInSeconds` / `tailSeconds` in the JSON.

Subtitles come from `@sarkaritaayari/subtitle-engine`'s `generateSubtitles()`,
which splits narration into sentence-aware, character-capped cues and
distributes the *measured* audio duration across them proportionally. This is
a heuristic, not word-level alignment (OpenAI's TTS API doesn't expose word
timestamps) — `generateSubtitles` also accepts a `wordTimings` array for any
future provider that does supply them, which would make sync exact instead of
approximate.

## Audio normalization and background music

`measureLoudnessGain()` runs a single-pass ffmpeg `loudnorm` analysis on each
narration clip and computes a linear gain multiplier toward a fixed target
loudness (-16 LUFS). This is applied via Remotion's `<Audio volume={gain}>` at
render time — no re-encoding of the source clips.

Background music is wired up as an optional, disabled-by-default
`backgroundMusic` prop on `<SceneSequence>` (loops quietly under the whole
lesson, default volume 0.06 so it never competes with narration). No track is
bundled — sourcing or generating one without infringing copyright is left as
a deliberate follow-up, not something to fake with a placeholder tone.

## Architecture notes

- **Centralized dimensions**: `packages/shared/src/video-config.ts` defines
  `VIDEO_FORMATS.landscape` (1920x1080) and a reserved `portrait` (1080x1920)
  entry.
- **Theme separation**: `packages/shared/src/theme.ts` holds all colors and
  font tokens; lesson JSON references semantic color tokens, never hex codes.
- **Deterministic rendering**: the TTS/synthesis step (network calls, cost,
  non-determinism) is fully separate from rendering (pure, offline, reads a
  committed-shape manifest). This mirrors the Milestone 5 LLM split: generate
  once, render deterministically many times.
- **Provider independence**: `TTSProvider` is a two-method interface; both
  implementations (`OpenAITTSProvider`, `LocalSapiTTSProvider`) satisfy it
  identically as far as any caller is concerned.
- **Schema-first content**: `packages/lesson-engine` is the only place that
  knows how a scene `type` maps to a component. Lesson JSON is the only
  artifact a human or an LLM needs to produce.

## Video Library

A read-only, browsable page listing every generated video, filterable by
Subject / Topic / Language. Plain HTML/CSS/JS — no build step, no framework,
no new dependencies — since it only needs to display what's already been
rendered, not generate anything.

```bash
npm run library          # builds library/library.json, then serves at http://localhost:4321
```

Or separately:

```bash
npm run library:build    # scans lessons/*.json + output/, writes library/library.json
npm run library:serve    # tiny Node http server (no Express) serving the page + videos
```

**File-naming convention this depends on**: the canonical, current video for
lesson `<id>` must live at `output/<id>.mp4` (matching the `id` field in
`lessons/<id>.json`). When you render a new or updated lesson, copy/rename
the approved output to that plain path — that's how the library knows a
lesson is "ready" versus "not yet rendered." (`npm run render:<lesson>`
already writes to `output/<id>.mp4` directly for the three existing lessons.)

Duration shown per video is read straight from the rendered MP4 file itself
(via `music-metadata`, the same library used for TTS clip durations) rather
than recomputed from scene timings — it's ground truth, not an estimate.

Re-run `npm run library:build` any time a video is added or re-rendered;
`library/library.json` is gitignored (generated), `library/index.html` /
`style.css` / `app.js` are real source.

## What's next

Nothing is currently planned to be built automatically. New lessons continue
to be authored in-chat, following `lessons/*.json`'s schema, then rendered
with the existing pipeline. If self-serve generation (an LLM turning a typed
topic into a lesson, triggered from a web form) becomes wanted later,
`docs/web-studio-plan.SUPERSEDED.md` has a full design already worked out —
including why it needs its own LLM API key (distinct from any coding
assistant used to build the project) and the one required engine change
(a dynamic Remotion composition keyed by lesson id, instead of one hardcoded
composition per lesson).
