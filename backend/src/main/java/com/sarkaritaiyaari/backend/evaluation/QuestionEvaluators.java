package com.sarkaritaiyaari.backend.evaluation;

import com.sarkaritaiyaari.backend.entity.QuestionTypeCode;

import java.util.Map;

/**
 * Dispatches a question type to its evaluator. Eleven types, eight evaluator instances —
 * ASSERTION_REASON and STATEMENT_COMBINATION reuse {@link SingleChoiceEvaluator} unchanged,
 * because both are single-correct-option answers under the hood (only their authored
 * content differs) — exactly the "two of the nine 'new' types need no new evaluator" point
 * the architecture proposal made before any of this was built. NUMERIC, FILL_BLANK, MATCH
 * and ORDERING (Phase P2 Wave B) each get their own evaluator family, one apiece.
 * SHORT_ANSWER and LONG_ANSWER (Phase P4) share {@link ManualEvaluator} — both are
 * free-text answers a human, not a comparison, has to grade.
 */
public final class QuestionEvaluators {

    private static final SingleChoiceEvaluator SINGLE_CHOICE = new SingleChoiceEvaluator();
    private static final MultipleChoiceEvaluator MULTIPLE_CHOICE = new MultipleChoiceEvaluator();
    private static final TrueFalseEvaluator TRUE_FALSE = new TrueFalseEvaluator();
    private static final NumericEvaluator NUMERIC = new NumericEvaluator();
    private static final TextAnswerEvaluator FILL_BLANK = new TextAnswerEvaluator();
    private static final MappingEvaluator MATCH = new MappingEvaluator();
    private static final SequenceEvaluator ORDERING = new SequenceEvaluator();
    private static final ManualEvaluator MANUAL = new ManualEvaluator();

    private static final Map<String, QuestionEvaluator> BY_TYPE = Map.ofEntries(
            Map.entry(QuestionTypeCode.SINGLE_CHOICE.name(), SINGLE_CHOICE),
            Map.entry(QuestionTypeCode.ASSERTION_REASON.name(), SINGLE_CHOICE),
            Map.entry(QuestionTypeCode.STATEMENT_COMBINATION.name(), SINGLE_CHOICE),
            Map.entry(QuestionTypeCode.MULTIPLE_CHOICE.name(), MULTIPLE_CHOICE),
            Map.entry(QuestionTypeCode.TRUE_FALSE.name(), TRUE_FALSE),
            Map.entry(QuestionTypeCode.NUMERIC.name(), NUMERIC),
            Map.entry(QuestionTypeCode.FILL_BLANK.name(), FILL_BLANK),
            Map.entry(QuestionTypeCode.MATCH.name(), MATCH),
            Map.entry(QuestionTypeCode.ORDERING.name(), ORDERING),
            Map.entry(QuestionTypeCode.SHORT_ANSWER.name(), MANUAL),
            Map.entry(QuestionTypeCode.LONG_ANSWER.name(), MANUAL)
    );

    private QuestionEvaluators() {
    }

    public static QuestionEvaluator forType(String questionType) {
        QuestionEvaluator evaluator = BY_TYPE.get(questionType);
        if (evaluator == null) {
            throw new IllegalArgumentException("No evaluator registered for question type: " + questionType);
        }
        return evaluator;
    }
}
