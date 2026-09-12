/**
 * The typed, minimal context an AI task is given. See `AI_ARCHITECTURE.md` §8.
 *
 * Two rules shape every type here, and both are load-bearing rather than stylistic.
 *
 * **1. The model is never asked for the answer.** `QuestionContext.correctAnswer` is supplied as
 * *given* — it is verified data the app already holds and already renders. A model that cannot
 * choose the answer cannot choose it wrongly, which converts the scariest failure mode in exam
 * prep into a mechanical equality check (`schema/validate.ts`). Everything the model produces is
 * reasoning *about* a known-correct answer.
 *
 * **2. Learner context is aggregates, never history.** `GET /api/progress` returns a student's
 * entire practice and mock history unpaginated — roughly 14,000 result rows for the demo account
 * (`api/USER-PROGRESS.md:153` says so outright). That is unusable as context and unnecessary as
 * context: `topicHealth` has already reduced it to a state, a score, a trend and an evidence
 * level, which is what a model can actually reason over. So `LearnerContext` is a projection of
 * something already computed, never a fresh read of raw attempts.
 *
 * Note what `LearnerContext` deliberately has no room for: user id, email, name, device id, or
 * any per-question history. This is §30's context-minimisation policy expressed as a type, so
 * that sending too much is a compile error rather than a code-review catch.
 */

import type {
  RadarReasonCode,
  RadarTopic,
  TopicHealthStateName,
} from "../../intelligence/types";
import type { AiLanguageCode } from "../tasks";

/** The kinds a task can declare in `requiredContext`. An allowlist, not a hint. */
export type AiContextKind = "question" | "learner" | "exam" | "topic";

/**
 * One question, in one language, with its verified answer.
 *
 * `authoredExplanation` is the existing `question_translations.explanation` column — present on
 * essentially every row, though for the bulk of the current bank it is a generator one-liner
 * (`scripts/generate-load-test-questions.js:500`). It is passed in both as grounding and as the
 * thing a generated explanation is meant to improve on.
 */
export type QuestionContext = {
  questionId: string;
  questionType: string;
  languageCode: AiLanguageCode;
  questionText: string;
  options: readonly string[];
  /** Verified, from `questions.correct_answer` / `answer_key`. Given to the model, never asked of it. */
  correctAnswer: string;
  authoredExplanation: string | null;
  subjectName: string;
  topicName: string;
  parentTopicName: string | null;
  difficultyCode: string;
  isPyq: boolean;
  pyqYear: number | null;
};

/**
 * How this student is doing on the topic in question — and nothing else about them.
 *
 * Every field is an aggregate that `topicHealth` already produced. `reasonCodes` is capped when
 * built (see `build.ts`): the top few carry the diagnosis, and the tail adds tokens without
 * adding meaning.
 */
export type LearnerContext = {
  targetExamCode: string;
  topicState: TopicHealthStateName;
  /** 0-100, already whole. Null when the topic has never been scored. */
  healthScore: number | null;
  recentAccuracyPercent: number | null;
  /** How much evidence stands behind the above — a model should hedge harder on thin evidence. */
  evidenceLevel: RadarTopic["evidenceLevel"];
  attemptedCount: number;
  reasonCodes: readonly RadarReasonCode[];
  preferredLanguage: AiLanguageCode;
};

export type ExamContext = {
  examCode: string;
  examName: string;
  /** Epic L's computed per-exam topic priority, when the topic has been scored. */
  topicPriority: number | null;
  /** The admin-curated syllabus weightage, when one is authored. */
  weightagePercent: number | null;
};

export type TopicContext = {
  topicId: string;
  topicName: string;
  subjectName: string;
  parentTopicName: string | null;
};

/**
 * Assembled context. Every part is optional at the type level because which parts are required
 * is a per-task decision the registry owns — `contextGaps()` is what turns that into an error.
 */
export type AiContext = {
  question?: QuestionContext;
  learner?: LearnerContext;
  exam?: ExamContext;
  topic?: TopicContext;
};
