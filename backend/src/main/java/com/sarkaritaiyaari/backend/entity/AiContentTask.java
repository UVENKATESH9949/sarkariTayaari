package com.sarkaritaiyaari.backend.entity;

/**
 * TASK-2701 Phase 2. Mirrors the task ids the shared registry declares in
 * {@code packages/core/src/ai/tasks.ts}, restricted to the tasks this generation pipeline
 * actually produces content for — the tasks served by the DETERMINISTIC tier (weakness,
 * study plan, topic analysis) have no row here, because there is nothing to generate.
 *
 * Only two are wired up in this phase: {@link #QUESTION_EXPLANATION} (question-scoped) and
 * {@link #CONCEPT_EXPLANATION} (topic-scoped) — see {@code ai_content}'s CHECK constraint,
 * which enforces exactly one of {@code question_id}/{@code topic_id} per row and therefore
 * needs each task classified as one or the other. {@code QUESTION_HINT} is deliberately not
 * generated yet: it shares the question-explanation prompt's grounding requirement but its
 * own prompt is unbuilt, and shipping it without review would be the exact "invented facts"
 * risk this pipeline exists to avoid.
 */
public enum AiContentTask {
    QUESTION_EXPLANATION(AiContentSubject.QUESTION),
    CONCEPT_EXPLANATION(AiContentSubject.TOPIC);

    private final AiContentSubject subject;

    AiContentTask(AiContentSubject subject) {
        this.subject = subject;
    }

    public AiContentSubject subject() {
        return subject;
    }

    public enum AiContentSubject {
        QUESTION,
        TOPIC
    }
}
