package com.sarkaritaiyaari.backend.evaluation;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The OPTION_SET family's set-equality member (TASK-2301, Phase P2 Wave A).
 * {@code answerKey} is {@code {"correctOptions": [0, 2]}}; {@code response} is
 * {@code {"selectedOptions": [...] | null}} — null means unattempted, an empty (but
 * present) list means "submitted with nothing ticked", which is a real, scoreable answer,
 * not a skip.
 *
 * All-or-nothing, not partial credit — the architecture proposal's open question 2 (partial
 * credit for multi-select) resolved this way because that is how the real exams this app
 * targets score it: a partially-correct selection earns nothing. {@code answerConfig} exists
 * for a future per-question override; unused today.
 */
public final class MultipleChoiceEvaluator implements QuestionEvaluator {

    @Override
    public EvaluationResult evaluate(Map<String, Object> answerKey, Map<String, Object> answerConfig, Map<String, Object> response) {
        Object selectedRaw = response == null ? null : response.get("selectedOptions");
        if (selectedRaw == null) {
            return new EvaluationResult(EvaluationOutcome.UNATTEMPTED, 0.0);
        }

        Set<Integer> selected = toIntSet(selectedRaw);
        Set<Integer> correct = toIntSet(answerKey == null ? null : answerKey.get("correctOptions"));
        boolean isCorrect = selected.equals(correct);

        return isCorrect
                ? new EvaluationResult(EvaluationOutcome.CORRECT, 1.0)
                : new EvaluationResult(EvaluationOutcome.INCORRECT, 0.0);
    }

    private static Set<Integer> toIntSet(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return Set.of();
        }
        Set<Integer> result = new HashSet<>();
        for (Object element : list) {
            if (element instanceof Number number) {
                result.add(number.intValue());
            }
        }
        return result;
    }
}
