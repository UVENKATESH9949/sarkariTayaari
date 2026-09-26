/**
 * Deterministic Practice-Result analytics — the "Analytics" tab of the redesigned Practice
 * Result screen. Pure functions over data the app already has (a finished session's per-question
 * results, joined against each question's already-synced topic/difficulty), so this never calls
 * an LLM and never needs a network request. Lives in `packages/core` (not `mobile/`) specifically
 * so it can be unit-tested with vitest — `mobile/` has no automated test runner.
 *
 * ## The "sub-topic" grouping key
 *
 * A Practice session is scoped to one selected topic, but the individual questions it draws can
 * carry a mix of underlying `topicId`s when the selected topic is a parent with several children
 * (see `topics.parent_id`, Epic L) — `quiz.tsx`'s own mastery-recording loop already groups
 * `results` by each question's own `topicId` for exactly this reason. This module reuses that
 * same per-question topic name as the "sub-topic" the spec asks for, rather than inventing a
 * second hierarchy. When every question shares one topic (the common case), the sub-topic
 * breakdown correctly collapses to a single group.
 *
 * ## The high-time / fast-and-accurate threshold — documented per the spec's own requirement
 *
 * No expected-time-per-question benchmark exists anywhere in this app yet (`useQuestionTimer`'s
 * own doc comment says so). So the threshold is RELATIVE to this session's own pace, not a
 * hardcoded "60 seconds":
 *
 * - `HIGH_TIME_MULTIPLIER` (1.6x) and `FAST_TIME_MULTIPLIER` (0.6x) are applied to the session's
 *   own median time-per-question (median, not mean, so one very slow or very fast question can't
 *   drag the whole baseline).
 * - `HIGH_TIME_FLOOR_MS` (15s) stops a fast session (e.g. a 5s median) from flagging a 9s question
 *   as "slow" — a small absolute difference that is not actually meaningful.
 * - Both classifications require at least `MIN_TIMED_QUESTIONS_FOR_TIME_ANALYSIS` timed answers in
 *   the session; below that, a "median" is not a meaningful baseline.
 *
 * ## Sub-topic performance labels — never asserted on too little data
 *
 * A sub-topic needs at least `MIN_QUESTIONS_FOR_LABEL` attempted questions before it is called
 * Strong/Needs Practice/Weak — below that it is `INSUFFICIENT_DATA`, and the UI shows its raw
 * numbers without a confident verdict (the spec's own example: one question is not "a long-term
 * weakness").
 */

export type SubtopicPerformanceLabel = "STRONG" | "NEEDS_PRACTICE" | "WEAK" | "INSUFFICIENT_DATA";

export type PracticeResultTrend = "IMPROVING" | "DECLINING" | "STEADY" | "NOT_AVAILABLE";

/** One answered question's facts, already resolved from local data — never raw explanation text. */
export type AnalyticsQuestionInput = {
  questionId: string;
  questionNumber: number; // 1-based, matches the Question Wise tab's own numbering
  isCorrect: boolean;
  /** Milliseconds on screen, or null when not measured (pre-V24 history, or never banked). */
  timeMs: number | null;
  /** The question's own topic name — the "sub-topic" grouping key. Null when unresolvable. */
  subtopicName: string | null;
  /** e.g. "EASY"/"MEDIUM"/"HARD" — whatever the admin-defined difficulty code is. Null if unknown. */
  difficultyCode: string | null;
};

export type FlaggedQuestion = {
  questionId: string;
  questionNumber: number;
  timeMs: number;
  isCorrect: boolean;
  subtopicName: string | null;
};

export type SubtopicAnalytics = {
  name: string;
  attempted: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPercent: number;
  averageTimeMs: number | null;
  highTimeCount: number;
  fastAccurateCount: number;
  performanceLabel: SubtopicPerformanceLabel;
};

export type TimeAnalysisRule = {
  /** How many timed answers this session had — below the minimum, no threshold is computed. */
  timedQuestionCount: number;
  /** The session's own median time-per-question, in ms. Null when there weren't enough to compute one. */
  medianTimeMs: number | null;
  /** `median * HIGH_TIME_MULTIPLIER`, floored at `HIGH_TIME_FLOOR_MS`. Null when no median exists. */
  highTimeThresholdMs: number | null;
  /** `median * FAST_TIME_MULTIPLIER`. Null when no median exists. */
  fastTimeThresholdMs: number | null;
};

export type PracticeResultAnalytics = {
  score: {
    accuracyPercent: number;
    questionsAttempted: number;
    correctCount: number;
    incorrectCount: number;
    totalTimeMs: number | null;
    averageTimeMs: number | null;
  };
  timeRule: TimeAnalysisRule;
  highTimeQuestions: FlaggedQuestion[];
  fastAccurateQuestions: FlaggedQuestion[];
  subtopics: SubtopicAnalytics[];
  weakAreas: SubtopicAnalytics[];
  strongAreas: SubtopicAnalytics[];
  previousPerformance: {
    available: boolean;
    previousAccuracyPercent: number | null;
    currentAccuracyPercent: number;
    trend: PracticeResultTrend;
  };
};

