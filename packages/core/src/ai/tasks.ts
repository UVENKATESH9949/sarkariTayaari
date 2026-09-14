/**
 * The AI task registry — the single source of truth for what AI in this app is allowed to do.
 *
 * See `AI_ARCHITECTURE.md` §7. The rule this file exists to enforce is that **a screen never
 * writes a prompt**. It names a task, and this registry decides which tiers may serve it, which
 * languages it may answer in, how much context it is entitled to, and how long its answer may
 * be. Everything downstream — the router, the context builder, the validators, and eventually
 * the server-side generation pass — reads from here rather than deciding for itself.
 *
 * Centralising it is what makes the awkward questions answerable in one place: "can this run
 * offline", "does this cost money per user", "is this cacheable", "may this answer in Telugu".
 * Scattered across call sites, each of those becomes a per-screen judgement call that drifts.
 *
 * ## The tiers, in the order the router tries them
 *
 * | Tier | Cost | Offline | Can it be wrong? |
 * |---|---|---|---|
 * | `GROUND_TRUTH` | free | always | no — it is authored/verified data already in the app |
 * | `DETERMINISTIC` | free | always | only if the algorithm is wrong, and it is testable |
 * | `CACHED` | free per use | once synced | human-reviewed before it ships |
 * | `GENERATED` | real money / real RAM | only with a local model | yes — hence validation |
 *
 * Cost, latency, reliability and truthfulness all degrade in the same direction, which is why
 * the order is worth hard-coding rather than choosing per request.
 */

import type { AiContextKind } from "./context/types";

/* --------------------------------------------------------------------------------- vocabulary */

/**
 * Ordered best-first. `TIER_ORDER` below depends on this being the resolution order, so a new
 * tier has to be inserted in the right place rather than appended.
 */
export type AiTier = "GROUND_TRUTH" | "DETERMINISTIC" | "CACHED" | "GENERATED";

export const TIER_ORDER: readonly AiTier[] = [
  "GROUND_TRUTH",
  "DETERMINISTIC",
  "CACHED",
  "GENERATED",
] as const;

export type AiTaskId =
  | "QUESTION_EXPLANATION"
  | "QUESTION_HINT"
  | "CONCEPT_EXPLANATION"
  | "MISTAKE_ANALYSIS"
  | "PERSONALIZED_RECOMMENDATION"
  | "STUDY_PLAN"
  | "TOPIC_ANALYSIS"
  | "PERSONALIZED_EXPLANATION"
  | "QUESTION_CLASSIFICATION"
  | "SESSION_FEEDBACK"
  | "PROFILE_SUMMARY";

/**
 * The languages AI may answer in — **not** the languages the app's UI supports.
 *
 * `en` and `hi` are the only languages any question exists in
 * (`mobile/src/practice/appLanguage.tsx` says the eleven-entry picker is a mock, and
 * `scripts/generate-load-test-questions.js` writes exactly these two). Telugu has UI-chrome
 * strings only.
 *
 * This is a hard constraint rather than a default, and the router refuses rather than falls
 * back: explaining a question in a language the question does not exist in means translating it
 * first, and a model translating an exam question it was not given is precisely the fabrication
 * this product cannot afford. Recorded as decision 3 in `AI_ARCHITECTURE.md` §13 — revisit when
 * real Telugu question content exists, not before.
 */
export const AI_LANGUAGES = ["en", "hi"] as const;
export type AiLanguageCode = (typeof AI_LANGUAGES)[number];

export function isAiLanguage(code: string): code is AiLanguageCode {
  return (AI_LANGUAGES as readonly string[]).includes(code);
}

/**
 * Device capability bands for the local-model path only (`AI_ARCHITECTURE.md` §9.3). Every other
 * tier runs on every device, which is the entire point of putting the flagship feature in
 * `CACHED`.
 *
 * `LOW` (< 4 GB RAM) never loads a model: on a device that size, holding a quantised 1B model
 * resident risks the OS killing the app, and losing Practice to power a hint is a bad trade.
 */
export type DeviceTier = "LOW" | "MID" | "HIGH";

export const DEVICE_TIER_ORDER: readonly DeviceTier[] = ["LOW", "MID", "HIGH"] as const;

export function meetsDeviceTier(actual: DeviceTier, required: DeviceTier): boolean {
  return DEVICE_TIER_ORDER.indexOf(actual) >= DEVICE_TIER_ORDER.indexOf(required);
}

/* ---------------------------------------------------------------------------- task definition */

