/**
 * The Weakness Radar topic-health formula, on the device (Weakness Radar v1 —
 * `tasks/TASK-2201-weakness-radar.md`).
 *
 * ## Why this exists twice
 *
 * The authoritative implementation is
 * `backend/src/main/java/com/sarkaritaiyaari/backend/service/TopicHealthService.java`, and a
 * signed-in student always gets the server's answer. This file is the *signed-out* path: this
 * app works fully without an account, so a signed-out student's attempts live only in this
 * device's SQLite and never reach a server that could score them. Showing them nothing would
 * regress a feature they already have (Progress works signed out), so the rules are mirrored
 * here.
 *
 * That duplication was a deliberate decision, taken with the same reasoning as the mastery
 * ladder this codebase already mirrors — `TopicProgressState.canTransitionTo` in Java,
 * `deriveState` in `db/topicProgressStore.ts`. **It can drift, and the only defences are the
 * ones below, so use them:**
 *
 * 1. Every constant here has the same name and value as its Java counterpart. If you change
 *    one, change both, and bump `ALGORITHM_VERSION` in both.
 * 2. `sample-data/weakness-radar-fixtures.json` is the one agreed statement of what these
 *    rules produce. The Java side asserts against it in `TopicHealthScoringTest`.
 * 3. This project has no mobile test runner (no jest/vitest is configured), so this copy is
 *    verified by reading and on the emulator — stated plainly rather than implied.
 *
 * ## What is absent rather than invented
 *
 * Speed. The supplied spec's §9 wants actual-versus-expected time per question; there is no
 * expected-time benchmark anywhere in this app, so the component is dropped and its weight
 * redistributed by `renormalise`. It is not scored as a neutral 50 — "we don't know" and
 * "average pace" are different claims and only one of them is true.
 */

/** Bump in lockstep with the Java constant of the same name. */
export const ALGORITHM_VERSION = "TOPIC_HEALTH_V1";

/* ---------------------------------------------------------------- evidence windows (§4, §6) */

export const EVIDENCE_WINDOW_DAYS = 365;
export const RECENT_WINDOW_DAYS = 30;
export const MIN_WINDOW_ATTEMPTS = 5;
export const HALF_LIFE_DAYS = 45;
export const RECENCY_FLOOR = 0.15;

/* ------------------------------------------------------------------- component weights (§5) */

const W_ACCURACY = 0.3;
const W_TREND = 0.2;
const W_SPEED = 0.15;
const W_CONSISTENCY = 0.1;
const W_DIFFICULTY = 0.1;
const W_PYQ = 0.1;
const W_RETENTION = 0.05;

/*
 * Mirrors the Java static initialiser: a silent drift in the weights would rescale every score
 * in the app with no visible symptom, so it is checked at module load.
 *
 * **But it must not throw in a release build, and the reason is specific to this side.** The
 * Java equivalent throwing stops the Spring context at boot — loud, in a controlled
 * environment, caught long before a deploy. Here, expo-router imports every route file at
 * startup, so this module is evaluated on every launch via
 * preparation-radar.tsx -> data/weaknessRadarData.ts -> localRadar.ts. A module-scope throw
 * would therefore take down the WHOLE app — Practice, Mock Test, everything — over one
 * mistyped constant in a feature the student may never open. That is a far worse outcome than
 * a slightly mis-scaled health score.
 *
 * And continuing really is safe: renormalise() divides by the *actual* sum, so a sum of 1.05
 * still preserves the relative weighting and still yields a 0-100 health score. The declared
 * weights being off is a correctness bug worth shouting about in development, not a reason to
 * deny a student the rest of the app.
 *
 * Found the hard way: nudging W_ACCURACY to 0.35 to prove the parity script could detect drift
 * pushed that edit into the running app via Fast Refresh, and the app died on the spot.
 */
const WEIGHT_SUM =
  W_ACCURACY + W_TREND + W_SPEED + W_CONSISTENCY + W_DIFFICULTY + W_PYQ + W_RETENTION;
if (Math.abs(WEIGHT_SUM - 1) > 1e-9) {
  const message = `Topic health weights must sum to 1.00 but sum to ${WEIGHT_SUM}`;
  if (__DEV__) {
    // Fail immediately and unmissably while developing — this is the check doing its job.
    throw new Error(message);
  }
  // Release: report and carry on. console.error is picked up by Sentry's default React Native
  // integration, so this still reaches the dashboard without this pure module having to import
  // the telemetry layer.
  console.error(message);
}