const HIGH_TIME_MULTIPLIER = 1.6;
const FAST_TIME_MULTIPLIER = 0.6;
const HIGH_TIME_FLOOR_MS = 15_000;
const MIN_TIMED_QUESTIONS_FOR_TIME_ANALYSIS = 3;
const MIN_QUESTIONS_FOR_LABEL = 3;
/** A trend needs a genuine, noticeable move — not a rounding wobble between two runs. */
const TREND_DELTA_THRESHOLD_PP = 5;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function computePracticeResultAnalytics(params: {
  questions: AnalyticsQuestionInput[];
  /** From this device's own recent session history for the same sub-topic, if any. */
  previousAccuracyPercent?: number | null;
}): PracticeResultAnalytics {
  const { questions, previousAccuracyPercent = null } = params;

  const attempted = questions.length;
  const correctCount = questions.filter((q) => q.isCorrect).length;
  const incorrectCount = attempted - correctCount;
  const accuracyPercent = attempted > 0 ? Math.round((correctCount / attempted) * 100) : 0;

  const timedQuestions = questions.filter((q): q is AnalyticsQuestionInput & { timeMs: number } => q.timeMs !== null);
  const totalTimeMs = timedQuestions.length > 0 ? timedQuestions.reduce((sum, q) => sum + q.timeMs, 0) : null;
  const averageTimeMs = totalTimeMs !== null ? Math.round(totalTimeMs / timedQuestions.length) : null;

  const medianTimeMs = timedQuestions.length >= MIN_TIMED_QUESTIONS_FOR_TIME_ANALYSIS
    ? median(timedQuestions.map((q) => q.timeMs))
    : null;
  const highTimeThresholdMs = medianTimeMs !== null ? Math.max(medianTimeMs * HIGH_TIME_MULTIPLIER, HIGH_TIME_FLOOR_MS) : null;
  const fastTimeThresholdMs = medianTimeMs !== null ? medianTimeMs * FAST_TIME_MULTIPLIER : null;

  const highTimeQuestions: FlaggedQuestion[] = [];
  const fastAccurateQuestions: FlaggedQuestion[] = [];
  if (highTimeThresholdMs !== null && fastTimeThresholdMs !== null) {
    for (const q of timedQuestions) {
      if (q.timeMs > highTimeThresholdMs) {
        highTimeQuestions.push({
          questionId: q.questionId,
          questionNumber: q.questionNumber,
          timeMs: q.timeMs,
          isCorrect: q.isCorrect,
          subtopicName: q.subtopicName,
        });
      } else if (q.isCorrect && q.timeMs <= fastTimeThresholdMs) {
        // Fast-but-wrong is never "strong performance" — the spec is explicit about this.
        fastAccurateQuestions.push({
          questionId: q.questionId,
          questionNumber: q.questionNumber,
          timeMs: q.timeMs,
          isCorrect: q.isCorrect,
          subtopicName: q.subtopicName,
        });
      }
    }
  }
  highTimeQuestions.sort((a, b) => b.timeMs - a.timeMs);
  fastAccurateQuestions.sort((a, b) => a.timeMs - b.timeMs);

  // Grouped by sub-topic name. A null/unresolved name groups together under one bucket rather
  // than being silently dropped, so the totals across sub-topics always still add up.
  const byName = new Map<string, AnalyticsQuestionInput[]>();
  for (const q of questions) {
    const key = q.subtopicName ?? "";
    const bucket = byName.get(key) ?? [];
    bucket.push(q);
    byName.set(key, bucket);
  }

  const overallAverageForLabel = averageTimeMs;
  const subtopics: SubtopicAnalytics[] = [];
  for (const [name, group] of byName) {
    if (!name) continue; // Unresolvable topic names contribute to overall stats but not a named card.
    const subCorrect = group.filter((q) => q.isCorrect).length;
    const subIncorrect = group.length - subCorrect;
    const subAccuracy = Math.round((subCorrect / group.length) * 100);
    const subTimed = group.filter((q): q is AnalyticsQuestionInput & { timeMs: number } => q.timeMs !== null);
    const subAverageTimeMs = subTimed.length > 0 ? Math.round(average(subTimed.map((q) => q.timeMs))!) : null;
    const subHighTimeCount = highTimeQuestions.filter((q) => q.subtopicName === name).length;
    const subFastAccurateCount = fastAccurateQuestions.filter((q) => q.subtopicName === name).length;

    let label: SubtopicPerformanceLabel;
    if (group.length < MIN_QUESTIONS_FOR_LABEL) {
      label = "INSUFFICIENT_DATA";
    } else {
      const highTimeShare = subHighTimeCount / group.length;
      const isWeak =
        subAccuracy < 50 ||
        subIncorrect >= Math.ceil(group.length * 0.5) ||
        (overallAverageForLabel !== null && subAverageTimeMs !== null && subAverageTimeMs >= overallAverageForLabel * 1.5) ||
        highTimeShare > 0.5;
      const isStrong =
        !isWeak &&
        subAccuracy >= 75 &&
        (overallAverageForLabel === null || subAverageTimeMs === null || subAverageTimeMs <= overallAverageForLabel * 1.15);
      label = isWeak ? "WEAK" : isStrong ? "STRONG" : "NEEDS_PRACTICE";
    }

    subtopics.push({
      name,
      attempted: group.length,
      correctCount: subCorrect,
      incorrectCount: subIncorrect,
      accuracyPercent: subAccuracy,
      averageTimeMs: subAverageTimeMs,
      highTimeCount: subHighTimeCount,
      fastAccurateCount: subFastAccurateCount,
      performanceLabel: label,
    });
  }

  // Worst-first / best-first — the callout sections lead with what matters most.
  const weakAreas = subtopics
    .filter((s) => s.performanceLabel === "WEAK" || s.performanceLabel === "NEEDS_PRACTICE")
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent);
  const strongAreas = subtopics
    .filter((s) => s.performanceLabel === "STRONG")
    .sort((a, b) => b.accuracyPercent - a.accuracyPercent);

  let trend: PracticeResultTrend = "NOT_AVAILABLE";
  if (previousAccuracyPercent !== null) {
    const delta = accuracyPercent - previousAccuracyPercent;
    trend = delta >= TREND_DELTA_THRESHOLD_PP ? "IMPROVING" : delta <= -TREND_DELTA_THRESHOLD_PP ? "DECLINING" : "STEADY";
  }

  return {
    score: { accuracyPercent, questionsAttempted: attempted, correctCount, incorrectCount, totalTimeMs, averageTimeMs },
    timeRule: {
      timedQuestionCount: timedQuestions.length,
      medianTimeMs,
      highTimeThresholdMs,
      fastTimeThresholdMs,
    },
    highTimeQuestions,
    fastAccurateQuestions,
    subtopics: subtopics.sort((a, b) => b.attempted - a.attempted),
    weakAreas,
    strongAreas,
    previousPerformance: {
      available: previousAccuracyPercent !== null,
      previousAccuracyPercent,
      currentAccuracyPercent: accuracyPercent,
      trend,
    },
  };
}

