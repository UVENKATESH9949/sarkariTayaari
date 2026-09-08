package com.sarkaritaiyaari.backend.evaluation;

/**
 * The result of scoring one student response against one question's answer key. Not yet
 * stored anywhere — {@code user_practice_session_results}/{@code user_mock_attempt_results}
 * keep their existing {@code is_correct}/derived-equality shape until a later phase actually
 * needs a non-index answer; see the P1 note in
 * {@code tasks/TASK-2301-multi-type-question-architecture.md}.
 */
public enum EvaluationOutcome {
    CORRECT,
    INCORRECT,
    PARTIAL,
    UNATTEMPTED,
    PENDING_REVIEW
}
