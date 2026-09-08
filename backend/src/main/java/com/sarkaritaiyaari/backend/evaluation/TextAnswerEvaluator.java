package com.sarkaritaiyaari.backend.evaluation;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The TEXT evaluator family's sole member (TASK-2301 Phase P2 Wave B), for FILL_BLANK.
 * {@code answerKey} is {@code {"acceptedAnswers": string[]}}; {@code response} is
 * {@code {"enteredText": string | null}}. Comparison is case-insensitive and
 * whitespace-trimmed — a real short-answer field, not an exact-bytes match — matching
 * {@code QuestionService.resolveAnswer}'s own trimming of each accepted answer at write
 * time.
 */
public final class TextAnswerEvaluator implements QuestionEvaluator {

    @Override
    public EvaluationResult evaluate(Map<String, Object> answerKey, Map<String, Object> answerConfig, Map<String, Object> response) {
        Object enteredRaw = response == null ? null : response.get("enteredText");
        if (!(enteredRaw instanceof String entered) || entered.trim().isEmpty()) {
            return new EvaluationResult(EvaluationOutcome.UNATTEMPTED, 0.0);
        }

        Object acceptedRaw = answerKey == null ? null : answerKey.get("acceptedAnswers");
        if (!(acceptedRaw instanceof List<?> accepted)) {
            return new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
        }
        String normalizedEntered = entered.trim().toLowerCase(Locale.ROOT);
        boolean isCorrect = accepted.stream()
                .filter(a -> a instanceof String)
                .map(a -> ((String) a).trim().toLowerCase(Locale.ROOT))
                .anyMatch(normalizedEntered::equals);

        return isCorrect
                ? new EvaluationResult(EvaluationOutcome.CORRECT, 1.0)
                : new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
    }
}
