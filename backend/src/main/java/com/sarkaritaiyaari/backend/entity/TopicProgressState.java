package com.sarkaritaiyaari.backend.entity;

/**
 * The per-topic mastery state machine from the supplied spec's §31 (Epic L / TICKET-2105).
 *
 * <p>Stored as a string, not an ordinal — an ordinal makes inserting a state in the middle
 * later silently rewrite the meaning of every existing row, and this table is synced to
 * devices that may be several releases behind.
 *
 * <p>{@link #NOT_STARTED} is a real stored value rather than "no row": the Preparation Plan
 * has to distinguish "the student has this topic in scope and has not begun" from "this
 * topic is not part of their syllabus at all".
 *
 * <p>{@link #NEEDS_REVISION} is reachable <em>only</em> from {@link #MASTERED}, which is why
 * it is not simply another rung on the ladder — it records a regression, and treating it as
 * a peer of LEARNING would lose the fact that the topic was once mastered.
 */
public enum TopicProgressState {

    NOT_STARTED,
    LEARNING,
    PRACTICING,
    MASTERED,
    NEEDS_REVISION;

    /**
     * Whether {@code to} is a legal move from this state.
     *
     * <p>Deliberately permissive in the forward direction and restrictive only where the
     * distinction carries meaning. The device observes practice results and derives the
     * state locally, so the server's job is to reject the transitions that would corrupt
     * the signal, not to re-derive it:
     *
     * <ul>
     *   <li>NEEDS_REVISION is only reachable from MASTERED — arriving there from LEARNING
     *       would assert a regression that never happened.</li>
     *   <li>Nothing may go back to NOT_STARTED. A stale device replaying an old snapshot is
     *       the realistic cause, and last-write-wins on updated_at cannot catch it when the
     *       device's clock is also stale. Practice history is not erasable by a sync.</li>
     * </ul>
     */
    public boolean canTransitionTo(TopicProgressState to) {
        if (to == this) return true;
        if (to == NOT_STARTED) return false;
        if (to == NEEDS_REVISION) return this == MASTERED;
        return true;
    }
}
