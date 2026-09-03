package com.sarkaritaiyaari.backend.entity;

/**
 * The lifecycle from the Exam Guide spec's §6. Stored as a string (see the migration
 * comment on {@code recruitment_cycles.status}), matching {@link TopicProgressState} and
 * every other lifecycle field in this codebase.
 *
 * <p>Deliberately linear rather than a general state graph — every real recruitment
 * cycle this app tracks moves forward through these in order, and a cycle that needs to
 * go back a step (a cancelled admit card, say) is an admin correction, not a transition
 * this enum needs to model.
 */
public enum RecruitmentCycleStatus {
    NOT_ANNOUNCED,
    NOTIFICATION_EXPECTED,
    NOTIFICATION_RELEASED,
    APPLICATION_OPEN,
    APPLICATION_CLOSING_SOON,
    APPLICATION_CLOSED,
    CORRECTION_WINDOW_OPEN,
    ADMIT_CARD_RELEASED,
    EXAM_UPCOMING,
    EXAM_ONGOING,
    ANSWER_KEY_RELEASED,
    RESULT_RELEASED,
    CUTOFF_RELEASED,
    FINAL_RESULT,
    RECRUITMENT_COMPLETED,
}
