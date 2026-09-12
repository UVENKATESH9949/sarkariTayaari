export {
  AI_LANGUAGES,
  AI_TASKS,
  AI_TASK_IDS,
  DEVICE_TIER_ORDER,
  TIER_ORDER,
  aiTask,
  isAiLanguage,
  isAiTaskId,
  meetsDeviceTier,
  registryViolations,
} from "./tasks";
export type {
  AiLanguageCode,
  AiTaskDefinition,
  AiTaskId,
  AiTier,
  DeviceTier,
} from "./tasks";

export {
  MAX_REASON_CODES,
  assembleContext,
  buildExamContext,
  buildLearnerContext,
  buildQuestionContext,
  buildTopicContext,
  contextGaps,
} from "./context/build";
export type { QuestionContextInput } from "./context/build";
export type {
  AiContext,
  AiContextKind,
  ExamContext,
  LearnerContext,
  QuestionContext,
  TopicContext,
} from "./context/types";

export { MISTAKE_TYPES, isGenerativeTaskId } from "./schema/types";
export type {
  AiTaskResponse,
  ConceptExplanation,
  GenerativeTaskId,
  MistakeAnalysis,
  MistakeType,
  PersonalizedExplanation,
  QuestionClassification,
  QuestionExplanation,
  QuestionHint,
  ResponseForTask,
  WrongOptionNote,
} from "./schema/types";

export { answerMatches, hintRevealsAnswer, parseAiJson, validateAiResponse } from "./schema/validate";
export type { Grounding, ValidationFailureCode, ValidationResult } from "./schema/validate";

export { canAttemptTask, isAiLanguageSupportedForTask, routeAiTask } from "./router";
export type {
  AiAttemptStatus,
  AiCapabilities,
  AiRouteAttempt,
  AiRouteRequest,
  AiRouteResult,
  AiTaskFlags,
  AiTierHandlers,
  AiUnavailableReason,
  TierHandler,
  TierOutcome,
} from "./router";
