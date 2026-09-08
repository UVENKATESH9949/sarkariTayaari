import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { examTopicIntelligence, topicPrerequisites, topics } from "../db/schema";
import {
  loadDifficultyScale,
  loadLocalEvidence,
  loadPyqCounts,
  loadQuestionCounts,
} from "./localEvidence";
import { scoreTopicHealth, ALGORITHM_VERSION, type TopicHealthResult } from "./topicHealth";
import type {
  ActionStep,
  PrerequisiteRef,
  RadarOverview,
  RadarOverviewStatus,
  RadarReasonCode,
  RadarTopic,
  RecommendedActionName,
  TopicHealthStateName,
  WeaknessRadar,
} from "./types";

/**
 * Builds a Weakness Radar entirely on this device (Weakness Radar v1, signed-out path).
 *
 * The authoritative implementation is
 * `backend/.../service/WeaknessRadarService.java`; this mirrors its assembly and its rule
 * table, and produces the identical payload shape so no screen has to know where its radar
 * came from. See `topicHealth.ts`'s module comment for why the duplication exists and what
 * keeps it honest.
 *
 * ## What this cannot do, and says so
 *
 * It sees only *this device's* attempts. A signed-out student has no other device by
 * definition, so that is not a limitation for them — but it is exactly why a signed-in student
 * always gets the server's answer instead, even when this code would run faster.
 *
 * Everything it needs beyond the attempts is already synced content: `exam_topic_intelligence`
 * carries Epic L's per-exam priority (and is itself built from `exam_topics` server-side, so
 * it doubles as the exam's topic map), `topic_prerequisites` carries the DAG, and the question
 * tables carry availability. No new sync was added for any of it.
 */

/* ---------------------------------------------------- rule-table constants (mirror the Java) */

const PYQ_GAP_POINTS = 15;
const DEEP_WEAKNESS_HEALTH = 40;
const DEVELOPING_FOUNDATION_HEALTH = 55;
const LOW_CONSISTENCY = 50;
const HIGH_EXAM_PRIORITY = 75;
const OVERVIEW_STRONG = 70;
const OVERVIEW_ON_TRACK = 55;

/** §16's section order. Sorting by this first is what lets a screen group by state and stop. */
const SECTION_ORDER: Record<TopicHealthStateName, number> = {
  NEEDS_ATTENTION: 0,
  NEEDS_REVISION: 1,
  IMPROVING: 2,
  DEVELOPING: 3,
  STRONG: 4,
  INSUFFICIENT_DATA: 5,
};

type Scored = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  parentTopicName: string | null;
  health: TopicHealthResult | null;
  priority: number | null;
  questionCount: number;
  pyqQuestionCount: number;
  prerequisites: { topicId: string; topicName: string }[];
};

export async function buildLocalRadar(examCode: string, nowMs = Date.now()): Promise<WeaknessRadar> {
  // exam_topic_intelligence is one row per topic mapped to this exam, so it is both the topic
  // map and the priority source — the same "built from exam_topics outward" list the server
  // assembles from.
  const mapped = await db
    .select({
      topicId: examTopicIntelligence.topicId,
      finalPriority: examTopicIntelligence.finalPriority,
    })
    .from(examTopicIntelligence)
    .where(eq(examTopicIntelligence.examCode, examCode))
    .all();

  const topicIds = mapped.map((m) => m.topicId);
  if (topicIds.length === 0) {
    return emptyRadar(examCode);
  }

  const topicRows = await db
    .select({
      id: topics.id,
      name: topics.name,
      subjectId: topics.subjectId,
      subjectName: topics.subjectName,
      parentName: topics.parentName,
    })
    .from(topics)
    .where(inArray(topics.id, topicIds))
    .all();
  const topicById = new Map(topicRows.map((t) => [t.id, t]));

  const prereqRows = await db
    .select({
      topicId: topicPrerequisites.topicId,
      prerequisiteTopicId: topicPrerequisites.prerequisiteTopicId,
    })
    .from(topicPrerequisites)
    .where(inArray(topicPrerequisites.topicId, topicIds))
    .all();

  const [evidence, scale, questionCounts, pyqCounts] = await Promise.all([
    loadLocalEvidence(nowMs),
    loadDifficultyScale(),
    loadQuestionCounts(examCode, topicIds),
    loadPyqCounts(examCode, topicIds),
  ]);

  const scored: Scored[] = [];
  for (const mapping of mapped) {
    const topic = topicById.get(mapping.topicId);
    // A mapped topic this device has no `topics` row for — content sync mid-flight. Skipped
    // rather than shown nameless.
    if (!topic) continue;
    const events = evidence.get(mapping.topicId) ?? [];
    scored.push({
      topicId: topic.id,
      topicName: topic.name,
      subjectId: topic.subjectId,
      subjectName: topic.subjectName,
      parentTopicName: topic.parentName ?? null,
      health: events.length > 0 ? scoreTopicHealth(topic.id, events, nowMs, scale) : null,
      priority: mapping.finalPriority ?? null,
      questionCount: questionCounts.get(mapping.topicId) ?? 0,
      pyqQuestionCount: pyqCounts.get(mapping.topicId) ?? 0,
      prerequisites: prereqRows
        .filter((p) => p.topicId === mapping.topicId)
        .map((p) => ({
          topicId: p.prerequisiteTopicId,
          topicName: topicById.get(p.prerequisiteTopicId)?.name ?? "",
        })),
    });
  }

  const stateByTopic = new Map<string, TopicHealthStateName>(
    scored.map((s) => [s.topicId, stateOf(s)]),
  );
  const easiest = scale.levelCount > 0 ? codeAt(scale.hardnessByCode, 0) : null;
  const hardest = scale.levelCount > 0 ? codeAt(scale.hardnessByCode, 1) : null;

  const topicsOut = scored
    .map((s) => toRadarTopic(s, stateByTopic, easiest, hardest))
    .sort(radarOrder);

  return {
    examCode,
    algorithmVersion: ALGORITHM_VERSION,
    computedAt: new Date(nowMs).toISOString(),
    overview: overviewOf(scored, stateByTopic),
    topics: topicsOut,
  };
}

