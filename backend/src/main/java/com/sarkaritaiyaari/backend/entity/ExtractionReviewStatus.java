package com.sarkaritaiyaari.backend.entity;

/** TASK-2401 Document 9/11 -- an extraction candidate's own review lifecycle. Not to be
 * confused with {@link ContentStatus} (DRAFT/REVIEW/PUBLISHED), which governs the
 * *published* Exam Guide row a candidate eventually becomes -- this is about the
 * candidate itself, before it becomes a real row at all. */
public enum ExtractionReviewStatus {
    PENDING,
    ACCEPTED,
    EDITED,
    REJECTED,
}
