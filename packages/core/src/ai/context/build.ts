/**
 * Context builders — pure projections, never data access.
 *
 * Nothing here reads a database, calls an endpoint, or knows what a database is. Each function
 * takes something the app has *already* computed and narrows it to the minimum an AI task is
 * entitled to. That is what keeps this file shared between `mobile/` (SQLite, offline) and
 * `web/` (HTTP, online) without either leaking into it.
 *
 * `assembleContext` is the enforcement point for §30's minimisation policy: it rebuilds the
 * context from the task's own `requiredContext` allowlist, so a part the task did not ask for
 * cannot reach a prompt even if a caller passes it. Dropping silently is deliberate — the
 * guarantee should hold without every call site having to remember it.
 */

import type { RadarTopic, WeaknessRadar } from "../../intelligence/types";
import type { AiLanguageCode, AiTaskDefinition } from "../tasks";
import type {
  AiContext,
  AiContextKind,
  ExamContext,
  LearnerContext,
  LearnerProfileContext,
  QuestionContext,
  SessionContext,
  TopicContext,
  TopicSnapshot,
} from "./types";

/**
 * How many topics a session/profile narrative gets to see on each side (strongest few,
 * weakest few) — same reasoning as `MAX_REASON_CODES`: the diagnosis is in the first few, the
 * tail costs tokens without changing what a student would read.
 */
export const MAX_PROFILE_TOPICS = 3;

/**
 * The diagnosis lives in the first few reason codes; `localRadar` emits them already ranked. The
 * tail costs tokens and adds nothing a student would read, so it is cut here rather than in a
 * prompt template where it would be easy to forget.
 */
export const MAX_REASON_CODES = 3;

/** What a question context needs, in whatever shape the caller already has it. */
export type QuestionContextInput = {
  questionId: string;
  questionType: string;
  languageCode: AiLanguageCode;
  questionText: string;
  options: readonly string[];
  correctAnswer: string;
  authoredExplanation?: string | null;
  subjectName: string;
  topicName: string;
  parentTopicName?: string | null;
  difficultyCode: string;
  isPyq?: boolean;
  pyqYear?: number | null;
};

export function buildQuestionContext(input: QuestionContextInput): QuestionContext {
  return {
    questionId: input.questionId,
    questionType: input.questionType,
    languageCode: input.languageCode,
    questionText: input.questionText,
    options: [...input.options],
    correctAnswer: input.correctAnswer,
    // Normalised to null so "" and undefined cannot mean two different things downstream: the
    // validator and the prompt both branch on "is there an authored explanation at all".
    authoredExplanation: emptyToNull(input.authoredExplanation),
    subjectName: input.subjectName,
    topicName: input.topicName,
    parentTopicName: emptyToNull(input.parentTopicName),
    difficultyCode: input.difficultyCode,
    isPyq: input.isPyq ?? false,
    pyqYear: input.pyqYear ?? null,
  };
}

/**
 * Projects a `RadarTopic` — already computed by `topicHealth` + `localRadar`, on device and
 * offline — into the aggregate view a model gets.
 *
 * Taking `RadarTopic` as the input rather than raw attempts is the whole point: the diagnosis is
 * already done, deterministically and testably, and the model is downstream of it. It also means
 * signed-out students get identical context, since `localRadar` produces the same shape from
 * local SQLite with no server involved.
 *
 * Note that `confidence` is not carried across, matching the rule `intelligence/types.ts`
 * already states: its job is to gate whether a verdict is asserted at all, and `evidenceLevel`
 * is the legible stand-in by the time a topic reaches this shape.
 */
export function buildLearnerContext(
  topic: RadarTopic,
  options: { examCode: string; preferredLanguage: AiLanguageCode },
): LearnerContext {
  return {
    targetExamCode: options.examCode,
    topicState: topic.state,
    healthScore: topic.healthScore,
    recentAccuracyPercent: topic.recentAccuracyPercent,
    evidenceLevel: topic.evidenceLevel,
    attemptedCount: topic.attemptedCount,
    reasonCodes: topic.reasonCodes.slice(0, MAX_REASON_CODES),
    preferredLanguage: options.preferredLanguage,
  };
}

export function buildExamContext(input: {
  examCode: string;
  examName: string;
  topicPriority?: number | null;
  weightagePercent?: number | null;
}): ExamContext {
  return {
    examCode: input.examCode,
    examName: input.examName,
    topicPriority: input.topicPriority ?? null,
    weightagePercent: input.weightagePercent ?? null,
  };
}