/* ---------------------------------------------------------------------------- assembly */

function stateOf(scored: Scored): TopicHealthStateName {
  return scored.health === null ? "INSUFFICIENT_DATA" : scored.health.state;
}

function toRadarTopic(
  scored: Scored,
  stateByTopic: Map<string, TopicHealthStateName>,
  easiestDifficulty: string | null,
  hardestDifficulty: string | null,
): RadarTopic {
  const h = scored.health;
  const state = stateOf(scored);
  const unmet = unmetPrerequisites(scored, stateByTopic);
  const { primary, steps, reasons, explanation } = recommend(
    scored,
    state,
    unmet,
    easiestDifficulty,
    hardestDifficulty,
  );

  return {
    topicId: scored.topicId,
    topicName: scored.topicName,
    subjectId: scored.subjectId,
    subjectName: scored.subjectName,
    parentTopicName: scored.parentTopicName,
    state,
    healthScore: h === null ? 0 : Math.round(h.health),
    trend: h === null ? "NOT_ENOUGH_DATA" : h.trend,
    trendDelta: h === null || h.trendDelta === null ? null : Math.round(h.trendDelta),
    evidenceLevel: h === null ? "INSUFFICIENT_DATA" : h.evidenceLevel,
    attemptedCount: h === null ? 0 : h.attemptedCount,
    correctCount: h === null ? 0 : h.correctCount,
    accuracyPercent:
      h === null || h.attemptedCount === 0
        ? null
        : Math.round((100 * h.correctCount) / h.attemptedCount),
    recentAccuracyPercent: roundOrNull(h?.recentAccuracy ?? null),
    historicalAccuracyPercent: roundOrNull(h?.historicalAccuracy ?? null),
    pyqAttemptedCount: h === null ? 0 : h.pyqAttemptedCount,
    pyqAccuracyPercent: roundOrNull(h?.pyqAccuracy ?? null),
    // Hardcoded, not derived from speedRatio: under v1 there is no path by which it could be
    // true, and a client reading a nullable ratio might reasonably default it.
    speedAvailable: false,
    consistency:
      h === null || h.consistency === null
        ? "UNKNOWN"
        : h.consistency >= LOW_CONSISTENCY
          ? "STEADY"
          : "VARIABLE",
    priority: scored.priority,
    interventionValue: interventionValue(scored),
    questionCount: scored.questionCount,
    reasonCodes: reasons,
    explanation,
    recommendedAction: { primary, steps },
    unmetPrerequisites: unmet,
    lastPracticedAt: h === null ? null : new Date(h.lastAttemptAtMs).toISOString(),
  };
}

/**
 * How much attention this topic is worth, 0-100 (§13).
 *
 * `(health gap) x (exam priority) x (confidence)`. Null when the topic was never scored for
 * priority — substituting a midpoint would invent an exam-importance judgement nobody made.
 */
function interventionValue(scored: Scored): number | null {
  const h = scored.health;
  if (h === null || scored.priority === null) return null;
  const gap = (100 - h.health) / 100;
  return Math.round(gap * scored.priority * (h.confidence / 100));
}

