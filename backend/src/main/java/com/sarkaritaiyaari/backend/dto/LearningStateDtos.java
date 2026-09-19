package com.sarkaritaiyaari.backend.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Wire shapes for the canonical learning state (see {@code api/LEARNING-STATE.md}, TASK-3001).
 *
 * <h2>The one rule this file exists to enforce: no consumer ever reads a bare {@code state}</h2>
 * This project has two per-topic state enums and they answer different questions:
 * <ul>
 *   <li>{@code TopicProgressState} — how far through the topic the student has worked. Cumulative,
 *       derived on the device, and <b>coverage rather than quality</b>: LEARNING vs PRACTICING is
 *       decided purely by attempt count.</li>
 *   <li>{@code TopicHealthState} — how they are performing lately. Windowed, weighted, and gated
 *       on confidence, so a barely-practised topic reads INSUFFICIENT_DATA rather than weak.</li>
 * </ul>
 * Both contain a value spelled {@code NEEDS_REVISION}, meaning different things — a regression from
 * MASTERED in the first, "was genuinely strong and has slipped" in the second. Rather than rename
 * an enum across a synced table and a shipped client, or flatten the two into one label and lose
 * the distinction between "barely started" and "was strong and slipping" (which want opposite
 * treatment), the contract names them: {@link TopicLearningState#curriculumState()} and
 * {@link TopicLearningState#performanceState()}. Ambiguity then cannot be expressed.
 *
 * <h2>What is deliberately absent</h2>
 * <b>Confidence.</b> Same reason the radar withholds it — by the time a topic reaches this shape
 * the number has already done its job (it decided whether a verdict was asserted at all), and
 * {@code evidenceLevel} is the legible version.
 *
 * <p><b>A single readiness score.</b> {@link SubjectLearningState} reports a distribution and a
 * coverage figure, never one number per subject. A weighted mean of topic health per exam <i>is</i>
 * a readiness score, and readiness is still an open product decision — see
 * {@code reports/open-questions.md}. This shape supplies the inputs one would be built from and
 * computes none itself.
 */
public final class LearningStateDtos {

    private LearningStateDtos() {
    }

    /**
     * @param examCode                the exam this was scoped to. Exam priority, weightage and
     *                                question availability are per-exam; health and curriculum
     *                                state are not, and are the same whichever exam is asked for
     * @param healthAlgorithmVersion  which formula produced the performance dimension
     * @param computedAt              when the underlying health rows were last recomputed
     */
    public record LearningStateResponse(String examCode,
                                         String healthAlgorithmVersion,
                                         OffsetDateTime computedAt,
                                         List<TopicLearningState> topics,
                                         List<SubjectLearningState> subjects) {
    }

    /**
     * One topic, every dimension named, with its owner recorded in each field's doc.
     *
     * @param curriculumState    owner: {@code user_topic_progress.state}. NOT_STARTED / LEARNING /
     *                           PRACTICING / MASTERED / NEEDS_REVISION. Never null — a topic with
     *                           no row has not been started
     * @param curriculumAttempts owner: {@code user_topic_progress}. All-time, and therefore not the
     *                           same number as {@link #attempts}, which is bounded to the health
     *                           model's evidence window. Both are reported rather than reconciled,
     *                           because they answer different questions
     * @param performanceState   owner: {@code user_topic_health.state}. Null when the student has
     *                           no health row at all, which is distinct from INSUFFICIENT_DATA
     *                           (a row exists, it just cannot assert a verdict yet)
     * @param healthScore        owner: {@code user_topic_health.health_score}, 0-100, rounded
     * @param trend              owner: {@code user_topic_health.trend_direction}. IMPROVING /
     *                           STABLE / DECLINING / NOT_ENOUGH_DATA. <b>The only per-topic
     *                           direction in the product</b> — {@code /api/me/analytics/topics}
     *                           deliberately reports no trend, so the two cannot disagree
     * @param evidenceLevel      owner: {@code user_topic_health.evidence_level}. How much stands
     *                           behind the performance dimension
     * @param practiceAccuracy   untimed practice only, and {@link #mockAccuracy} is timed papers
     *                           only. The health model pools the two into one verdict; these two
     *                           fields are what let a planner treat them differently without
     *                           redefining what health means
     * @param examWeightagePercent the admin-curated share of this exam's marks, null when the
     *                           exam's topic map does not carry one
     * @param questionCount      practicable questions for this exam and topic. Zero means no
     *                           recommendation can involve practice, however weak the topic is
     * @param recommendedAction  owner: {@code WeaknessRadarService}. The primary action only; the
     *                           ordered steps with their question counts stay on the radar
     */
    public record TopicLearningState(UUID topicId,
                                      String topicName,
                                      UUID subjectId,
                                      String subjectName,

                                      String curriculumState,
                                      int curriculumAttempts,
                                      BigDecimal curriculumAccuracy,
                                      OffsetDateTime curriculumLastPracticedAt,

                                      String performanceState,
                                      Integer healthScore,
                                      String trend,
                                      Integer trendDelta,
                                      String evidenceLevel,

                                      long attempts,
                                      Integer accuracy,
                                      BigDecimal practiceAccuracy,
                                      BigDecimal mockAccuracy,
                                      OffsetDateTime lastAttemptAt,

                                      Double examPriority,
                                      BigDecimal examWeightagePercent,
                                      long questionCount,

                                      String recommendedAction) {
    }

    /**
     * One subject, rolled up as a <b>distribution plus coverage</b> — never a single score.
     *
     * @param topicsInSyllabus      topics this exam maps to this subject: the denominator
     * @param topicsStarted         topics whose {@code curriculumState} is not NOT_STARTED
     * @param topicsWithEvidence    topics carrying a health row, i.e. something was measured
     * @param curriculumCounts      how many topics sit in each {@code TopicProgressState}
     * @param performanceCounts     how many topics sit in each {@code TopicHealthState}; topics
     *                              with no health row are absent from this map rather than counted
     *                              as anything
     * @param weightagePercentTotal the curated weightage this subject accounts for in the exam,
     *                              summed over its mapped topics. Null when no topic carries one
     * @param weightagePercentStarted the part of that the student has started. The pair is the
     *                              real planning signal: "70% of the topics but 30% of the marks"
     *                              is a sentence a planner can act on, and one averaged number is
     *                              not
     */
    public record SubjectLearningState(UUID subjectId,
                                        String subjectName,
                                        int topicsInSyllabus,
                                        int topicsStarted,
                                        int topicsWithEvidence,
                                        Map<String, Integer> curriculumCounts,
                                        Map<String, Integer> performanceCounts,
                                        BigDecimal weightagePercentTotal,
                                        BigDecimal weightagePercentStarted) {
    }
}
