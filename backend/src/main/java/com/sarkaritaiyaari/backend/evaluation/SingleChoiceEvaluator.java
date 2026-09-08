package com.sarkaritaiyaari.backend.evaluation;

import java.util.Map;

/**
 * The OPTION_SET family's first member. Covers SINGLE_CHOICE today; MULTIPLE_CHOICE,
 * TRUE_FALSE, ASSERTION_REASON and STATEMENT_COMBINATION all resolve to a fixed option
 * index the same way once P2 enables them — see the architecture proposal's "two of the
 * nine 'new' types need no new evaluator" note.
 *
 * {@code response} is {@code {"selectedOption": <int> | null}} — the same shape
 * {@code answerKey} uses ({@code {"correctOption": <int>}}), so both sides of a comparison
 * are read the same way. A missing response object, and a present one whose
 * {@code selectedOption} is null, mean the same thing: nothing was answered.
 */
public final class SingleChoiceEvaluator implements QuestionEvaluator {

    @Override
    public EvaluationResult evaluate(Map<String, Object> answerKey, Map<String, Object> answerConfig, Map<String, Object> response) {
        Object selectedRaw = response == null ? null : response.get("selectedOption");
        if (selectedRaw == null) {
            return new EvaluationResult(EvaluationOutcome.UNATTEMPTED, 0.0);
        }

        int selected = ((Number) selectedRaw).intValue();
        Object correctRaw = answerKey == null ? null : answerKey.get("correctOption");
        boolean correct = correctRaw instanceof Number correctNumber && selected == correctNumber.intValue();

        return correct
                ? new EvaluationResult(EvaluationOutcome.CORRECT, 1.0)
                : new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
    }
}