function radarOrder(a: RadarTopic, b: RadarTopic): number {
  const section = SECTION_ORDER[a.state] - SECTION_ORDER[b.state];
  if (section !== 0) return section;
  // An unranked topic sorts last within its section rather than first — no priority is not
  // the same as top priority.
  const aNull = a.interventionValue === null ? 1 : 0;
  const bNull = b.interventionValue === null ? 1 : 0;
  if (aNull !== bNull) return aNull - bNull;
  const value = (b.interventionValue ?? 0) - (a.interventionValue ?? 0);
  if (value !== 0) return value;
  return a.topicName.localeCompare(b.topicName);
}

/**
 * Prerequisite topics that are not solid yet.
 *
 * Judged by radar state, not by the `topic_progress` mastery ladder that the Prepare checklist
 * uses — mixing the two vocabularies in one sentence would be confusing, and the mastery
 * ladder cannot express "was strong, has declined", which is precisely when this warning
 * matters.
 */
function unmetPrerequisites(
  scored: Scored,
  stateByTopic: Map<string, TopicHealthStateName>,
): PrerequisiteRef[] {
  const out: PrerequisiteRef[] = [];
  for (const prereq of scored.prerequisites) {
    const state = stateByTopic.get(prereq.topicId);
    // Outside this exam's topic map: absence of evidence about an off-syllabus topic is not a
    // warning.
    if (!state) continue;
    if (state === "STRONG" || state === "IMPROVING") continue;
    out.push({ topicId: prereq.topicId, topicName: prereq.topicName, state });
  }
  return out;
}

/* -------------------------------------------------------------------- the rule table (§14) */

type Recommendation = {
  primary: RecommendedActionName;
  steps: ActionStep[];
  reasons: RadarReasonCode[];
  explanation: string;
};

/**
 * The deterministic recommendation rules — first matching branch wins for the primary action,
 * reason codes accumulate. Mirrors `WeaknessRadarService.recommend` branch for branch.
 */
