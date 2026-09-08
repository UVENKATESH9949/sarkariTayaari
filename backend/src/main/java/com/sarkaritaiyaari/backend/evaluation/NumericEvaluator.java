package com.sarkaritaiyaari.backend.evaluation;

import java.util.Map;

/**
 * The NUMERIC evaluator family's sole member (TASK-2301 Phase P2 Wave B). {@code answerKey}
 * is {@code {"correctValue": number, "tolerance": number}} — {@code tolerance} is always
 * present (defaults to 0 at write time in {@code QuestionService.resolveAnswer}, never
 * guessed here); {@code response} is {@code {"enteredValue": number | null}}.
 */
public final class NumericEvaluator implements QuestionEvaluator {

    @Override
    public EvaluationResult evaluate(Map<String, Object> answerKey, Map<String, Object> answerConfig, Map<String, Object> response) {
        Object enteredRaw = response == null ? null : response.get("enteredValue");
        if (!(enteredRaw instanceof Number entered)) {
            return new EvaluationResult(EvaluationOutcome.UNATTEMPTED, 0.0);
        }

        Object correctRaw = answerKey == null ? null : answerKey.get("correctValue");
        if (!(correctRaw instanceof Number correct)) {
            return new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
        }
        Object toleranceRaw = answerKey.get("tolerance");
        double tolerance = toleranceRaw instanceof Number n ? n.doubleValue() : 0.0;

        boolean isCorrect = Math.abs(entered.doubleValue() - correct.doubleValue()) <= tolerance;
        return isCorrect
                ? new EvaluationResult(EvaluationOutcome.CORRECT, 1.0)
                : new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
    }
}
