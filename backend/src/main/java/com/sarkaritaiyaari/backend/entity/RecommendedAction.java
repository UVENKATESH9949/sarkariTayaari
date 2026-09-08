package com.sarkaritaiyaari.backend.entity;

/**
 * What the radar tells a student to actually do about a topic (Weakness Radar v1, §14).
 *
 * <p>§14 is explicit that the recommended action, not the score, is this feature's most
 * important output — a student cannot act on "health 63". These values are chosen by a
 * deterministic rule table in {@code WeaknessRadarService.recommend}; §14 also forbids using
 * an LLM to make the core diagnostic decision, and nothing here does.
 *
 * <p>Not persisted: it is derived on every read from the stored health row, so it stays
 * correct when the rule table changes without needing a migration or a recompute.
 */
public enum RecommendedAction {

    /** The gap is conceptual, not practice volume. Reading first, questions second. */
    LEARN_CONCEPT,

    /** Rebuild from easy questions before attempting the real difficulty. */
    PRACTICE_FOUNDATIONAL,

    PRACTICE_MEDIUM,

    PRACTICE_ADVANCED,

    /** Real previous-year questions specifically — the exam-pattern gap (§8). */
    PRACTICE_PYQ,

    /** A timed set. Recommended on its own merits, not as a measurement (v1 measures no speed). */
    TIMED_PRACTICE,

    /** For a topic that was genuinely strong and has slipped. */
    REVISION,

    /** Keeping a strong topic strong — light, and never framed as a problem. */
    MAINTENANCE_PRACTICE,

    /**
     * There is not enough evidence to diagnose anything yet, so the recommendation is to
     * generate some. §21: a topic that has never been practised is not weak.
     */
    GATHER_EVIDENCE
}