function recommend(
  scored: Scored,
  state: TopicHealthStateName,
  unmet: PrerequisiteRef[],
  easiestDifficulty: string | null,
  hardestDifficulty: string | null,
): Recommendation {
  const h = scored.health;
  const reasons: RadarReasonCode[] = [];
  const steps: ActionStep[] = [];
  let primary: RecommendedActionName;

  const canPractice = scored.questionCount > 0;
  const pyqAvailable = scored.pyqQuestionCount > 0;
  const health = h === null ? 0 : h.health;
  const accuracy = h === null || h.attemptedCount === 0 ? null : (100 * h.correctCount) / h.attemptedCount;
  const pyqGap =
    h !== null && h.pyqAccuracy !== null && accuracy !== null && accuracy - h.pyqAccuracy >= PYQ_GAP_POINTS;
  const isConcern = state === "NEEDS_ATTENTION" || state === "NEEDS_REVISION";

  if (!canPractice) {
    // Recommending "practise 10 questions" would open an empty screen — the same failure the
    // Prepare checklist already guards against, found on a device rather than by review.
    reasons.push("NO_QUESTIONS_AVAILABLE");
    primary = state === "INSUFFICIENT_DATA" ? "LEARN_CONCEPT" : "REVISION";
    steps.push({ action: "LEARN_CONCEPT", questionCount: null, difficultyCode: null });
  } else if (unmet.length > 0 && (isConcern || state === "INSUFFICIENT_DATA")) {
    reasons.push("PREREQUISITE_GAP");
    primary = "LEARN_CONCEPT";
    steps.push({ action: "LEARN_CONCEPT", questionCount: null, difficultyCode: null });
    steps.push({ action: "PRACTICE_FOUNDATIONAL", questionCount: 10, difficultyCode: easiestDifficulty });
  } else if (state === "INSUFFICIENT_DATA") {
    reasons.push("NOT_ENOUGH_PRACTICE");
    primary = "GATHER_EVIDENCE";
    steps.push({ action: "PRACTICE_FOUNDATIONAL", questionCount: 10, difficultyCode: easiestDifficulty });
  } else if (state === "NEEDS_REVISION") {
    reasons.push("RECENT_DECLINE");
    primary = "REVISION";
    steps.push({ action: "REVISION", questionCount: null, difficultyCode: null });
    steps.push({ action: "PRACTICE_MEDIUM", questionCount: 10, difficultyCode: null });
    if (pyqAvailable) steps.push({ action: "PRACTICE_PYQ", questionCount: 10, difficultyCode: null });
    steps.push({ action: "TIMED_PRACTICE", questionCount: null, difficultyCode: null });
  } else if (state === "NEEDS_ATTENTION") {
    if (health < DEEP_WEAKNESS_HEALTH) {
      // §14's worked example, in the order it gives.
      reasons.push("LOW_ACCURACY");
      primary = "LEARN_CONCEPT";
      steps.push({ action: "LEARN_CONCEPT", questionCount: null, difficultyCode: null });
      steps.push({ action: "PRACTICE_FOUNDATIONAL", questionCount: 10, difficultyCode: easiestDifficulty });
      steps.push({ action: "PRACTICE_MEDIUM", questionCount: 15, difficultyCode: null });
      if (pyqAvailable) steps.push({ action: "PRACTICE_PYQ", questionCount: 10, difficultyCode: null });
      steps.push({ action: "TIMED_PRACTICE", questionCount: null, difficultyCode: null });
    } else if (pyqGap && pyqAvailable) {
      reasons.push("PYQ_GAP");
      primary = "PRACTICE_PYQ";
      steps.push({ action: "PRACTICE_PYQ", questionCount: 10, difficultyCode: null });
      steps.push({ action: "PRACTICE_MEDIUM", questionCount: 10, difficultyCode: null });
      steps.push({ action: "TIMED_PRACTICE", questionCount: null, difficultyCode: null });
    } else {
      reasons.push("LOW_ACCURACY");
      primary = "PRACTICE_MEDIUM";
      steps.push({ action: "PRACTICE_MEDIUM", questionCount: 15, difficultyCode: null });
      if (pyqAvailable) steps.push({ action: "PRACTICE_PYQ", questionCount: 10, difficultyCode: null });
      steps.push({ action: "TIMED_PRACTICE", questionCount: null, difficultyCode: null });
    }
  } else if (state === "IMPROVING") {
    // Keep doing what is working, at the next difficulty up — not a warning.
    reasons.push("IMPROVING_FAST");
    primary = "PRACTICE_MEDIUM";
    steps.push({ action: "PRACTICE_MEDIUM", questionCount: 15, difficultyCode: null });
    if (pyqAvailable) steps.push({ action: "PRACTICE_PYQ", questionCount: 10, difficultyCode: null });
  } else if (state === "STRONG") {
    if (pyqGap && pyqAvailable) {
      reasons.push("PYQ_GAP");
      primary = "PRACTICE_PYQ";
      steps.push({ action: "PRACTICE_PYQ", questionCount: 10, difficultyCode: null });
    } else {
      reasons.push("STRONG_AND_STABLE");
      primary = "MAINTENANCE_PRACTICE";
      steps.push({ action: "PRACTICE_ADVANCED", questionCount: 10, difficultyCode: hardestDifficulty });
    }
  } else {
    // DEVELOPING: real evidence, no verdict yet. Build the evidence up at a matched level.
    if (h !== null && h.evidenceLevel !== "RELIABLE") reasons.push("NOT_ENOUGH_PRACTICE");
    else reasons.push("LOW_ACCURACY");
    if (health < DEVELOPING_FOUNDATION_HEALTH) {
      primary = "PRACTICE_FOUNDATIONAL";
      steps.push({ action: "PRACTICE_FOUNDATIONAL", questionCount: 10, difficultyCode: easiestDifficulty });
      steps.push({ action: "PRACTICE_MEDIUM", questionCount: 10, difficultyCode: null });
    } else {
      primary = "PRACTICE_MEDIUM";
      steps.push({ action: "PRACTICE_MEDIUM", questionCount: 15, difficultyCode: null });
    }
  }

  // Secondary reasons. They change the copy and the ranking, not the plan — which is what §13
  // asks for: priority raises urgency without redefining the fix.
  if (pyqGap && !reasons.includes("PYQ_GAP")) reasons.push("PYQ_GAP");
  if (h !== null && h.consistency !== null && h.consistency < LOW_CONSISTENCY) {
    reasons.push("HIGH_VARIANCE");
  }
  if (scored.priority !== null && scored.priority >= HIGH_EXAM_PRIORITY) {
    reasons.push("HIGH_EXAM_WEIGHT");
  }
  if (h !== null && h.staleRecentWindow) reasons.push("STALE_PRACTICE");

  return { primary, steps, reasons, explanation: explain(scored.topicName, state, reasons) };
}

/**
 * The English fallback sentence, for parity with the server's payload.
 *
 * The screens render their own localised copy from `reasonCodes` and never show this — it
 * exists so a locally-built radar is shaped exactly like a server one, including this field.
 * Tone follows §17: the topic needs attention, the student is not deficient.
 */
