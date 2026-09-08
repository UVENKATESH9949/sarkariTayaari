package com.sarkaritaiyaari.backend.evaluation;

import java.util.Map;

/**
 * The MAPPING evaluator family's sole member (TASK-2301 Phase P2 Wave B), for MATCH.
 * {@code answerKey} is {@code {"correctMapping": {leftKey: rightKey, ...}}}; {@code
 * response} is {@code {"mapping": {leftKey: rightKey, ...} | null}}. All-or-nothing, like
 * {@link MultipleChoiceEvaluator}: a partially-correct set of pairs scores 0 — a plain
 * {@code Map.equals()} already gives this for free, since it fails on a missing key, an
 * extra key, or any one wrong value.
 */
public final class MappingEvaluator implements QuestionEvaluator {

    @Override
    public EvaluationResult evaluate(Map<String, Object> answerKey, Map<String, Object> answerConfig, Map<String, Object> response) {
        Object mappingRaw = response == null ? null : response.get("mapping");
        if (!(mappingRaw instanceof Map<?, ?> mapping) || mapping.isEmpty()) {
            return new EvaluationResult(EvaluationOutcome.UNATTEMPTED, 0.0);
        }

        Object correctRaw = answerKey == null ? null : answerKey.get("correctMapping");
        if (!(correctRaw instanceof Map<?, ?> correctMapping)) {
            return new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
        }

        boolean isCorrect = mapping.equals(correctMapping);
        return isCorrect
                ? new EvaluationResult(EvaluationOutcome.CORRECT, 1.0)
                : new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
    }
}
