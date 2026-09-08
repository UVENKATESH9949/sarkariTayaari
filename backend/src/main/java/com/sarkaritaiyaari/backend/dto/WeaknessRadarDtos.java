package com.sarkaritaiyaari.backend.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Wire shapes for Weakness Radar v1 (see {@code api/WEAKNESS-RADAR.md}).
 *
 * <h2>What is deliberately absent from the student-facing shapes</h2>
 * <b>Confidence.</b> §11 is explicit that raw confidence mathematics must not reach the
 * student, and §18 that fake precision must not either. Confidence is what gates whether a
 * verdict is asserted at all (see {@code TopicHealthService.resolveState}) — so by the time a
 * topic reaches {@link RadarTopic} the number has already done its job. What the student sees
 * instead is {@code evidenceLevel}, which is a legible statement about how much they have
 * practised rather than a coefficient. The full mathematics is available on the admin
 * endpoint, which is where §22 wants it.
 *
 * <h2>One flat topic list, not pre-bucketed arrays</h2>
 * {@link WeaknessRadarResponse#topics()} is sorted so that grouping by {@code state} on the
 * client yields the §16 sections already in the right order. Returning five arrays instead
 * would duplicate every topic object across the offline cache and make "which section is this
 * topic in" a property of the payload's shape rather than of the topic.
 */
public final class WeaknessRadarDtos {

    private WeaknessRadarDtos() {
    }

    /**
     * @param examCode         the exam the radar was scoped to — priority and question
     *                         availability are per-exam, health is not
     * @param algorithmVersion which formula produced these numbers (§19)
     * @param computedAt       when the underlying health rows were last recomputed, so an
     *                         offline client can say how old what it is showing is
     */
    public record WeaknessRadarResponse(String examCode,
                                         String algorithmVersion,
                                         OffsetDateTime computedAt,
                                         RadarOverview overview,
                                         List<RadarTopic> topics) {
    }

    /**
     * @param status            NO_DATA / GETTING_STARTED / BUILDING / ON_TRACK / STRONG
     * @param topicsInSyllabus  topics mapped to this exam — the denominator for coverage
     * @param topicsWithEvidence how many of those the student has actually attempted
     * @param topicsReliable    how many have reached {@code RELIABLE} evidence
     * @param headline          one plain sentence, safe to show verbatim; the mobile client
     *                          prefers its own localised string keyed off {@code status}
     */
    public record RadarOverview(String status,
                                 int topicsInSyllabus,
                                 int topicsWithEvidence,
                                 int topicsReliable,
                                 int needsAttentionCount,
                                 int needsRevisionCount,
                                 int improvingCount,
                                 int strongCount,
                                 int developingCount,
                                 int insufficientDataCount,
                                 String headline) {
    }

    /**
     * @param healthScore     0-100, already rounded to a whole number (§18)
     * @param trendDelta      percentage points, recent minus historical; null when the two
     *                        windows are not comparable
     * @param speedAvailable  always false under v1 — the client must render "not available",
     *                        never a default pace (§9, §21)
     * @param priority        the exam's own topic priority, reused from Epic L's
     *                        {@code topic_priority.final_priority}; null when never scored
     * @param interventionValue where this topic ranks as a next action, blending health gap,
     *                        exam priority and confidence (§13). Null when priority is unknown
     * @param questionCount   practicable questions for this exam and topic — zero means the
     *                        recommendation cannot include practice, however weak the topic
     * @param reasonCodes     machine-readable "why", for the client's localised copy
     * @param explanation      the same thing in one plain English sentence, for clients (and
     *                        admins) with no string table
     */
    public record RadarTopic(java.util.UUID topicId,
                              String topicName,
                              java.util.UUID subjectId,
                              String subjectName,
                              String parentTopicName,
                              String state,
                              int healthScore,
                              String trend,
                              Integer trendDelta,
                              String evidenceLevel,
                              int attemptedCount,
                              int correctCount,
                              Integer accuracyPercent,
                              Integer recentAccuracyPercent,
                              Integer historicalAccuracyPercent,
                              int pyqAttemptedCount,
                              Integer pyqAccuracyPercent,
                              boolean speedAvailable,
                              String consistency,
                              Double priority,
                              Integer interventionValue,
                              long questionCount,
                              List<String> reasonCodes,
                              String explanation,
                              RecommendedActionDto recommendedAction,
                              List<PrerequisiteRef> unmetPrerequisites,
                              OffsetDateTime lastPracticedAt) {
    }

    /**
     * @param primary the single headline action
     * @param steps   the ordered plan; §14 is explicit that the recommendation, not the score,
     *                is this feature's most important output
     */
    public record RecommendedActionDto(String primary, List<ActionStepDto> steps) {
    }

    /**
     * @param questionCount how many questions this step asks for, or null for a step that is
     *                      not a question set (concept revision, a timed test)
     * @param difficultyCode the difficulty to draw from, or null when the step does not care —
     *                      resolved against the real {@code difficulty_levels} table, never
     *                      invented
     */
    public record ActionStepDto(String action, Integer questionCount, String difficultyCode) {
    }

    public record PrerequisiteRef(java.util.UUID topicId, String topicName, String state) {
    }

    /* ------------------------------------------------------------------ admin / debug (§22) */

    /**
     * The full evidence for one student's topics, at full precision — including the confidence
     * mathematics the student-facing shape withholds, and the {@code inputs} audit blob.
     *
     * <p>This exists so that "why does the app say I'm weak in this topic?" is answerable by
     * the team from stored data, without re-running the scorer or guessing.
     */
    public record AdminRadarResponse(String email,
                                      String examCode,
                                      String algorithmVersion,
                                      OffsetDateTime latestAttemptAt,
                                      List<AdminRadarTopic> topics) {
    }

    public record AdminRadarTopic(java.util.UUID topicId,
                                   String topicName,
                                   String subjectName,
                                   String state,
                                   java.math.BigDecimal healthScore,
                                   java.math.BigDecimal confidenceScore,
                                   String evidenceLevel,
                                   String trend,
                                   java.math.BigDecimal trendDelta,
                                   int attemptedCount,
                                   int correctCount,
                                   int recentAttemptedCount,
                                   java.math.BigDecimal recentAccuracy,
                                   java.math.BigDecimal historicalAccuracy,
                                   int pyqAttemptedCount,
                                   java.math.BigDecimal pyqAccuracy,
                                   java.math.BigDecimal consistencyScore,
                                   java.math.BigDecimal speedRatio,
                                   Double priority,
                                   Integer interventionValue,
                                   String recommendedAction,
                                   List<String> reasonCodes,
                                   Map<String, Object> inputs,
                                   OffsetDateTime lastAttemptAt,
                                   OffsetDateTime evidenceThroughAt,
                                   OffsetDateTime computedAt) {
    }
}
