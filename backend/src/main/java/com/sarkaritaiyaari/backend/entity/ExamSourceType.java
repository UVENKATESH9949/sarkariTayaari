package com.sarkaritaiyaari.backend.entity;

/** From the Exam Guide spec's §32. {@link #ADMIN_ESTIMATE} is not in the spec's own list —
 * it is what lets seeded/editorial content (including demo cycles) cite a source honestly
 * instead of being forced to claim an official notification that doesn't exist. */
public enum ExamSourceType {
    OFFICIAL_NOTIFICATION,
    OFFICIAL_WEBSITE,
    OFFICIAL_CALENDAR,
    OFFICIAL_NOTICE,
    OFFICIAL_ADMIT_CARD_NOTICE,
    OFFICIAL_RESULT_NOTICE,
    ADMIN_ESTIMATE,
}
