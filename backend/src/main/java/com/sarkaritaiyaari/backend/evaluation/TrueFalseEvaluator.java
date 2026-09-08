package com.sarkaritaiyaari.backend.evaluation;

import java.util.Map;

/**
 * The OPTION_SET family's boolean member (TASK-2301, Phase P2 Wave A). {@code answerKey} is
 * {@code {"correctBoolean": true}}; {@code response} is
 * {@code {"selectedBoolean": true | false | null}} — null (or a missing response object)
 * means unattempted, matching every other evaluator's convention.
 */
public final class TrueFalseEvaluator implements QuestionEvaluator {

    @Override
    public EvaluationResult evaluate(Map<String, Object> answerKey, Map<String, Object> answerConfig, Map<String, Object> response) {
        Object selectedRaw = response == null ? null : response.get("selectedBoolean");
        if (selectedRaw == null) {
            return new EvaluationResult(EvaluationOutcome.UNATTEMPTED, 0.0);
        }

        boolean selected = (Boolean) selectedRaw;
        Object correctRaw = answerKey == null ? null : answerKey.get("correctBoolean");
        boolean isCorrect = correctRaw instanceof Boolean correctBoolean && selected == correctBoolean;

        return isCorrect
                ? new EvaluationResult(EvaluationOutcome.CORRECT, 1.0)
                : new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
    }
}