export type AiTaskDefinition = {
  id: AiTaskId;
  /** Which tiers may serve this task, in `TIER_ORDER`. Never empty. */
  tiers: readonly AiTier[];
  /**
   * True when the answer depends on *this* student, which makes it unshareable — and therefore
   * uncacheable, since the cache is keyed by content rather than by user. This is the flag that
   * decides whether a task can ever be free at scale.
   */
  personalized: boolean;
  /** Implied by `personalized === false` plus a `CACHED` tier; stored explicitly so it is greppable. */
  cacheable: boolean;
  languages: readonly AiLanguageCode[];
  /**
   * The context this task is entitled to — an allowlist, not a hint. The context builder emits
   * only these, so a task that does not need the learner cannot leak the learner.
   */
  requiredContext: readonly AiContextKind[];
  /** Output ceiling. Keeps the default answer short and cloud cost bounded (§18 of the brief). */
  maxOutputTokens: number;
  /** Minimum device band for the local-model path. Ignored by every other tier. */
  minDeviceTier: DeviceTier;
  /**
   * What the UI shows when every tier declines. `null` means "show nothing extra" — the screen
   * already has correct content on it, which is why an AI outage is never an error state.
   */
  groundTruthFallback: "AUTHORED_EXPLANATION" | "DETERMINISTIC_RADAR" | null;
};

/**
 * Note how few tasks genuinely reach `GENERATED`. That is the finding, not an oversight: this
 * app already computes weakness, mastery, trend and a ranked study plan deterministically, on
 * device, offline (`intelligence/topicHealth.ts`, `mobile/src/intelligence/localRadar.ts`). A
 * model asked to re-derive any of that would be slower, costlier, non-deterministic and less
 * accurate than the code that already ships.
 */
