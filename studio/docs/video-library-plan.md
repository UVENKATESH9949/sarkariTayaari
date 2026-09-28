# Video Library — Implementation Plan (not yet implemented)

Status: **planning only**. Nothing in this document is built yet.

## 1. What this actually is

A local, **read-only** web page listing already-generated lesson videos,
browsable/filterable by **Subject / Topic / Language**, with playback. That's
the entire scope.

Explicitly **not** in this: a "Create Video" form, any generation trigger,
any LLM/TTS API call from the browser or a server, job status, regenerate
buttons. Video generation continues exactly as it does today — manually,
through this chat session, the same way `percentage-basics`,
`simple-interest-basics`, and `profit-and-loss` were made. This page only
shows the results afterward.

Images (AI-generated, for topics that need them) are explicitly **deferred**
— decided per-video, in-chat, at generation time. Nothing about images needs
building now.

## 2. Why this is deliberately not a framework app

Given the tool may be short-lived ("once video generation is done, we might
not need this system"), the plan avoids anything with build tooling or
dependencies to maintain:

- **No React, no Vite.** Plain HTML + CSS + vanilla JS.
- **No Express, no server framework.** A ~20-line Node `http` static file
  server is enough to serve a page + a JSON file + video files.
- **Zero new npm dependencies.**

This can be deleted or ignored later with no cleanup cost, and there's
nothing to keep upgrading.

## 3. Data source (no new metadata to invent)

Every lesson already carries the exact fields needed, from the Milestone 4
schema (`packages/lesson-engine/src/schema.ts`): `title`, `exam`, `subject`,
`topic`, `language`. Nothing new needs to be authored — a build script just
reads what's already in `lessons/*.json`.

Matching a lesson to its rendered video uses a simple, explicit convention
going forward: **the canonical, current video for lesson `<id>` lives at
`output/<id>.mp4`.** (Today's `output/` folder has ad hoc names like
`percentage-basics-local.mp4` from manual testing — adopting this convention
means copying/renaming the approved render to the plain `<id>.mp4` path each
time a video is finalized. No new index file, no ambiguity: if
`output/<id>.mp4` exists, the lesson is "Ready"; if not, it's listed as "Not
yet rendered" — real state, not guessed.)

Duration shown in the library comes from the existing narration manifest
(`apps/studio/public/audio/<id>/narration-manifest.json`) using the same
`leadIn + narration + tail` math `computeSequenceDuration` already does —
not from probing the video file, so no `ffprobe` dependency is needed.

## 4. What gets built

```
library/
  index.html       Plain HTML page: filter controls + video grid, vanilla JS/CSS
  style.css        Small stylesheet reusing @sarkaritaayari/shared's color/font
                    tokens by copying the literal values (plain CSS can't import
                    a TS module, so token values are duplicated here deliberately —
                    a comment points back to packages/shared/src/theme.ts as the
                    source of truth to keep them from drifting silently)
  library.json     GENERATED — not hand-edited, not committed (gitignored)

scripts/
  build-library.ts   Scans lessons/*.json + output/<id>.mp4 + the narration
                     manifests, writes library/library.json
  serve-library.ts   Minimal Node http server: serves library/ at "/" and
                     output/ at "/output/", so the page's <video src="/output/...">
                     tags resolve directly to the real files
```

Root `package.json` additions:
```json
"library:build": "tsx scripts/build-library.ts",
"library:serve": "tsx scripts/serve-library.ts",
"library": "npm run library:build && npm run library:serve"
```

`npm run library` regenerates the listing from whatever's currently in
`lessons/` + `output/`, then opens a local server (e.g. `http://localhost:4321`)
to browse it. Re-run `library:build` any time a new video is finalized.

## 5. Page behavior

- Group/filter controls for **Subject**, **Topic**, **Language** (dropdowns
  or a simple faceted sidebar — exact UI detail decided at implementation
  time, not over-specified here).
- Each card: title, subject/topic/language tags, duration, and an inline
  `<video controls>` player (or a click-to-expand player — implementation
  detail).
- Lessons without a matching `output/<id>.mp4` yet are shown in a clearly
  separate "Not yet rendered" section, not hidden and not shown as playable.

## 6. Testing plan (once implemented)

1. Run `library:build` against the current real project state (3 lessons,
   3 rendered videos) and confirm `library.json` has correct metadata for
   each, matching what's actually in `lessons/*.json`.
2. Confirm a lesson with no matching `output/<id>.mp4` (temporarily rename
   one video) shows up as "Not yet rendered" instead of being silently
   dropped or shown broken.
3. Serve it and load the page in a browser; confirm all three videos
   actually play (not just that the page renders).
4. Confirm filtering by subject/topic/language actually narrows the grid
   correctly.
5. Confirm this adds zero risk to the existing pipeline — `library:build`
   only *reads* `lessons/` and `output/`, never writes to them.

## 7. Explicit non-goals

No generation UI, no API calls of any kind, no database, no auth, no
build step/bundler, no framework. If self-serve automated generation is
wanted later, see `docs/web-studio-plan.SUPERSEDED.md` for the fuller
design that was already worked out.
