package com.sarkaritaiyaari.backend.entity;

/**
 * TASK-2701 Phase 4. Mirrors {@code AI_TASK_IDS} in {@code packages/core/src/ai/tasks.ts} --
 * every AI capability the shared registry declares, not only the two
 * ({@link AiContentTask#QUESTION_EXPLANATION}/{@code CONCEPT_EXPLANATION}) that have a real
 * generation pipeline today. Flags for the others exist so an admin can dark-launch a task the
 * moment its implementation lands, without a schema change -- the same reasoning
 * {@code question_types}/{@link QuestionTypeCode} already established: the database row can be
 * toggled the instant a task id is added here, and a task with no member here simply can't be
 * flagged at all, which is the intended failure mode for a typo rather than a silent no-op.
 */
public enum AiTaskId {
    QUESTION_EXPLANATION,
    QUESTION_HINT,
    CONCEPT_EXPLANATION,
    MISTAKE_ANALYSIS,
    PERSONALIZED_RECOMMENDATION,
    STUDY_PLAN,
    TOPIC_ANALYSIS,
    PERSONALIZED_EXPLANATION,
    QUESTION_CLASSIFICATION,
    /** Phase 7 -- one short narrative over a just-finished Practice/Mock session's facts. */
    SESSION_FEEDBACK,
    /** Phase 7 -- the narrative behind the Profile screen's strengths/weaknesses. */
    PROFILE_SUMMARY
}
