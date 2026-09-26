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
  MAX_PROFILE_TOPICS,
  MAX_REASON_CODES,
  assembleContext,
  buildExamContext,
  buildLearnerContext,
  buildLearnerProfileContext,
  buildQuestionContext,
  buildSessionContext,
  buildTopicContext,
  buildTopicSnapshot,
  contextGaps,
} from "./context/build";
export type { QuestionContextInput } from "./context/build";
export type {
  AiContext,
  AiContextKind,
  ExamContext,
  LearnerContext,
  LearnerProfileContext,
  QuestionContext,
  SessionContext,
  TopicContext,
  TopicSnapshot,
} from "./context/types";

export { MISTAKE_TYPES, RECOMMENDED_RESULT_ACTIONS, isGenerativeTaskId, isRecommendedResultAction } from "./schema/types";
export type {
  AiTaskResponse,
  ConceptExplanation,
  GenerativeTaskId,
  MistakeAnalysis,
  MistakeType,
  PersonalizedExplanation,
  PracticeResultInsight,
  ProfileSummary,
  QuestionClassification,
  QuestionExplanation,
  QuestionHint,
  RecommendedResultAction,
  ResponseForTask,
  SessionFeedback,
  WrongOptionNote,
} from "./schema/types";

export {
  answerMatches,
  groundedNarrative,
  hintRevealsAnswer,
  parseAiJson,
  validateAiResponse,
} from "./schema/validate";
export type {
  Grounding,
  NarrativeGrounding,
  ValidationFailureCode,
  ValidationResult,
} from "./schema/validate";

export { sessionFeedbackTemplate } from "./feedback/sessionFeedbackTemplate";
export { profileSummaryTemplate } from "./feedback/profileSummaryTemplate";
export { mistakeAnalysisTemplate } from "./feedback/mistakeAnalysisTemplate";
export type { MistakeAttempt } from "./feedback/mistakeAnalysisTemplate";

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
