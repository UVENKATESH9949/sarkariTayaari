package com.sarkaritaiyaari.backend.entity;

/**
 * Exam Guide spec §36 "Content Validation States". Originally shipped as two states
 * (Draft/Published) because this project had exactly one admin role and no distinct
 * reviewer to hand a REVIEW state to. A {@link Role#REVIEWER} role now exists, so the
 * third state is real: DRAFT (being authored) -> REVIEW (submitted, awaiting approval)
 * -> PUBLISHED (live). See {@code ExamGuideAdminController}'s submit-for-review/reject/
 * publish/unpublish transitions for who can move a cycle between which states.
 */
public enum ContentStatus {
    DRAFT,
    REVIEW,
    PUBLISHED
}
