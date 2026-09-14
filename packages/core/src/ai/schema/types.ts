/**
 * Structured AI output shapes (`AI_ARCHITECTURE.md` §8, the brief's §22).
 *
 * Every task returns a typed object, never free prose. Three things fall out of that: the app
 * can render each part in its own place rather than dumping a paragraph on screen, a malformed
 * response is detectable instead of merely ugly, and the grounding check in `validate.ts` has a
 * specific field to check rather than having to read English.
 *
 * `taskId` is carried inside the payload on purpose. Cached rows, local-model output and cloud
 * output all converge here, and a response that has drifted from the task it was stored under
 * should be rejected rather than rendered under the wrong heading.
 */

import type { AiTaskId } from "../tasks";

/** One distractor and why it fails — the part students say they actually want. */
export type WrongOptionNote = {
  /** The option as it appears in the question, so the UI can line it up without guessing. */
  option: string;
  why: string;
};

export type QuestionExplanation = {
  taskId: "QUESTION_EXPLANATION";
  /**
   * Echoed back from the verified answer it was given. It exists so the validator can prove the
   * model explained the right answer; it is not how the app learns what the answer is.
   */
  answer: string;
  whyCorrect: string;
  whyOthersWrong: WrongOptionNote[];
  concept: string | null;
  examTip: string | null;
};

export type QuestionHint = {
  taskId: "QUESTION_HINT";
  /** A nudge toward the method. Must not name the answer — checked in `validate.ts`. */
  hint: string;
};

export type ConceptExplanation = {
  taskId: "CONCEPT_EXPLANATION";
  concept: string;
  explanation: string;
  examTip: string | null;
};

/**
 * The brief's §10 taxonomy. Deliberately a closed set: an open-ended "mistake type" string would
 * be unusable for the aggregate reporting this is ultimately for, and a model will happily
 * invent a new category every time if allowed to.
 */
export type MistakeType =
  | "KNOWLEDGE_GAP"
  | "CONCEPT_CONFUSION"
  | "CALCULATION_ERROR"
  | "MISREADING"
  | "GUESSING"
  | "TIME_PRESSURE"
  | "SIMILAR_OPTION_CONFUSION"
  | "MEMORY_FAILURE"
  | "REPEATED_MISTAKE";

export const MISTAKE_TYPES: readonly MistakeType[] = [
  "KNOWLEDGE_GAP",
  "CONCEPT_CONFUSION",
  "CALCULATION_ERROR",
  "MISREADING",
  "GUESSING",
  "TIME_PRESSURE",
  "SIMILAR_OPTION_CONFUSION",
  "MEMORY_FAILURE",
  "REPEATED_MISTAKE",
] as const;

export type MistakeAnalysis = {
  taskId: "MISTAKE_ANALYSIS";
  mistakeType: MistakeType;
  explanation: string;
  suggestedAction: string;
};

export type PersonalizedExplanation = {
  taskId: "PERSONALIZED_EXPLANATION";
  answer: string;
  explanation: string;
  /** Why this student in particular is being told it this way. Keeps the personalisation honest. */
  pitchedFor: string;
};

export type QuestionClassification = {
  taskId: "QUESTION_CLASSIFICATION";
  suggestedTopicName: string;
  suggestedDifficultyCode: string;
  /** 0-1. Admin-side only; a low value routes the row to human review rather than auto-apply. */
  confidence: number;
};

/**
 * Phase 7. Deliberately narrative-only — every number, topic name or trend the student sees
 * comes straight off the `SessionContext`/`LearnerProfileContext` already in hand; the model's
 * entire job is prose over facts it did not compute. That is what makes grounding tractable the
 * same way it is for `QUESTION_EXPLANATION`'s `answer` field: `validate.ts`'s `groundedNarrative`
 * checks every number/topic name the narrative mentions is traceable back to the context it was
 * given, and rejects anything that is not.
 */
export type SessionFeedback = {
  taskId: "SESSION_FEEDBACK";
  narrative: string;
};

export type ProfileSummary = {
  taskId: "PROFILE_SUMMARY";
  narrative: string;
};

/** Every shape a `GENERATED` or `CACHED` tier can produce. */
export type AiTaskResponse =
  | QuestionExplanation
  | QuestionHint
  | ConceptExplanation
  | MistakeAnalysis
  | PersonalizedExplanation
  | QuestionClassification
  | SessionFeedback
  | ProfileSummary;

/**
 * The tasks that actually return a model-shaped payload. The rest
 * (`PERSONALIZED_RECOMMENDATION`, `STUDY_PLAN`, `TOPIC_ANALYSIS`) are served deterministically
 * and return their own existing domain types — `WeaknessRadar`, the prepare-plan checklist —
 * which are not this module's to redefine.
 */
export type GenerativeTaskId = AiTaskResponse["taskId"];

export type ResponseForTask<T extends GenerativeTaskId> = Extract<AiTaskResponse, { taskId: T }>;

export function isGenerativeTaskId(id: AiTaskId): id is GenerativeTaskId {
  return (
    id === "QUESTION_EXPLANATION" ||
    id === "QUESTION_HINT" ||
    id === "CONCEPT_EXPLANATION" ||
    id === "MISTAKE_ANALYSIS" ||
    id === "PERSONALIZED_EXPLANATION" ||
    id === "QUESTION_CLASSIFICATION" ||
    id === "SESSION_FEEDBACK" ||
    id === "PROFILE_SUMMARY"
  );
}