/* ----------------------------------------------------------------------- component tuning */

const MIN_EVENT_ANSWERS = 3;
const MIN_EVENTS_FOR_CONSISTENCY = 3;
const CONSISTENCY_STDDEV_MULTIPLIER = 2;
export const MIN_PYQ_ATTEMPTS = 5;
const PYQ_COVERAGE_TARGET = 10;
const EXPECTED_ACCURACY_EASIEST = 75;
const EXPECTED_ACCURACY_HARDEST = 45;
const DIFFICULTY_NEUTRAL = 50;
const TREND_NEUTRAL = 50;

/* --------------------------------------------------------------------- confidence weights */

const CW_EVIDENCE = 0.4;
const CW_RECENCY = 0.2;
const CW_CONSISTENCY = 0.15;
const CW_DIFFICULTY_COVERAGE = 0.15;
const CW_PYQ_COVERAGE = 0.1;
const CONFIDENCE_FRESH_DAYS = 14;
const CONFIDENCE_STALE_DAYS = 180;
const CONFIDENCE_STALE_FLOOR = 0.2;

/* ------------------------------------------------------------------ state thresholds (§12) */

const STRONG_HEALTH_FLOOR = 70;
const ATTENTION_HEALTH_CEILING = 55;
const MIN_CONFIDENCE_FOR_VERDICT = 45;
export const IMPROVING_DELTA = 12;
export const DECLINE_DELTA = 15;
const PREVIOUSLY_STRONG_ACCURACY = 75;

/* -------------------------------------------------------------------------------- types */

/** Mirrors the Java enum. Kept as a union rather than a TS enum, matching this codebase. */
export type TopicHealthState =
  | "INSUFFICIENT_DATA"
  | "DEVELOPING"
  | "STRONG"
  | "NEEDS_ATTENTION"
  | "NEEDS_REVISION"
  | "IMPROVING";

export type EvidenceLevel =
  | "INSUFFICIENT_DATA"
  | "EARLY_SIGNAL"
  | "DEVELOPING_CONFIDENCE"
  | "RELIABLE";

export type PerformanceTrend = "IMPROVING" | "STABLE" | "DECLINING" | "NOT_ENOUGH_DATA";

/**
 * One (topic, sitting, difficulty, PYQ flag) bucket of answered questions.
 *
 * Same grain as the Java record: per sitting so consistency can be measured across sessions,
 * per difficulty and per PYQ flag so those terms need no second pass.
 */
export type EvidenceEvent = {
  topicId: string;
  /** Groups answers from one sitting — a practice session id or a mock attempt id. */
  eventId: string;
  occurredAtMs: number;
  /** A `difficulty_levels.code`, or null when the question has no usable difficulty. */
  difficultyCode: string | null;
  pyq: boolean;
  answered: number;
  correct: number;
  /** Sum of recorded per-question times, or null when none were recorded. */
  totalTimeMs: number | null;
  /** How many of `answered` carried a time. Zero means no timing at all. */
  timedAnswers: number;
};

export type TopicHealthResult = {
  topicId: string;
  health: number;
  confidence: number;
  state: TopicHealthState;
  trend: PerformanceTrend;
  trendDelta: number | null;
  evidenceLevel: EvidenceLevel;
  attemptedCount: number;
  correctCount: number;
  recentAttemptedCount: number;
  recentAccuracy: number | null;
  historicalAccuracy: number | null;
  pyqAttemptedCount: number;
  pyqAccuracy: number | null;
  consistency: number | null;
  /** Always null under v1 — see the module comment. */
  speedRatio: number | null;
  /**
   * How many answered questions carried a recorded time.
   *
   * Zero on every device today, and that is the point: it is the field that shows the speed
   * signal is absent for want of data rather than for want of a formula. Mirrors the
   * `timedAnswerCount` the Java side records in its audit blob.
   */
  timedAnswerCount: number;
  lastAttemptAtMs: number;
  staleRecentWindow: boolean;
  droppedComponents: Record<string, string>;
};