/**
 * The compact, AI-safe projection of {@link PracticeResultAnalytics} — everything the AI
 * Feedback tab sends the backend, and nothing else. No question text, no explanations, no raw
 * question ids beyond a 1-based question number (needed only so the model can refer to "Q7").
 * See `AI_ARCHITECTURE.md`'s cost-control posture and the spec's own §10.
 */
export type CompactPracticeResultInsightPayload = {
  accuracyPercent: number;
  questionsAttempted: number;
  correctCount: number;
  incorrectCount: number;
  totalTimeMs: number | null;
  averageTimeMs: number | null;
  subtopics: {
    name: string;
    attempted: number;
    accuracyPercent: number;
    averageTimeMs: number | null;
    incorrectCount: number;
    highTimeCount: number;
    fastAccurateCount: number;
    performanceLabel: SubtopicPerformanceLabel;
  }[];
  highTimeQuestions: { questionNumber: number; timeMs: number; isCorrect: boolean; subtopicName: string | null }[];
  fastAccurateQuestions: { questionNumber: number; timeMs: number; subtopicName: string | null }[];
  previousPerformance: {
    available: boolean;
    previousAccuracyPercent: number | null;
    currentAccuracyPercent: number;
    trend: PracticeResultTrend;
  };
};

export function toCompactInsightPayload(analytics: PracticeResultAnalytics): CompactPracticeResultInsightPayload {
  return {
    accuracyPercent: analytics.score.accuracyPercent,
    questionsAttempted: analytics.score.questionsAttempted,
    correctCount: analytics.score.correctCount,
    incorrectCount: analytics.score.incorrectCount,
    totalTimeMs: analytics.score.totalTimeMs,
    averageTimeMs: analytics.score.averageTimeMs,
    subtopics: analytics.subtopics.map((s) => ({
      name: s.name,
      attempted: s.attempted,
      accuracyPercent: s.accuracyPercent,
      averageTimeMs: s.averageTimeMs,
      incorrectCount: s.incorrectCount,
      highTimeCount: s.highTimeCount,
      fastAccurateCount: s.fastAccurateCount,
      performanceLabel: s.performanceLabel,
    })),
    // Capped at 5 each — a full session's worth would bloat the prompt for no benefit; the
    // extremes are what a diagnosis needs, not an exhaustive list.
    highTimeQuestions: analytics.highTimeQuestions
      .slice(0, 5)
      .map((q) => ({ questionNumber: q.questionNumber, timeMs: q.timeMs, isCorrect: q.isCorrect, subtopicName: q.subtopicName })),
    fastAccurateQuestions: analytics.fastAccurateQuestions
      .slice(0, 5)
      .map((q) => ({ questionNumber: q.questionNumber, timeMs: q.timeMs, subtopicName: q.subtopicName })),
    previousPerformance: analytics.previousPerformance,
  };
}
