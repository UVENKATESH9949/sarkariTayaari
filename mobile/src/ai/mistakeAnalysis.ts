import {
  isAiLanguage,
  mistakeAnalysisTemplate,
  routeAiTask,
  type MistakeAttempt,
  type MistakeAnalysis,
  type QuestionContext,
} from "@sarkaritaiyaari/core/ai";
import { postMistakeAnalysis } from "@sarkaritaiyaari/core/api";
import { loadSession } from "../db/authSession";
import { getLocalAiTaskFlags } from "../db/clientConfigLocal";

/**
 * TASK-2701 Phase 7.4 — `MISTAKE_ANALYSIS` for one question the student got wrong, shown in
 * Revise → Wrong Answers. The third Phase 7 surface, and the first that is **never** generated
 * automatically: the Wrong Answers list can hold hundreds of entries, so generating as cards
 * scrolled into view would spend a model call per row. A student taps for it, one question at a
 * time.
 *
 * Kept separate from `ai/sessionFeedback.ts` and `ai/profileSummary.ts` for the same reason those
 * two are separate from each other — the context has no overlap with either, so there is no shared
 * shape worth generalising over.
 *
 * ## The cache is in memory, deliberately
 * A finished wrong answer is immutable history, so a result never needs regenerating within a
 * session — which is the waste that actually happens here (expand a card, collapse it, expand it
 * again). That is exactly what a module-level map fixes, with no schema change and none of the
 * risk a mobile migration carries (a failed one hard-gates app startup). The honest limitation:
 * it does not survive an app restart, so a student who reopens the app and taps the same question
 * again spends one more call. Accepted for v1 — this is a tap-driven, low-volume surface, unlike
 * `PROFILE_SUMMARY`, which regenerated on every screen open and genuinely needed a durable cache.
 */
const cache = new Map<string, MistakeAnalysis>();

/** Exposed for tests and for a future "regenerate" affordance; not called by the Revise screen. */
export function clearMistakeAnalysisCache(): void {
  cache.clear();
}

export type MistakeAnalysisInput = {
  questionId: string;
  questionText: string;
  options: string[];
  /** Resolved to text by the caller — an index means nothing to a model. */
  correctAnswerText: string;
  selectedAnswerText: string | null;
  subjectName: string;
  topicName: string;
  timesAnsweredWrong: number | null;
  languageCode: string;
};

export async function getOrBuildMistakeAnalysis(
  input: MistakeAnalysisInput,
): Promise<MistakeAnalysis | null> {
  const cached = cache.get(input.questionId);
  if (cached) return cached;

  const flags = await getLocalAiTaskFlags();
  if (flags.MISTAKE_ANALYSIS !== true) return null;

  const preferredLanguage = isAiLanguage(input.languageCode) ? input.languageCode : "en";

  // Only the fields this task's prompt actually reads are real; the rest of QuestionContext
  // describes provenance/difficulty that a stored practice result does not carry. They are not
  // guessed at — difficulty and PYQ status are simply absent from a wrong-answer row, and the
  // prompt never mentions them.
  const question: QuestionContext = {
    questionId: input.questionId,
    questionType: "SINGLE_CHOICE",
    languageCode: preferredLanguage,
    questionText: input.questionText,
    options: input.options,
    correctAnswer: input.correctAnswerText,
    authoredExplanation: null,
    subjectName: input.subjectName,
    topicName: input.topicName,
    parentTopicName: null,
    difficultyCode: "MEDIUM",
    isPyq: false,
    pyqYear: null,
  };

  const attempt: MistakeAttempt = {
    selectedAnswerText: input.selectedAnswerText,
    timesAnsweredWrong: input.timesAnsweredWrong,
  };

  const token = (await loadSession())?.token ?? null;

  const result = await routeAiTask<MistakeAnalysis>(
    {
      taskId: "MISTAKE_ANALYSIS",
      languageCode: preferredLanguage,
      context: { question },
      capabilities: {
        // Same reasoning as the other two Phase 7 surfaces: no local model exists, and `online`
        // is optimistic rather than pre-checked — an offline device fails the fetch, which the
        // router already records as an ERROR attempt and falls through from.
        deviceTier: "MID",
        online: true,
        localModelReady: false,
        cloudEnabled: true,
      },
      flags,
    },
    token
      ? {
          cloud: async () => {
            // `learner` is null: the Revise screen holds no topic-health snapshot, and computing
            // one here would mean running the radar for a card the student merely expanded. The
            // learner fact that matters most for this task — how often they have missed this same
            // question — is carried separately in `attempt` and is what makes REPEATED_MISTAKE
            // honest. The backend is tested against exactly this null-learner shape.
            const analysis = await postMistakeAnalysis(
              input.questionId,
              question,
              null,
              attempt,
              token,
            );
            return analysis
              ? { status: "SERVED" as const, value: analysis }
              : { status: "UNAVAILABLE" as const, detail: "backend declined to generate" };
          },
        }
      : {},
  );

  const analysis =
    result.status === "SERVED"
      ? result.value
      : mistakeAnalysisTemplate(question, null, attempt);

  cache.set(input.questionId, analysis);
  return analysis;
}