/**
 * The difficulty ladder, normalised to 0 (easiest) .. 1 (hardest).
 *
 * Built from the synced `difficulty_levels` rows in display order rather than hardcoding
 * easy/medium/hard: difficulty is admin-editable data in this project by design, so a
 * hardcoded code would break silently the moment someone reorders a level.
 */
export type DifficultyScale = { hardnessByCode: Record<string, number>; levelCount: number };

export function buildDifficultyScale(orderedCodes: string[]): DifficultyScale {
  const hardnessByCode: Record<string, number> = {};
  const n = orderedCodes.length;
  orderedCodes.forEach((code, i) => {
    hardnessByCode[code] = n === 1 ? 0.5 : i / (n - 1);
  });
  return { hardnessByCode, levelCount: n };
}

function hardnessOf(scale: DifficultyScale, code: string | null): number | null {
  if (code === null) return null;
  const value = scale.hardnessByCode[code];
  return value === undefined ? null : value;
}

function expectedAccuracyOf(scale: DifficultyScale, code: string | null): number {
  const hardness = hardnessOf(scale, code);
  const h = hardness === null ? 0.5 : hardness;
  return EXPECTED_ACCURACY_EASIEST + h * (EXPECTED_ACCURACY_HARDEST - EXPECTED_ACCURACY_EASIEST);
}

/* ------------------------------------------------------------------------- the formula */

/**
 * One topic's diagnosis from its evidence. Pure and deterministic.
 *
 * @param nowMs injected rather than read from the clock, so recency and trend behave
 *              identically to the Java side for the shared fixtures
 * @returns null when there is no usable evidence at all — a topic that has never been
 *          practised has no row, which is not the same as being weak (§21)
 */
