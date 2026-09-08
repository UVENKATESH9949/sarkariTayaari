package com.sarkaritaiyaari.backend.entity;

/**
 * Mirrors {@code question_types.code} (V25). The database table carries admin-facing
 * metadata (label, whether authoring is enabled) and can disable a type; this enum is the
 * other half of the defence — a type that exists as data but has no member here has no
 * renderer and no evaluator, so nothing type-specific can be asked to run on it. Only
 * {@link #SINGLE_CHOICE} is authorable today (Phase P1); the rest exist so P2/P3 land as
 * data changes (flip {@code is_authoring_enabled}) plus a real implementation, not another
 * migration.
 */
public enum QuestionTypeCode {
    SINGLE_CHOICE,
    MULTIPLE_CHOICE,
    TRUE_FALSE,
    ASSERTION_REASON,
    STATEMENT_COMBINATION,
    NUMERIC,
    FILL_BLANK,
    MATCH,
    ORDERING,
    SHORT_ANSWER,
    LONG_ANSWER
}
