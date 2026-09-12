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

import type { RadarTopic } from "../../intelligence/types";
import type { AiLanguageCode, AiTaskDefinition } from "../tasks";
import type {
  AiContext,
  AiContextKind,
  ExamContext,
  LearnerContext,
  QuestionContext,
  TopicContext,
} from "./types";

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