export function scoreTopicHealth(
  topicId: string,
  events: EvidenceEvent[],
  nowMs: number,
  scale: DifficultyScale,
): TopicHealthResult | null {
  if (events.length === 0) return null;

  let attempted = 0;
  let correct = 0;
  let timedAnswers = 0;
  let lastAttemptAtMs = 0;
  for (const e of events) {
    attempted += e.answered;
    correct += e.correct;
    timedAnswers += e.timedAnswers;
    if (e.occurredAtMs > lastAttemptAtMs) lastAttemptAtMs = e.occurredAtMs;
  }
  if (attempted === 0) return null;

  const evidenceLevel = evidenceLevelFor(attempted);

  /* ------------------------------------------------------------------- windows */
  const newestFirst = [...events].sort((a, b) => b.occurredAtMs - a.occurredAtMs);
  const recentCutoff = nowMs - RECENT_WINDOW_DAYS * DAY_MS;

  let recent = newestFirst.filter((e) => e.occurredAtMs >= recentCutoff);
  let staleRecentWindow = false;
  if (answeredIn(recent) < MIN_WINDOW_ATTEMPTS) {
    // The student has not practised this topic lately. Fall back to their newest attempts
    // whatever their age, and flag it — which lowers confidence through the recency factor
    // rather than fabricating a trend. §21 asks for old data to be de-emphasised, not
    // treated as current.
    recent = [];
    let gathered = 0;
    for (const e of newestFirst) {
      recent.push(e);
      // Flagged only when the fallback genuinely reached past the window: a brand-new
      // student with three answers from today has a thin window, not a stale one.
      if (e.occurredAtMs < recentCutoff) staleRecentWindow = true;
      gathered += e.answered;
      if (gathered >= MIN_WINDOW_ATTEMPTS) break;
    }
  }
  const recentIds = new Set(recent.map((e) => e.eventId));
  const historical = events.filter((e) => !recentIds.has(e.eventId));

  const recentAttempted = answeredIn(recent);
  const historicalAttempted = answeredIn(historical);
  const recentAccuracy = plainAccuracy(recent);
  const historicalAccuracy = plainAccuracy(historical);

  const windowsComparable =
    recentAttempted >= MIN_WINDOW_ATTEMPTS && historicalAttempted >= MIN_WINDOW_ATTEMPTS;
  const trendDelta =
    windowsComparable && recentAccuracy !== null && historicalAccuracy !== null
      ? recentAccuracy - historicalAccuracy
      : null;

  let trend: PerformanceTrend;
  if (trendDelta === null) trend = "NOT_ENOUGH_DATA";
  else if (trendDelta >= IMPROVING_DELTA) trend = "IMPROVING";
  else if (trendDelta <= -DECLINE_DELTA) trend = "DECLINING";
  else trend = "STABLE";

  /* ---------------------------------------------------------------- components */
  const components: Record<string, number> = {};
  const weights: Record<string, number> = {};
  const dropped: Record<string, string> = {};

  components.accuracy = weightedAccuracy(events, nowMs);
  weights.accuracy = W_ACCURACY;

  if (trendDelta !== null) {
    components.recentTrend = clamp(TREND_NEUTRAL + trendDelta, 0, 100);
    weights.recentTrend = W_TREND;
  } else {
    dropped.recentTrend = "NOT_ENOUGH_EVIDENCE_IN_BOTH_WINDOWS";
  }

  // Never available under v1. Recorded as dropped rather than silently omitted.
  dropped.speed = "NO_EXPECTED_TIME_BENCHMARKS";

  const consistency = consistencyOf(events);
  if (consistency !== null) {
    components.consistency = consistency;
    weights.consistency = W_CONSISTENCY;
  } else {
    dropped.consistency = `FEWER_THAN_${MIN_EVENTS_FOR_CONSISTENCY}_QUALIFYING_SESSIONS`;
  }

  const difficulty = difficultyHandling(events, scale);
  if (difficulty !== null) {
    components.difficultyHandling = difficulty;
    weights.difficultyHandling = W_DIFFICULTY;
  } else {
    dropped.difficultyHandling = "NO_RESOLVABLE_DIFFICULTY_METADATA";
  }

  let pyqAttempted = 0;
  for (const e of events) if (e.pyq) pyqAttempted += e.answered;
  let pyqAccuracy: number | null = null;
  if (pyqAttempted >= MIN_PYQ_ATTEMPTS) {
    pyqAccuracy = weightedAccuracy(
      events.filter((e) => e.pyq),
      nowMs,
    );
    components.pyqPerformance = pyqAccuracy;
    weights.pyqPerformance = W_PYQ;
  } else {
    // Excluded, not assumed — §21: missing PYQ evidence means no PYQ signal, never "treat
    // these as ordinary questions and score them anyway".
    dropped.pyqPerformance = `FEWER_THAN_${MIN_PYQ_ATTEMPTS}_PYQ_ANSWERS`;
  }

  if (historicalAccuracy !== null && recentAccuracy !== null) {
    // Decay specifically, not direction: only a drop from the historical level counts
    // against retention, so improving never scores below holding steady.
    components.retention = clamp(
      100 - CONSISTENCY_STDDEV_MULTIPLIER * Math.max(0, historicalAccuracy - recentAccuracy),
      0,
      100,
    );
    weights.retention = W_RETENTION;
  } else {
    dropped.retention = "NO_HISTORICAL_WINDOW";
  }

  const effectiveWeights = renormalise(weights);
  let health = 0;
  for (const [key, value] of Object.entries(components)) {
    health += value * effectiveWeights[key];
  }

  /* --------------------------------------------------------------- confidence */
  const confidenceFactors: Record<string, number> = {};
  const confidenceWeights: Record<string, number> = {};

  confidenceFactors.evidence = evidenceFactor(evidenceLevel);
  confidenceWeights.evidence = CW_EVIDENCE;

  confidenceFactors.recency = recencyFactor(lastAttemptAtMs, nowMs, staleRecentWindow);
  confidenceWeights.recency = CW_RECENCY;

  if (consistency !== null) {
    confidenceFactors.consistency = consistency / 100;
    confidenceWeights.consistency = CW_CONSISTENCY;
  }
  const coverage = difficultyCoverage(events, scale);
  if (coverage !== null) {
    confidenceFactors.difficultyCoverage = coverage;
    confidenceWeights.difficultyCoverage = CW_DIFFICULTY_COVERAGE;
  }
  if (pyqAttempted > 0) {
    confidenceFactors.pyqCoverage = Math.min(1, pyqAttempted / PYQ_COVERAGE_TARGET);
    confidenceWeights.pyqCoverage = CW_PYQ_COVERAGE;
  }

  const effectiveConfidenceWeights = renormalise(confidenceWeights);
  let confidence = 0;
  for (const [key, value] of Object.entries(confidenceFactors)) {
    confidence += value * 100 * effectiveConfidenceWeights[key];
  }

  const state = resolveState(
    evidenceLevel,
    health,
    confidence,
    trendDelta,
    historicalAccuracy,
    recentAccuracy,
  );

  return {
    topicId,
    health: round2(health),
    confidence: round2(confidence),
    state,
    trend,
    trendDelta: trendDelta === null ? null : round2(trendDelta),
    evidenceLevel,
    attemptedCount: attempted,
    correctCount: correct,
    recentAttemptedCount: recentAttempted,
    recentAccuracy: recentAccuracy === null ? null : round2(recentAccuracy),
    historicalAccuracy: historicalAccuracy === null ? null : round2(historicalAccuracy),
    pyqAttemptedCount: pyqAttempted,
    pyqAccuracy: pyqAccuracy === null ? null : round2(pyqAccuracy),
    consistency: consistency === null ? null : round2(consistency),
    // Always null in v1. Not a gap to be filled with 1.0.
    speedRatio: null,
    timedAnswerCount: timedAnswers,
    lastAttemptAtMs,
    staleRecentWindow,
    droppedComponents: dropped,
  };
}

