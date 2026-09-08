package com.sarkaritaiyaari.backend.evaluation;

import java.util.List;
import java.util.Map;

/**
 * The SEQUENCE evaluator family's sole member (TASK-2301 Phase P2 Wave B), for ORDERING.
 * {@code answerKey} is {@code {"correctOrder": string[]}}; {@code response} is
 * {@code {"order": string[] | null}}. Exact sequence match — swapping two adjacent items
 * scores 0, the same all-or-nothing rule every other evaluator in this codebase uses.
 * {@code List.equals()} already compares both length and per-position equality, so no
 * hand-rolled loop is needed.
 */
public final class SequenceEvaluator implements QuestionEvaluator {

    @Override
    public EvaluationResult evaluate(Map<String, Object> answerKey, Map<String, Object> answerConfig, Map<String, Object> response) {
        Object orderRaw = response == null ? null : response.get("order");
        if (!(orderRaw instanceof List<?> order) || order.isEmpty()) {
            return new EvaluationResult(EvaluationOutcome.UNATTEMPTED, 0.0);
        }

        Object correctRaw = answerKey == null ? null : answerKey.get("correctOrder");
        if (!(correctRaw instanceof List<?> correctOrder)) {
            return new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
        }

        boolean isCorrect = order.equals(correctOrder);
        return isCorrect
                ? new EvaluationResult(EvaluationOutcome.CORRECT, 1.0)
                : new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
    }
}
