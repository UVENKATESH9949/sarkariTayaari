import { z } from "zod";

/**
 * Lesson JSON schema. This is the single artifact both narration synthesis
 * and rendering read from — the same shape a human authors by hand today
 * and an LLM will produce in Milestone 5 without any pipeline changes.
 *
 * Timing within a scene is expressed as a *fraction* (0-1) of that scene's
 * final duration, never an absolute frame number — the actual duration is
 * only known after narration audio is measured (see scripts/synthesize-narration.ts),
 * so scenes describe "when, relative to my own length" rather than a frame
 * count that would only be correct for one specific narration length.
 * Small fixed-feel animations (like a number counting up) are the exception:
 * those are given in seconds, since a 1-second count-up should always take
 * about 1 second regardless of how long the surrounding scene is.
 */

const fraction = () => z.number().min(0).max(1);

const colorTokenSchema = z.enum(["accent", "muted"]);
export type ColorToken = z.infer<typeof colorTokenSchema>;

const breakdownItemSchema = z.object({
  text: z.string(),
  emphasis: z.boolean().optional(),
});

const gridSchema = z.object({
  gridSize: z.number().int().positive().optional(),
  fillTarget: z.number().nonnegative(),
  start: fraction(),
  end: fraction(),
  resultPrefix: z.string(),
  resultValue: z.string(),
});

const barSchema = z.object({
  label: z.string(),
  value: z.number(),
  max: z.number(),
  color: colorTokenSchema,
  growStart: fraction(),
  growEnd: fraction(),
});

const answerSchema = z.object({
  prefix: z.string().optional(),
  from: z.number(),
  to: z.number(),
  suffix: z.string().optional(),
  atFraction: fraction(),
  durationSeconds: z.number().positive().default(1),
});

const formulaTokenSchema = z.object({
  text: z.string(),
  emphasis: z.boolean().optional(),
});

const formRepresentationSchema = z.object({
  value: z.string(),
  connectorLabel: z.string().optional(),
});

const baseSceneSchema = z.object({
  id: z.string().min(1),
  narration: z.string().min(1),
  /** Silence before narration starts playing, in seconds. Defaults to 0.35. */
  leadInSeconds: z.number().nonnegative().optional(),
  /** Silence after narration ends before the scene cuts, in seconds. Defaults to 0.6. */
  tailSeconds: z.number().nonnegative().optional(),
  /** Provider-specific voice override for just this scene. */
  voice: z.string().optional(),
});

const titleSceneSchema = baseSceneSchema.extend({
  type: z.literal("title"),
  kicker: z.string(),
  title: z.string(),
  subtitle: z.string(),
});

const conceptSceneSchema = baseSceneSchema.extend({
  type: z.literal("concept"),
  heading: z.string(),
  breakdown: z.array(breakdownItemSchema).min(1),
  grid: gridSchema.optional(),
});

const exampleSceneSchema = baseSceneSchema.extend({
  type: z.literal("example"),
  heading: z.string(),
  problemText: z.string(),
  bars: z.array(barSchema).optional(),
  calcLines: z.array(z.string()).min(1),
  calcStartFraction: fraction(),
  calcStaggerFraction: fraction(),
  answer: answerSchema,
});

const formulaSceneSchema = baseSceneSchema.extend({
  type: z.literal("formula"),
  heading: z.string(),
  formulaTokens: z.array(formulaTokenSchema).min(1),
  forms: z.array(formRepresentationSchema).optional(),
  formsLabel: z.string().optional(),
  formsStartFraction: fraction().optional(),
  formsStaggerFraction: fraction().optional(),
  caption: z.string().optional(),
});

const summarySceneSchema = baseSceneSchema.extend({
  type: z.literal("summary"),
  heading: z.string(),
  points: z.array(z.string()).min(1),
  outroStartFraction: fraction(),
  outroTitle: z.string(),
  outroSubtitle: z.string(),
});

export const sceneSchema = z.discriminatedUnion("type", [
  titleSceneSchema,
  conceptSceneSchema,
  exampleSceneSchema,
  formulaSceneSchema,
  summarySceneSchema,
]);

export const lessonSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  exam: z.string(),
  subject: z.string(),
  topic: z.string(),
  language: z.string().default("en"),
  scenes: z.array(sceneSchema).min(1),
});

export type Lesson = z.infer<typeof lessonSchema>;
export type LessonScene = z.infer<typeof sceneSchema>;
export type TitleSceneJSON = z.infer<typeof titleSceneSchema>;
export type ConceptSceneJSON = z.infer<typeof conceptSceneSchema>;
export type ExampleSceneJSON = z.infer<typeof exampleSceneSchema>;
export type FormulaSceneJSON = z.infer<typeof formulaSceneSchema>;
export type SummarySceneJSON = z.infer<typeof summarySceneSchema>;