function explain(name: string, state: TopicHealthStateName, reasons: RadarReasonCode[]): string {
  if (reasons.includes("NO_QUESTIONS_AVAILABLE")) {
    return `${name} has no practice questions for this exam yet, so start with the concept.`;
  }
  if (reasons.includes("PREREQUISITE_GAP")) {
    return `${name} builds on a topic that is not solid yet — that one first.`;
  }
  switch (state) {
    case "INSUFFICIENT_DATA":
      return `Not enough practice in ${name} yet to judge it either way.`;
    case "NEEDS_REVISION":
      return `${name} used to be one of your stronger topics and has slipped recently.`;
    case "NEEDS_ATTENTION":
      return reasons.includes("PYQ_GAP")
        ? `${name} is fine on practice questions but weaker on real exam-style ones.`
        : `${name} needs more attention right now — accuracy is below your target.`;
    case "IMPROVING":
      return `${name} is improving clearly. Keep going.`;
    case "STRONG":
      return reasons.includes("PYQ_GAP")
        ? `${name} is strong overall, but real exam-style questions are still tripping you up.`
        : `${name} is one of your reliable topics.`;
    default:
      return reasons.includes("HIGH_VARIANCE")
        ? `${name} swings a lot between sessions — steadier practice will settle it.`
        : `${name} is coming along; a bit more practice will make the picture clear.`;
  }
}

/* -------------------------------------------------------------------------------- overview */

function overviewOf(
  scored: Scored[],
  stateByTopic: Map<string, TopicHealthStateName>,
): RadarOverview {
  const counts: Record<TopicHealthStateName, number> = {
    INSUFFICIENT_DATA: 0,
    DEVELOPING: 0,
    STRONG: 0,
    NEEDS_ATTENTION: 0,
    NEEDS_REVISION: 0,
    IMPROVING: 0,
  };
  let withEvidence = 0;
  let reliable = 0;
  let weightedHealth = 0;
  let weightTotal = 0;

  for (const s of scored) {
    counts[stateByTopic.get(s.topicId) ?? "INSUFFICIENT_DATA"] += 1;
    if (s.health === null) continue;
    withEvidence += 1;
    if (s.health.evidenceLevel === "RELIABLE") reliable += 1;
    // Weighted by exam priority so the readout reflects the topics that carry the exam.
    // Unscored topics still count, at weight 1, rather than dropping out of the picture.
    const weight = s.priority === null ? 1 : Math.max(1, s.priority);
    weightedHealth += weight * s.health.health;
    weightTotal += weight;
  }

  let status: RadarOverviewStatus;
  if (withEvidence === 0) status = "NO_DATA";
  else if (reliable === 0) status = "GETTING_STARTED";
  else {
    const mean = weightedHealth / weightTotal;
    status = mean >= OVERVIEW_STRONG ? "STRONG" : mean >= OVERVIEW_ON_TRACK ? "ON_TRACK" : "BUILDING";
  }

  return {
    status,
    topicsInSyllabus: scored.length,
    topicsWithEvidence: withEvidence,
    topicsReliable: reliable,
    needsAttentionCount: counts.NEEDS_ATTENTION,
    needsRevisionCount: counts.NEEDS_REVISION,
    improvingCount: counts.IMPROVING,
    strongCount: counts.STRONG,
    developingCount: counts.DEVELOPING,
    insufficientDataCount: counts.INSUFFICIENT_DATA,
    // Left empty deliberately. The server fills this with an English sentence for clients
    // with no string table; the two radar screens render their own localised copy from
    // `status` and never read it, so composing one here would be dead text that also had to
    // be kept in step with the Java version.
    headline: "",
  };
}

function emptyRadar(examCode: string): WeaknessRadar {
  return {
    examCode,
    algorithmVersion: ALGORITHM_VERSION,
    computedAt: null,
    overview: {
      status: "NO_DATA",
      topicsInSyllabus: 0,
      topicsWithEvidence: 0,
      topicsReliable: 0,
      needsAttentionCount: 0,
      needsRevisionCount: 0,
      improvingCount: 0,
      strongCount: 0,
      developingCount: 0,
      insufficientDataCount: 0,
      headline: "",
    },
    topics: [],
  };
}

/* -------------------------------------------------------------------------------- helpers */

/** The code sitting at a given normalised hardness (0 = easiest, 1 = hardest). */
function codeAt(hardnessByCode: Record<string, number>, target: number): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [code, hardness] of Object.entries(hardnessByCode)) {
    const distance = Math.abs(hardness - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = code;
    }
  }
  return best;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}