export const AI_TASKS: Readonly<Record<AiTaskId, AiTaskDefinition>> = {
  /** The flagship. Generic and shared, so one generated answer serves every student who sees it. */
  QUESTION_EXPLANATION: {
    id: "QUESTION_EXPLANATION",
    tiers: ["GROUND_TRUTH", "CACHED", "GENERATED"],
    personalized: false,
    cacheable: true,
    languages: AI_LANGUAGES,
    requiredContext: ["question"],
    maxOutputTokens: 400,
    minDeviceTier: "MID",
    groundTruthFallback: "AUTHORED_EXPLANATION",
  },

  /** Same key space as the explanation, different task type — a nudge, not an answer. */
  QUESTION_HINT: {
    id: "QUESTION_HINT",
    tiers: ["CACHED", "GENERATED"],
    personalized: false,
    cacheable: true,
    languages: AI_LANGUAGES,
    requiredContext: ["question"],
    maxOutputTokens: 120,
    minDeviceTier: "MID",
    groundTruthFallback: null,
  },

  /** Per topic rather than per question, so the whole corpus is a few hundred rows. */
  CONCEPT_EXPLANATION: {
    id: "CONCEPT_EXPLANATION",
    tiers: ["CACHED", "GENERATED"],
    personalized: false,
    cacheable: true,
    languages: AI_LANGUAGES,
    requiredContext: ["topic"],
    maxOutputTokens: 500,
    minDeviceTier: "MID",
    groundTruthFallback: null,
  },

  /**
   * Rule-based classification first — `localRadar`'s reason codes already name the failure
   * pattern. The model's job is phrasing, and only when a model is available.
   */
  MISTAKE_ANALYSIS: {
    id: "MISTAKE_ANALYSIS",
    tiers: ["DETERMINISTIC", "GENERATED"],
    personalized: true,
    cacheable: false,
    languages: AI_LANGUAGES,
    requiredContext: ["question", "learner"],
    maxOutputTokens: 300,
    minDeviceTier: "MID",
    groundTruthFallback: "DETERMINISTIC_RADAR",
  },

  /** `WeaknessRadarService` / `localRadar.ts` already answer this completely. */
  PERSONALIZED_RECOMMENDATION: {
    id: "PERSONALIZED_RECOMMENDATION",
    tiers: ["DETERMINISTIC"],
    personalized: true,
    cacheable: false,
    languages: AI_LANGUAGES,
    requiredContext: ["learner", "exam"],
    maxOutputTokens: 0,
    minDeviceTier: "LOW",
    groundTruthFallback: "DETERMINISTIC_RADAR",
  },

  /** `PreparePlanService` already answers this. Listed so nobody rebuilds it with a model. */
  STUDY_PLAN: {
    id: "STUDY_PLAN",
    tiers: ["DETERMINISTIC"],
    personalized: true,
    cacheable: false,
    languages: AI_LANGUAGES,
    requiredContext: ["learner", "exam"],
    maxOutputTokens: 0,
    minDeviceTier: "LOW",
    groundTruthFallback: "DETERMINISTIC_RADAR",
  },

  /** `TopicIntelligenceService` already answers this, and says so in its own class doc. */
  TOPIC_ANALYSIS: {
    id: "TOPIC_ANALYSIS",
    tiers: ["DETERMINISTIC"],
    personalized: false,
    cacheable: false,
    languages: AI_LANGUAGES,
    requiredContext: ["topic", "exam"],
    maxOutputTokens: 0,
    minDeviceTier: "LOW",
    groundTruthFallback: null,
  },

  /**
   * The one genuinely on-device case: an explanation rewritten for how *this* student has been
   * performing. Per-user and therefore uncacheable, which is exactly why a local model — free,
   * private, offline — is the right home for it rather than a per-request cloud call.
   * Unavailable until Phase 6 ships a runtime; the router reports that honestly.
   */
  PERSONALIZED_EXPLANATION: {
    id: "PERSONALIZED_EXPLANATION",
    tiers: ["GENERATED"],
    personalized: true,
    cacheable: false,
    languages: AI_LANGUAGES,
    requiredContext: ["question", "learner"],
    maxOutputTokens: 400,
    minDeviceTier: "HIGH",
    groundTruthFallback: "AUTHORED_EXPLANATION",
  },

  /**
   * Admin/ingestion side, never student-facing — a tiny classifier is enough here.
   *
   * Not cacheable, despite being shared and deterministic-ish: its output is *applied* to the
   * question row (topic, difficulty) and becomes ordinary content, so there is nothing left to
   * serve from an AI cache afterwards. `ai_content` holds answers shown to students, not
   * one-shot admin suggestions.
   */
  QUESTION_CLASSIFICATION: {
    id: "QUESTION_CLASSIFICATION",
    tiers: ["GENERATED"],
    personalized: false,
    cacheable: false,
    languages: AI_LANGUAGES,
    requiredContext: ["question"],
    maxOutputTokens: 80,
    minDeviceTier: "HIGH",
    groundTruthFallback: null,
  },

  /**
   * Phase 7 — one short narrative paragraph over a just-finished session's already-computed
   * facts (accuracy, per-topic health/trend). `DETERMINISTIC` is a canned-sentence template
   * (see `sessionFeedbackTemplate.ts`), never "nothing" — every declared tier must be genuinely
   * servable. `GENERATED` is strictly a phrasing upgrade over the identical facts, never a new
   * source of facts: the model is handed numbers and topic names, and is asked only to write
   * about them, the same grounding discipline `QUESTION_EXPLANATION` already established.
   * `groundTruthFallback: null` because the session-summary screen's own stat blocks are
   * already complete without a narrative — an AI outage is never an error state here either.
   */
  SESSION_FEEDBACK: {
    id: "SESSION_FEEDBACK",
    tiers: ["DETERMINISTIC", "GENERATED"],
    personalized: true,
    cacheable: false,
    languages: AI_LANGUAGES,
    requiredContext: ["session"],
    maxOutputTokens: 300,
    minDeviceTier: "MID",
    groundTruthFallback: null,
  },

  /**
   * Phase 7 — the narrative behind the Profile screen: strengths/weaknesses already ranked by
   * `WeaknessRadar`, phrased as a coach's note rather than a to-do list (that framing is
   * Preparation Radar's job, not this task's). Same DETERMINISTIC-first shape as
   * `SESSION_FEEDBACK`.
   */
  PROFILE_SUMMARY: {
    id: "PROFILE_SUMMARY",
    tiers: ["DETERMINISTIC", "GENERATED"],
    personalized: true,
    cacheable: false,
    languages: AI_LANGUAGES,
    requiredContext: ["learnerProfile"],
    maxOutputTokens: 300,
    minDeviceTier: "MID",
    groundTruthFallback: "DETERMINISTIC_RADAR",
  },
};

export const AI_TASK_IDS = Object.keys(AI_TASKS) as AiTaskId[];

export function aiTask(id: AiTaskId): AiTaskDefinition {
  return AI_TASKS[id];
}

export function isAiTaskId(value: string): value is AiTaskId {
  return Object.prototype.hasOwnProperty.call(AI_TASKS, value);
}

/* ----------------------------------------------------------------------- registry invariants */

/**
 * Returns every way the registry contradicts itself. Exported as a pure function over an
 * arbitrary registry, rather than inlined, for one reason: a guard nobody has watched fail is
 * not known to work. A test feeds this a deliberately broken registry and asserts it complains —
 * the same discipline `scripts/check-topic-health-parity.js` was proven with.
 */