export function buildTopicContext(input: {
  topicId: string;
  topicName: string;
  subjectName: string;
  parentTopicName?: string | null;
}): TopicContext {
  return {
    topicId: input.topicId,
    topicName: input.topicName,
    subjectName: input.subjectName,
    parentTopicName: emptyToNull(input.parentTopicName),
  };
}

/**
 * Projects a `RadarTopic` into the compact shape `SESSION_FEEDBACK`/`PROFILE_SUMMARY` share —
 * one topic's current diagnosis, not this session's own count of it (see `TopicSnapshot`'s own
 * comment for why that distinction matters).
 */
export function buildTopicSnapshot(topic: RadarTopic): TopicSnapshot {
  return {
    topicId: topic.topicId,
    topicName: topic.topicName,
    subjectName: topic.subjectName,
    state: topic.state,
    healthScore: topic.healthScore,
    trend: topic.trend,
    reasonCodes: topic.reasonCodes.slice(0, MAX_REASON_CODES),
  };
}

/**
 * A just-finished session's facts, for `SESSION_FEEDBACK`. `sessionTopics` is the *current*
 * radar topics matching whatever topic ids this session touched — the caller fetches the
 * radar and filters it (this function does no fetching or filtering of its own, matching
 * every other builder here being a pure projection over already-computed values).
 */
export function buildSessionContext(input: {
  sessionKind: "PRACTICE" | "MOCK";
  examCode: string | null;
  answeredCount: number;
  correctCount: number;
  preferredLanguage: AiLanguageCode;
  sessionTopics: readonly RadarTopic[];
}): SessionContext {
  const accuracyPercent =
    input.answeredCount > 0 ? Math.round((input.correctCount / input.answeredCount) * 100) : 0;
  return {
    sessionKind: input.sessionKind,
    examCode: input.examCode,
    answeredCount: input.answeredCount,
    correctCount: input.correctCount,
    accuracyPercent,
    preferredLanguage: input.preferredLanguage,
    topics: input.sessionTopics.map(buildTopicSnapshot),
  };
}

/**
 * The whole-exam picture for `PROFILE_SUMMARY`. `radar.topics` is already ordered (concern
 * states first, strong states last, each section ranked by intervention value — see
 * `WeaknessRadar.topics`'s own doc comment) so `strengths`/`weaknesses` need no new ranking
 * logic here, only a filter and a slice off each end.
 */
export function buildLearnerProfileContext(
  radar: WeaknessRadar,
  options: { preferredLanguage: AiLanguageCode },
): LearnerProfileContext {
  const isWeak = (t: RadarTopic) => t.state === "NEEDS_ATTENTION" || t.state === "NEEDS_REVISION";
  const isStrong = (t: RadarTopic) => t.state === "STRONG" || t.state === "IMPROVING";

  return {
    examCode: radar.examCode,
    overviewStatus: radar.overview.status,
    topicsInSyllabus: radar.overview.topicsInSyllabus,
    topicsWithEvidence: radar.overview.topicsWithEvidence,
    weaknesses: radar.topics.filter(isWeak).slice(0, MAX_PROFILE_TOPICS).map(buildTopicSnapshot),
    strengths: radar.topics.filter(isStrong).slice(0, MAX_PROFILE_TOPICS).map(buildTopicSnapshot),
    preferredLanguage: options.preferredLanguage,
  };
}

/**
 * Narrows an assembled context to exactly what the task declared.
 *
 * Anything the task did not ask for is dropped rather than passed through — so
 * `QUESTION_EXPLANATION`, which is shared across every student, cannot accidentally carry one
 * student's performance into an answer that gets cached and served to everyone else. That
 * specific mistake would be invisible in review and catastrophic in a cache.
 */
export function assembleContext(task: AiTaskDefinition, parts: AiContext): AiContext {
  const allowed = new Set<AiContextKind>(task.requiredContext);
  const context: AiContext = {};

  if (allowed.has("question") && parts.question) context.question = parts.question;
  if (allowed.has("learner") && parts.learner) context.learner = parts.learner;
  if (allowed.has("exam") && parts.exam) context.exam = parts.exam;
  if (allowed.has("topic") && parts.topic) context.topic = parts.topic;
  if (allowed.has("session") && parts.session) context.session = parts.session;
  if (allowed.has("learnerProfile") && parts.learnerProfile) context.learnerProfile = parts.learnerProfile;

  return context;
}

/** Which of the task's required context kinds are missing. Empty means the task can proceed. */
export function contextGaps(task: AiTaskDefinition, context: AiContext): AiContextKind[] {
  return task.requiredContext.filter((kind) => context[kind] === undefined);
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
