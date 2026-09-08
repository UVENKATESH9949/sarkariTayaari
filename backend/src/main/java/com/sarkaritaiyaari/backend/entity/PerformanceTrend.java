package com.sarkaritaiyaari.backend.entity;

/**
 * Which way a student's performance in a topic is moving (Weakness Radar v1, §6).
 *
 * <p>Distinct from the {@code trend_direction} stored on {@code topic_trend} (Epic L / V15),
 * which is about the <em>exam</em> — whether a topic is appearing more often in previous-year
 * papers. That one is the same for every student; this one is personal. Two different
 * questions, deliberately two different vocabularies, so a reader of either column can tell
 * which they are looking at.
 */
public enum PerformanceTrend {

    IMPROVING,
    STABLE,
    DECLINING,

    /**
     * Not enough evidence in both the recent and historical windows to compare them. A real
     * verdict, not an error — reporting STABLE here would be a fabrication, which is the same
     * rule Epic L's INSUFFICIENT_DATA already follows.
     */
    NOT_ENOUGH_DATA
}
