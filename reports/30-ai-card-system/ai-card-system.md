# One card design for every AI surface in the app

**Date:** 2026-09-16
**Branch:** `feature/on-device-llm-spike`
**Scope:** mobile presentation only — no backend change, no migration, no prompt change, no flag change.

## What was asked

The project owner supplied a reference design — a premium AI feedback card with a score ring, a
focus-area row, tinted "what to focus on" tiles and a highlighted tip — and asked for AI cards "in
this style in entire project. not 100% exactly but like that."

## What was actually there first

Five AI surfaces existed, each with its own hand-written box that happened to share a sparkle icon
and a brand-blue uppercase label:

| Surface | File | What it showed |
|---|---|---|
| Practice session feedback | `app/(tabs)/practice/summary.tsx` | one narrative string |
| Mock test feedback | `app/(tabs)/mock-test/result.tsx` | one narrative string |
| Profile summary | `app/preparation-radar.tsx` | one narrative string |
| Cached question explanation | `questionRenderer/AiExplanationCard.tsx` | whyCorrect + per-option list + exam tip |
| Mistake analysis | `questionRenderer/MistakeAnalysisCard.tsx` | taxonomy label + explanation + next step |

Three of the five were literally the same twenty lines of JSX and four style rules, copied. None of
them was wrong; they simply did not read as one feature.

**The web and admin apps have no student-facing AI surface at all** — `web/` has none built, and
`admin/`'s AI screens (Control Center, Content Review, AI Usage) are operator tooling, not this
card. So "entire project" resolved to the five mobile surfaces above.

## What shipped

**New: `mobile/src/ui/AiCard.tsx`** — one composable family, following the `ui/` primitive
conventions already in this folder (a `buildStyles(theme)` factory through `useThemedStyles`,
`PressableScale` for taps, `IconBox`/`DonutRing` reused rather than redrawn):

- `AiCard` — the shell: sparkle mark, title, subtitle, optional status pill, optional footer rule
- `AiScoreSummary` — ring + headline + narrative, and a no-ring variant when there is no honest score
- `AiFocusRow` — the highlighted "here is where to look" row
- `AiTiles` — the tinted next-step tiles
- `AiBulletList` — a labelled list for content too long to tile (the per-option "why this is wrong" lines)
- `AiTipStrip` — the accent-barred highlight, used only for real model output
- `AiAskButton` — the tap-to-generate affordance for a surface that costs a model call

**New: `mobile/src/ai/feedbackPresentation.ts`** — the deterministic half: accuracy band, the header
pill, the focus subtitle and the next-step tiles, shared by Practice Summary and Mock Test Result so
the two screens cannot disagree.

**Changed:** the five surfaces above, each now composing the shared pieces; their old one-off style
blocks are deleted and replaced by a single placement rule (`marginTop`/`marginBottom`).

**i18n:** a new `ai.*` block plus `feedbackSubtitle`/`feedbackHeadline` under `summary` and `mock`,
added to **both** `packages/core/src/i18n/en.ts` and `te.ts` — Telugu is typed as English's shape,
so a missing key is a compile error rather than an English word on a Telugu screen.

## The three rules the new file exists to enforce

1. **Nothing in the card invents a fact.** Every number, topic name and count is passed in by the
   screen from data that screen already renders correctly on its own. The only model-authored text
   is the narrative, the explanation, the exam tip and the suggested action.
2. **Theme tokens only.** The reference was drawn light; this app shipped dark-first and now has
   both palettes. Every surface in the new file is a token role (`brand.glowSoft`, `semantic.*Bg`),
   never a literal.
3. **Every `fontSize` lives in the style factory**, so the zoom preference applies to all of it —
   the central mechanism `ThemeContext` documents.

## Decisions worth recording

**A slot with nothing behind it is omitted, not filled.** A mock attempt carries a subject but no
topic id, so it gets no focus row rather than an invented one — the same honest gap Phase 7.2
already disclosed, now visible in the layout instead of buried in a comment. A radar with no
`NEEDS_ATTENTION`/`NEEDS_REVISION` topic likewise shows the narrative alone. And "Revisit mistakes"
is filtered out when there are no wrong answers, which is the one way the fixed tile copy could have
stated something false.