/**
 * The six states of §12, resolved in a fixed order.
 *
 * The order is the design: no evidence beats everything (§21); a real regression from a
 * genuinely strong past is its own finding; STRONG before IMPROVING so a strong-and-rising
 * topic reads as strong; IMPROVING before NEEDS_ATTENTION, which is §6's requirement that a
 * student climbing from 51% to 79% is never told they are weak.
 */
export function resolveState(
  evidenceLevel: EvidenceLevel,
  health: number,
  confidence: number,
  trendDelta: number | null,
  historicalAccuracy: number | null,
  _recentAccuracy: number | null,
): TopicHealthState {
  if (evidenceLevel === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";

  const previouslyStrong =
    historicalAccuracy !== null && historicalAccuracy >= PREVIOUSLY_STRONG_ACCURACY;
  const declined = trendDelta !== null && trendDelta <= -DECLINE_DELTA;
  if (previouslyStrong && declined) return "NEEDS_REVISION";

  const reliable = confidence >= MIN_CONFIDENCE_FOR_VERDICT;
  if (health >= STRONG_HEALTH_FLOOR && reliable) return "STRONG";
  if (trendDelta !== null && trendDelta >= IMPROVING_DELTA) return "IMPROVING";
  if (health <= ATTENTION_HEALTH_CEILING && reliable) return "NEEDS_ATTENTION";
  return "DEVELOPING";
}

/* ------------------------------------------------------------------- component maths */

export function evidenceLevelFor(meaningfulAttempts: number): EvidenceLevel {
  if (meaningfulAttempts >= 20) return "RELIABLE";
  if (meaningfulAttempts >= 10) return "DEVELOPING_CONFIDENCE";
  if (meaningfulAttempts >= 5) return "EARLY_SIGNAL";
  return "INSUFFICIENT_DATA";
}

/**
 * Scales the surviving weights so they sum to 1.
 *
 * This is what makes a missing signal honest. Scoring an absent component at a neutral 50
 * would drag every score toward the middle and assert something never measured; leaving the
 * weights unnormalised would cap everyone below 100 by whatever fraction is missing.
 */
export function renormalise(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const [key, value] of Object.entries(weights)) out[key] = value / total;
  return out;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function recencyWeight(occurredAtMs: number, nowMs: number): number {
  const ageDays = Math.max(0, (nowMs - occurredAtMs) / DAY_MS);
  return Math.max(RECENCY_FLOOR, Math.pow(0.5, ageDays / HALF_LIFE_DAYS));
}

function weightedAccuracy(events: EvidenceEvent[], nowMs: number): number {
  let weightedCorrect = 0;
  let weightedAnswered = 0;
  for (const e of events) {
    const w = recencyWeight(e.occurredAtMs, nowMs);
    weightedCorrect += w * e.correct;
    weightedAnswered += w * e.answered;
  }
  return weightedAnswered <= 0 ? 0 : (100 * weightedCorrect) / weightedAnswered;
}

function plainAccuracy(events: EvidenceEvent[]): number | null {
  const answered = answeredIn(events);
  if (answered === 0) return null;
  const correct = events.reduce((sum, e) => sum + e.correct, 0);
  return (100 * correct) / answered;
}

function answeredIn(events: EvidenceEvent[]): number {
  return events.reduce((sum, e) => sum + e.answered, 0);
}

/**
 * How stable performance is across sittings (§10).
 *
 * Merged by event id first, because one session produces several evidence rows (one per
 * difficulty and PYQ flag) and treating those as separate sittings would understate variance.
 */
export function consistencyOf(events: EvidenceEvent[]): number | null {
  const byEvent = new Map<string, { answered: number; correct: number }>();
  for (const e of events) {
    const acc = byEvent.get(e.eventId) ?? { answered: 0, correct: 0 };
    acc.answered += e.answered;
    acc.correct += e.correct;
    byEvent.set(e.eventId, acc);
  }
  const series: number[] = [];
  for (const acc of byEvent.values()) {
    if (acc.answered >= MIN_EVENT_ANSWERS) series.push((100 * acc.correct) / acc.answered);
  }
  if (series.length < MIN_EVENTS_FOR_CONSISTENCY) return null;

  const mean = series.reduce((sum, v) => sum + v, 0) / series.length;
  const variance = series.reduce((sum, v) => sum + (v - mean) ** 2, 0) / series.length;
  return clamp(100 - CONSISTENCY_STDDEV_MULTIPLIER * Math.sqrt(variance), 0, 100);
}

/**
 * How the student handles difficulty, measured against what each difficulty should produce
 * (§7).
 *
 * Bounded by construction: a bucket performing exactly as expected scores the neutral 50, and
 * the whole term carries 10% of the weight — so attempting a pile of very hard questions
 * cannot swing health, while genuinely handling hard questions well still shows.
 */
function difficultyHandling(events: EvidenceEvent[], scale: DifficultyScale): number | null {
  const byCode = new Map<string, { answered: number; correct: number }>();
  for (const e of events) {
    // An unrecognised difficulty contributes nothing rather than being bucketed as medium.
    if (hardnessOf(scale, e.difficultyCode) === null) continue;
    const code = e.difficultyCode as string;
    const acc = byCode.get(code) ?? { answered: 0, correct: 0 };
    acc.answered += e.answered;
    acc.correct += e.correct;
    byCode.set(code, acc);
  }
  let weightedScore = 0;
  let totalAnswered = 0;
  for (const [code, acc] of byCode) {
    if (acc.answered === 0) continue;
    const observed = (100 * acc.correct) / acc.answered;
    const expected = expectedAccuracyOf(scale, code);
    weightedScore += acc.answered * clamp(observed - expected + DIFFICULTY_NEUTRAL, 0, 100);
    totalAnswered += acc.answered;
  }
  return totalAnswered === 0 ? null : weightedScore / totalAnswered;
}

/** What share of the difficulty scale the evidence spans — a confidence input, not a health one. */
function difficultyCoverage(events: EvidenceEvent[], scale: DifficultyScale): number | null {
  if (scale.levelCount === 0) return null;
  const seen = new Set<string>();
  for (const e of events) {
    if (hardnessOf(scale, e.difficultyCode) !== null) seen.add(e.difficultyCode as string);
  }
  if (seen.size === 0) return null;
  return Math.min(1, seen.size / scale.levelCount);
}

function evidenceFactor(level: EvidenceLevel): number {
  switch (level) {
    case "INSUFFICIENT_DATA":
      return 0;
    case "EARLY_SIGNAL":
      return 0.35;
    case "DEVELOPING_CONFIDENCE":
      return 0.7;
    default:
      return 1;
  }
}

/**
 * How much the age of the evidence supports trusting it. Never reaches zero — old evidence is
 * weak evidence, not no evidence.
 */
function recencyFactor(lastAttemptAtMs: number, nowMs: number, staleWindow: boolean): number {
  const ageDays = Math.max(0, (nowMs - lastAttemptAtMs) / DAY_MS);
  let base: number;
  if (ageDays <= CONFIDENCE_FRESH_DAYS) {
    base = 1;
  } else if (ageDays >= CONFIDENCE_STALE_DAYS) {
    base = CONFIDENCE_STALE_FLOOR;
  } else {
    const progress =
      (ageDays - CONFIDENCE_FRESH_DAYS) / (CONFIDENCE_STALE_DAYS - CONFIDENCE_FRESH_DAYS);
    base = 1 - progress * (1 - CONFIDENCE_STALE_FLOOR);
  }
  return staleWindow ? Math.max(CONFIDENCE_STALE_FLOOR, base * 0.5) : base;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
