package com.sarkaritaiyaari.backend.dto;

import java.util.List;

/**
 * TASK-2701 Phase 7.4 -- {@code MISTAKE_ANALYSIS}: why <em>this</em> student got <em>this</em>
 * question wrong, classified into the shared taxonomy in
 * {@code packages/core/src/ai/schema/types.ts}.
 *
 * <p>Like {@code SessionFeedbackDtos}, the context is client-supplied rather than re-derived
 * here -- the Revise screen already holds every field below, and the same trust-boundary
 * reasoning applies (see {@code PersonalNarrativeService}'s class doc). The one field that is
 * <em>not</em> negotiable is {@link MistakeAnalysisRequest#correctAnswerText()}: the model is
 * given the verified answer and never asked to work one out, which is the rule the whole
 * {@code ai/} layer is built on.
 */
public final class MistakeAnalysisDtos {

    private MistakeAnalysisDtos() {
    }

    /**
     * @param timesAnsweredWrong how many times this question appears wrong in the student's own
     *                           retained history, <b>including the attempt being analysed</b> --
     *                           so {@code 1} means a first miss and {@code 2+} means a repeat.
     *                           This is what lets {@code REPEATED_MISTAKE} be an honest
     *                           classification rather than a guess: a model cannot know it. It is
     *                           rendered into the prompt qualitatively ("first time" vs "has
     *                           missed this before") rather than as a bare count, because a real
     *                           Groq call read the bare "1" under a "wrong before" label as
     *                           "once before" and returned {@code REPEATED_MISTAKE} for a
     *                           first-time miss.
     * @param topicState the qualitative topic-health state ({@code NEEDS_ATTENTION} etc.), never a
     *                   score. No numeric statistic about the student is sent to the model at all
     *                   -- see {@code PersonalNarrativePrompts.mistakeAnalysisUserMessage}.
     */
    public record MistakeAnalysisRequest(
            String questionText,
            List<String> options,
            String correctAnswerText,
            String selectedAnswerText,
            String subjectName,
            String topicName,
            String topicState,
            Integer timesAnsweredWrong,
            String preferredLanguage) {
    }

    /**
     * Every field is {@code null} when the task is disabled, the provider fails, or the response
     * fails validation -- the caller's contract is "show nothing extra", identical to
     * {@code SessionFeedbackResponse}. A partial result is never returned: a payload that fails
     * validation is discarded whole, never shown with one salvaged field.
     */
    public record MistakeAnalysisResponse(
            String mistakeType,
            String explanation,
            String suggestedAction) {

        public static MistakeAnalysisResponse empty() {
            return new MistakeAnalysisResponse(null, null, null);
        }
    }
}