**The badge, focus subtitle and tiles are deterministic, and deliberately kept out of the prompt.**
They are chosen by accuracy band from the score already on screen, exactly like
`sessionFeedbackTemplate` in `packages/core`. Two consequences: the card makes no claim the score
line above it does not already make, and the layout is identical when the model is unreachable and
the deterministic template answers instead. Recorded as a stated ambiguity in `REQ-AI-024`: this
fixed copy does sit inside a card headed "AI Feedback".

**The mock ring is scored over questions attempted, not the size of the paper** — the same
denominator `getOrBuildMockFeedback` sends the model, so the ring and the sentence beside it cannot
disagree. Scoring correct-over-paper-size was a real shipped bug found on a device once.

**The radar ring is coverage, not a preparation score.** The Weakness Radar spec's §18 forbids an
aggregate score over topics with wildly differing evidence; "23 of 61 topics practised" is a
question the data can actually answer.

**Two screens stay English-only**, unchanged: `preparation-radar.tsx` by the earlier decision every
post-Exam-Guide screen follows, and `MistakeAnalysisCard`'s nine taxonomy labels, which were already
English and are out of this change's scope.

## Verified

- `npx tsc --noEmit` (mobile) — clean.
- `npx expo lint` — **exactly the pre-existing 9-problem baseline** (8 errors, 1 warning), and every
  flagged file (`mock-test/start.tsx`, `mock-test/test.tsx`, `practice/history.tsx`,
  `LanguagePickerModal.tsx`, `authContext.tsx`, `SyncContext.tsx`, `bookmarkSync.ts`) confirmed to be
  one this change never touched.
- `packages/core`: `npm run typecheck` clean (both configs), **195/195 vitest tests pass** — the
  i18n catalogues are the only shared-package files this change edits.
- A visual preview of all five cards in both palettes, built from the real token values and the real
  production narratives, published as an Artifact for sign-off — the same way the black+blue dark
  theme was approved before its production code changed.

## NOT verified

**No device or emulator pass has been done.** This is a purely visual change, and this project's own
history is full of layout bugs that only a screenshot found — the dark theme's missing
navigator-level background, the unreachable navigator Close button, the overlapping sync banner. A
clean compile says nothing about how any of these cards look. Specifically unexercised:

- All five cards on a real screen, in **light mode** especially — the palette least like the one this
  app was drawn in.
- Tile reflow at the largest zoom step.
- The focus row's tap on Practice Summary (to `/practice/levels`) and on the radar (to `/radar-topic`).
- Telugu interface strings in the card chrome — added to the catalogue, never rendered, and **not
  reviewed by a native speaker**, the same standing limitation `te.ts` already carries.

## QA (AI_RULES §3.21)

`REQ-AI-024`; `SCN-AI-051`, `SCN-AI-052`; `TC-AI-053`, `TC-AI-054`, `TC-AI-055` — all
`ManualOnly` (mobile has no automated UI test runner in this project) and all `Not Executed`, with
no invented result. `TC-AI-054` step 1 is the explicit regression guard for the clean-sheet tile
case. RTM: 100/195/214 → **101/197/217**.

## Files

**Added:** `mobile/src/ui/AiCard.tsx`, `mobile/src/ai/feedbackPresentation.ts`, this report.
**Changed:** `mobile/src/app/(tabs)/practice/summary.tsx`,
`mobile/src/app/(tabs)/mock-test/result.tsx`, `mobile/src/app/preparation-radar.tsx`,
`mobile/src/questionRenderer/AiExplanationCard.tsx`,
`mobile/src/questionRenderer/MistakeAnalysisCard.tsx`, `packages/core/src/i18n/en.ts`,
`packages/core/src/i18n/te.ts`, `qa/requirements/ai.yaml`, `qa/scenarios/ai.yaml`,
`qa/test-cases/ai.yaml`, plus the regenerated `qa/suites/`, `qa/traceability/RTM.md`,
`qa/reports/dashboard.md`, `qa/test-data/`.
