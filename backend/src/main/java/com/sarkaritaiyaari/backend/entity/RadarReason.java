package com.sarkaritaiyaari.backend.entity;

/**
 * Why a topic is in the state the radar put it in (Weakness Radar v1, §16/§17).
 *
 * <p>Codes rather than sentences, for two reasons. The mobile app renders its own localised
 * copy from these — this project's i18n types Telugu as English's shape, so a server-authored
 * English sentence would either be untranslatable or would silently become the only language.
 * And a code is testable: §23's cases can assert that a PYQ gap was the stated reason, which a
 * free-text string makes awkward.
 *
 * <p>The tone rule from §17 lives in the copy these map to, not here: "Ratio needs more
 * attention right now", never "you are bad at Ratio".
 */
public enum RadarReason {

    /** Too few answered questions to say anything. Not a judgement about the student. */
    NOT_ENOUGH_PRACTICE,

    /** Recent performance is materially below what this student used to manage here. */
    RECENT_DECLINE,

    /** Accuracy is below target on evidence strong enough to believe. */
    LOW_ACCURACY,

    /**
     * Ordinary practice questions go fine but real previous-year questions do not — the
     * §8 signal that a student has the technique but not the exam's actual pattern.
     */
    PYQ_GAP,

    /** Results swing session to session, so the average hides more than it shows (§10). */
    HIGH_VARIANCE,

    /** Recent performance is clearly better than historical (§6). */
    IMPROVING_FAST,

    /** Good performance, steady, on reliable evidence. */
    STRONG_AND_STABLE,

    /** A topic this one builds on is not solid yet — reuses the existing topic_prerequisites DAG. */
    PREREQUISITE_GAP,

    /** This topic carries a lot of the exam, so fixing it is worth more (§13). */
    HIGH_EXAM_WEIGHT,

    /**
     * The question bank has nothing practicable for this topic and exam, so the plan cannot
     * include practice however weak the topic is — the same guard PreparePlanService applies.
     */
    NO_QUESTIONS_AVAILABLE,

    /** The most recent evidence is old enough that it describes the past, not the present (§21). */
    STALE_PRACTICE
}
