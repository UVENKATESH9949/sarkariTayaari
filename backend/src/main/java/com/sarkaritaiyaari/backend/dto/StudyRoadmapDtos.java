package com.sarkaritaiyaari.backend.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Wire shapes for the personalized study roadmap (see {@code api/STUDY-ROADMAP.md}, TASK-3101,
 * Phase 4 of the personalization program).
 *
 * <h2>What this adds over the learning state, and what it deliberately does not</h2>
 * Phase 3 answers "where is this student, on this topic". The roadmap answers "in what order, and
 * <b>how much work is it</b>" — the one thing a backlog needs before it can be called a plan. It
 * computes no new judgement about the student: the order comes from Epic L's priority, the work
 * comes from the radar's own ordered action steps, and this phase converts questions into minutes.
 *
 * <p><b>There is no readiness figure here, and no schedule.</b> Total outstanding minutes against
 * days remaining is arithmetic and is reported as such; anything that folded health into a single
 * per-exam percentage would be a readiness score under another name, which is still an open product
 * question (D3.8, {@code reports/open-questions.md}). Turning minutes into "do this today" is Phase
 * 5, and is blocked on the student's available study time never reaching the server.
 *
 * <h2>Every estimate declares where it came from</h2>
 * {@link WorkloadEstimate#source()} is not decoration. A measured average and a stated constant are
 * different claims, and this project has paid more than once for presenting an assumption in the
 * same shape as a measurement.
 */
public final class StudyRoadmapDtos {

    private StudyRoadmapDtos() {
    }

    /**
     * @param healthAlgorithmVersion which formula produced the performance dimension underneath
     * @param computedAt             when the underlying health rows were last recomputed
     * @param totalEstimatedMinutes  the sum over topics of estimable work. Null only when nothing
     *                               in the plan could be estimated at all
     * @param topics                 ordered: the order <i>is</i> the roadmap
     */
    public record StudyRoadmapResponse(String examCode,
                                       String healthAlgorithmVersion,
                                       OffsetDateTime computedAt,
                                       RoadmapTimeline timeline,
                                       Integer totalEstimatedMinutes,
                                       List<RoadmapTopic> topics,
                                       List<RoadmapSubject> subjects) {
    }

    /**
     * The exam's own clock, when it has one.
     *
     * <p>Ten of this project's eleven exams have no published recruitment cycle, so an undated
     * roadmap is the <b>normal</b> case rather than an error state. {@code hasExamDate} is false and
     * every other field is null; nothing is invented, and {@code note} says plainly why.
     *
     * @param examDate             the exam's own start date, from the current <i>published</i>
     *                             recruitment cycle. Never the application deadline — that is a
     *                             date for applying, not for preparing
     * @param daysRemaining        whole days from today to {@code examDate}. Null once the date has
     *                             passed: a negative countdown is not a plan
     * @param dailyMinutesRequired {@code totalEstimatedMinutes / daysRemaining}, rounded up. Plain
     *                             arithmetic over an estimate, not a prediction about the student
     */
    public record RoadmapTimeline(boolean hasExamDate,
                                  LocalDate examDate,
                                  Integer daysRemaining,
                                  Integer dailyMinutesRequired,
                                  String note) {
    }

    /**
     * One topic's place in the plan.
     *
     * @param priorityRank      1-based position in the <b>pre-balance</b> priority order. Kept so
     *                          the subject interleave is visible rather than hidden: a topic listed
     *                          fourth with {@code priorityRank} 2 was moved, and a reader can see it
     * @param prerequisitesMet  false when a prerequisite topic is not yet MASTERED. The topic is
     *                          still listed — sequencing is advice, not a lock — with what blocks it
     * @param blockedBy         the unmet prerequisites by name, or empty
     * @param recommended       exactly one topic in the plan carries true: the first unblocked,
     *                          unmastered one. Same "next up" concept the existing prepare-plan
     *                          endpoint already established, deliberately not a second vocabulary
     * @param estimatedMinutes  the topic's estimable work, summed over its steps. Null when none of
     *                          its steps carry a question count
     * @param steps             the radar's own ordered plan, each step with its own minutes. Not
     *                          re-derived here: a second "how much practice" ladder is exactly the
     *                          drift Phase 3 existed to stop
     */
    public record RoadmapTopic(UUID topicId,
                               String topicName,
                               UUID subjectId,
                               String subjectName,
                               int priorityRank,
                               Double examPriority,
                               String curriculumState,
                               String performanceState,
                               String recommendedAction,
                               long questionCount,
                               boolean prerequisitesMet,
                               List<String> blockedBy,
                               boolean recommended,
                               Integer estimatedMinutes,
                               WorkloadEstimate estimate,
                               List<RoadmapStep> steps) {
    }

    /**
     * How long one question in this topic is assumed to take, and on what basis.
     *
     * <p>{@code source} walks a ladder, and the tier is reported because the tiers are not equally
     * trustworthy:
     * <ul>
     *   <li>{@code PERSONAL_TOPIC} — this student's own measured average for this topic</li>
     *   <li>{@code COHORT_TOPIC} — every student's measured average for this topic</li>
     *   <li>{@code COHORT_DIFFICULTY} — every student's measured average at this difficulty level,
     *       so "harder questions take longer" survives without hardcoding a difficulty code</li>
     *   <li>{@code DEFAULT} — a stated constant. An assumption, labelled as one</li>
     * </ul>
     *
     * @param sampleSize the timed attempts behind the average; 0 for {@code DEFAULT}
     */
    public record WorkloadEstimate(String source, int secondsPerQuestion, long sampleSize) {
    }

    /**
     * @param questionCount    null for a step that is not a question set
     * @param estimatedMinutes null exactly when {@code questionCount} is null — see the response
     *                         doc: there is no concept-learning content in this product to put a
     *                         duration against, so a number there would be invented
     */
    public record RoadmapStep(String action,
                              Integer questionCount,
                              String difficultyCode,
                              Integer estimatedMinutes) {
    }

    /**
     * Outstanding work per subject — the balance the ordering is enforcing, made checkable.
     * Deliberately not a score of any kind.
     */
    public record RoadmapSubject(UUID subjectId,
                                 String subjectName,
                                 int topicCount,
                                 Integer estimatedMinutes) {
    }
}
