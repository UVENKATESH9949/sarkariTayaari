package com.sarkaritaiyaari.backend.evaluation;

import java.util.Map;

/**
 * One implementation per evaluator family (OPTION_SET, NUMERIC, TEXT, MAPPING, SEQUENCE,
 * MANUAL — see {@code question_types.evaluator_family}, V25), not one per question type:
 * nineteen question types collapse to six evaluators. {@code answerConfig} and
 * {@code response} are both the same loosely-typed shape as {@code answerKey} — a small
 * per-type JSON object — so a new family needs a new implementation of this interface, not
 * a change to it.
 */
public interface QuestionEvaluator {

    EvaluationResult evaluate(Map<String, Object> answerKey, Map<String, Object> answerConfig, Map<String, Object> response);
}