/**
 * Context kinds that carry one specific student's own state. A `personalized` task must ask
 * for at least one of these — the check used to hard-code `"learner"` alone, but `"session"`
 * and `"learnerProfile"` (Phase 7) are exactly as per-student as `"learner"` is, and the reason
 * the check exists (a shared/cached answer must not leak one student's state) applies
 * identically to both. Broadened here, deliberately and visibly, rather than having the new
 * tasks quietly route around a check that no longer matched what it was meant to enforce.
 */
const LEARNER_SCOPED_CONTEXT: readonly AiContextKind[] = ["learner", "session", "learnerProfile"];

export function registryViolations(
  registry: Readonly<Record<string, AiTaskDefinition>>,
): string[] {
  const violations: string[] = [];

  for (const [key, task] of Object.entries(registry)) {
    if (key !== task.id) {
      violations.push(`${key}: registry key does not match its own id "${task.id}"`);
    }

    if (task.tiers.length === 0) {
      violations.push(`${task.id}: has no tiers, so it can never be served`);
    }

    const ordered = TIER_ORDER.filter((tier) => task.tiers.includes(tier));
    if (ordered.join(",") !== task.tiers.join(",")) {
      violations.push(
        `${task.id}: tiers must be listed in TIER_ORDER (expected ${ordered.join(",")}, got ${task.tiers.join(",")})`,
      );
    }

    // A personalized answer depends on one student, so caching it would serve someone else's.
    if (task.personalized && task.cacheable) {
      violations.push(`${task.id}: personalized tasks can never be cacheable`);
    }
    if (task.cacheable && !task.tiers.includes("CACHED")) {
      violations.push(`${task.id}: marked cacheable but has no CACHED tier`);
    }
    if (!task.cacheable && task.tiers.includes("CACHED")) {
      violations.push(`${task.id}: has a CACHED tier but is not marked cacheable`);
    }

    const hasLearnerScopedContext = task.requiredContext.some((kind) =>
      LEARNER_SCOPED_CONTEXT.includes(kind),
    );
    if (task.personalized && !hasLearnerScopedContext) {
      violations.push(`${task.id}: personalized but asks for no learner-scoped context`);
    }
    if (!task.personalized && hasLearnerScopedContext) {
      violations.push(
        `${task.id}: asks for learner-scoped context but is not marked personalized — it would leak one student's state into a shared answer`,
      );
    }

    if (task.requiredContext.length === 0) {
      violations.push(`${task.id}: requires no context, so it would be prompted blind`);
    }

    // Decision 3: the registry, not a comment, is what keeps Telugu out.
    for (const language of task.languages) {
      if (!isAiLanguage(language)) {
        violations.push(`${task.id}: language "${language}" has no question content`);
      }
    }
    if (task.languages.length === 0) {
      violations.push(`${task.id}: supports no languages`);
    }

    // A generating task with no room to answer is a silent no-op; a non-generating one with a
    // budget implies a model runs where none does.
    if (task.tiers.includes("GENERATED") && task.maxOutputTokens <= 0) {
      violations.push(`${task.id}: can generate but allows ${task.maxOutputTokens} output tokens`);
    }
    if (!task.tiers.includes("GENERATED") && task.maxOutputTokens > 0) {
      violations.push(
        `${task.id}: allows output tokens but has no GENERATED tier — nothing will ever produce them`,
      );
    }
  }

  return violations;
}

/*
 * Checked at module load, and deliberately NOT fatal in a release build.
 *
 * This mirrors `intelligence/topicHealth.ts`'s weight-sum guard, for the same reason and with
 * the same hard-won caveat: expo-router imports every route file at startup, so a module-scope
 * throw here would take down Practice and Mock Test over a mistake in a feature the student may
 * never open. In development it should be unmissable; in release it should shout and let the app
 * live, because every AI surface renders beside content that is already correct.
 *
 * `typeof` guard rather than a bare `__DEV__`: Metro injects that global on React Native, a
 * browser bundle has none, and referencing it directly would throw a ReferenceError that masks
 * the very problem this check reports. `web/` defines it through Vite so both behave alike.
 */
const REGISTRY_VIOLATIONS = registryViolations(AI_TASKS);
if (REGISTRY_VIOLATIONS.length > 0) {
  const message = `AI task registry is inconsistent:\n  - ${REGISTRY_VIOLATIONS.join("\n  - ")}`;
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    throw new Error(message);
  }
  console.error(message);
}
