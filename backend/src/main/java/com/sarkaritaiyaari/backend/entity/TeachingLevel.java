package com.sarkaritaiyaari.backend.entity;

/**
 * How deeply a lesson teaches, for the same owner and language.
 *
 * <p>This is the axis {@code ai_content} cannot express: it is unique per
 * (task, subject, language), so "English, beginner" and "English, advanced" could never both be
 * live. A teaching lesson genuinely wants both, so the level is part of the uniqueness key on
 * {@code lesson_blueprints} and {@code lesson_videos}.
 *
 * <p>STANDARD is the default and the only one anything produces today.
 */
public enum TeachingLevel {
    BEGINNER,
    STANDARD,
    ADVANCED
}
