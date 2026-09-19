package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.LearningStateDtos.LearningStateResponse;
import com.sarkaritaiyaari.backend.dto.LearningStateDtos.SubjectLearningState;
import com.sarkaritaiyaari.backend.dto.LearningStateDtos.TopicLearningState;
import com.sarkaritaiyaari.backend.dto.UserAnalyticsDtos;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.RadarTopic;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.WeaknessRadarResponse;
import com.sarkaritaiyaari.backend.entity.ExamTopic;
import com.sarkaritaiyaari.backend.entity.TopicProgressState;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserTopicProgress;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicProgressRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The canonical learning state: one composite per (student, topic), each dimension owned by
 * exactly one producer. TASK-3001, Phase 3 of the personalization program.
 *
 * <h2>This service computes nothing</h2>
 * That is the point, and it is what makes this a contract rather than a fourth model. Every number
 * here already had an owner before this class existed:
 *
 * <table>
 *   <tr><th>Dimension</th><th>Owner</th></tr>
 *   <tr><td>curriculum state (coverage)</td><td>{@code user_topic_progress}, written by the device</td></tr>
 *   <tr><td>performance state, health, trend, evidence</td><td>{@link TopicHealthService}</td></tr>
 *   <tr><td>practice vs mock accuracy</td><td>{@link UserAnalyticsService}</td></tr>
 *   <tr><td>exam priority, question availability, recommended action</td><td>{@link WeaknessRadarService}</td></tr>
 *   <tr><td>exam weightage</td><td>{@code exam_topics}, curated by an admin</td></tr>
 * </table>
 *
 * <p>Most of the composite already existed as {@code RadarTopic} — the radar is built from the same
 * health rows and already resolves priority, question counts and the recommendation. So this reads
 * the radar rather than reassembling it, and adds the two things it never carried: the curriculum
 * dimension, and subject rollups. Building a parallel assembler would have been a second place for
 * "what is this student's state" to drift.
 *
 * <p><b>Nothing is stored <i>by this service</i>.</b> {@code user_topic_health} is already a
 * rebuildable cache with its own staleness check; a second stored layer would be a second thing
 * that can go stale (D3.6).
 *
 * <h2>Why this is not {@code readOnly}, despite only serving a GET</h2>
 * It was, in the first draft, and every test that had anything to practise failed with
 * {@code cannot execute DELETE in a read-only transaction}. The health model recomputes lazily:
 * {@code TopicHealthService.healthForUser} deletes and rewrites a student's rows when its cache is
 * stale, so a read of the learning state can legitimately write. A {@code readOnly} transaction
 * here propagates into that recompute and blocks it — the failure surfaces as a 500 on this
 * endpoint, and only for a student who has actually practised, which is exactly the case a
 * fixture-light test would miss. Marked plainly transactional, with the surprise stated here
 * rather than left for the next reader to rediscover.
 */
@Service
@Transactional
public class LearningStateService {

    private final WeaknessRadarService radar;
    private final UserAnalyticsService analytics;
    private final UserTopicProgressRepository topicProgress;
    private final ExamTopicRepository examTopics;

    public LearningStateService(WeaknessRadarService radar,
                                UserAnalyticsService analytics,
                                UserTopicProgressRepository topicProgress,
                                ExamTopicRepository examTopics) {
        this.radar = radar;
        this.analytics = analytics;
        this.topicProgress = topicProgress;
        this.examTopics = examTopics;
    }

    /**
     * The composite, plus the thing it was assembled from that the contract deliberately does not
     * carry: the radar response, which keeps the ordered action steps.
     *
     * <p>This exists so a caller that needs both — {@link StudyRoadmapService}, which turns the
     * radar's ordered steps into minutes — gets them from <b>one</b> computation. Calling
     * {@link #stateFor} and {@code WeaknessRadarService.radarFor} separately would recompute the
     * radar twice per request, and the radar can lazily rebuild a student's health rows, so that
     * is two writes rather than two reads.
     */
    public record AssembledState(LearningStateResponse state, WeaknessRadarResponse radar) {
    }

    public LearningStateResponse stateFor(User user, String examCode, OffsetDateTime now) {
        return assemble(user, examCode, now).state();
    }

    public AssembledState assemble(User user, String examCode, OffsetDateTime now) {
        WeaknessRadarResponse radarResponse = radar.radarFor(user, examCode, false);

        Map<UUID, UserTopicProgress> curriculum = new HashMap<>();
        for (UserTopicProgress row : topicProgress.findAllForUser(user.getId())) {
            curriculum.put(row.getTopic().getId(), row);
        }

        Map<UUID, UserAnalyticsDtos.TopicStat> stats = new HashMap<>();
        for (UserAnalyticsDtos.TopicStat stat : analytics.topics(user, now)) {
            stats.put(stat.topicId(), stat);
        }

        Map<UUID, BigDecimal> weightage = new HashMap<>();
        for (ExamTopic mapping : examTopics.findByExamCodeOrderByTopicName(examCode)) {
            if (mapping.getWeightagePercent() != null) {
                weightage.put(mapping.getTopic().getId(), mapping.getWeightagePercent());
            }
        }

        List<TopicLearningState> topics = new ArrayList<>();
        for (RadarTopic t : radarResponse.topics()) {
            topics.add(compose(t, curriculum.get(t.topicId()), stats.get(t.topicId()),
                    weightage.get(t.topicId())));
        }

        LearningStateResponse response = new LearningStateResponse(
                radarResponse.examCode(),
                radarResponse.algorithmVersion(),
                radarResponse.computedAt(),
                topics,
                rollUpBySubject(topics));

        return new AssembledState(response, radarResponse);
    }

    private static TopicLearningState compose(RadarTopic t,
                                              UserTopicProgress progress,
                                              UserAnalyticsDtos.TopicStat stat,
                                              BigDecimal weightagePercent) {
        // A topic with no progress row has not been started. That is a real answer, not missing
        // data, so the field is never null — unlike performanceState, where "no row at all" and
        // "a row that cannot assert a verdict" are genuinely different and both worth telling apart.
        TopicProgressState curriculumState = progress == null
                ? TopicProgressState.NOT_STARTED
                : progress.getState();

        // The radar reports INSUFFICIENT_DATA for a topic with no health row (correctly — an
        // unpractised topic is not weak). Here that is flattened back to null, so a caller can
        // distinguish "never measured" from "measured, not enough to judge".
        boolean measured = t.attemptedCount() > 0;

        return new TopicLearningState(
                t.topicId(),
                t.topicName(),
                t.subjectId(),
                t.subjectName(),

                curriculumState.name(),
                progress == null ? 0 : progress.getAttemptedCount(),
                progress == null ? null : progress.getAccuracyPercent(),
                progress == null ? null : progress.getLastPracticedAt(),

                measured ? t.state() : null,
                measured ? t.healthScore() : null,
                measured ? t.trend() : null,
                measured ? t.trendDelta() : null,
                t.evidenceLevel(),

                t.attemptedCount(),
                t.accuracyPercent(),
                stat == null ? null : stat.practiceAccuracy(),
                stat == null ? null : stat.mockAccuracy(),
                t.lastPracticedAt(),

                t.priority(),
                weightagePercent,
                t.questionCount(),

                t.recommendedAction() == null ? null : t.recommendedAction().primary());
    }

    /**
     * Distribution and coverage per subject — never one score. See {@code SubjectLearningState}'s
     * own doc for why: a weighted mean per subject is a readiness number, and readiness is not this
     * phase's decision to take.
     */
    private static List<SubjectLearningState> rollUpBySubject(List<TopicLearningState> topics) {
        Map<UUID, Accumulator> bySubject = new LinkedHashMap<>();
        for (TopicLearningState t : topics) {
            // A topic with no subject cannot be rolled up into one. Dropping it here is safe
            // because it still appears in the per-topic list; inventing an "Unknown" bucket would
            // put a fabricated subject in front of a student.
            if (t.subjectId() == null) continue;
            bySubject.computeIfAbsent(t.subjectId(), id -> new Accumulator(id, t.subjectName()))
                    .add(t);
        }

        List<SubjectLearningState> out = new ArrayList<>();
        for (Accumulator a : bySubject.values()) out.add(a.toDto());
        out.sort(Comparator.comparing(SubjectLearningState::subjectName,
                Comparator.nullsLast(Comparator.naturalOrder())));
        return out;
    }

    private static final class Accumulator {
        private final UUID subjectId;
        private final String subjectName;
        private final Map<String, Integer> curriculumCounts = new LinkedHashMap<>();
        private final Map<String, Integer> performanceCounts = new LinkedHashMap<>();
        private int topicsInSyllabus;
        private int topicsStarted;
        private int topicsWithEvidence;
        private BigDecimal weightageTotal;
        private BigDecimal weightageStarted;

        private Accumulator(UUID subjectId, String subjectName) {
            this.subjectId = subjectId;
            this.subjectName = subjectName;
        }

        private void add(TopicLearningState t) {
            topicsInSyllabus++;
            curriculumCounts.merge(t.curriculumState(), 1, Integer::sum);

            boolean started = !TopicProgressState.NOT_STARTED.name().equals(t.curriculumState());
            if (started) topicsStarted++;

            if (t.performanceState() != null) {
                topicsWithEvidence++;
                performanceCounts.merge(t.performanceState(), 1, Integer::sum);
            }

            if (t.examWeightagePercent() != null) {
                weightageTotal = weightageTotal == null
                        ? t.examWeightagePercent()
                        : weightageTotal.add(t.examWeightagePercent());
                if (started) {
                    weightageStarted = weightageStarted == null
                            ? t.examWeightagePercent()
                            : weightageStarted.add(t.examWeightagePercent());
                }
            }
        }

        private SubjectLearningState toDto() {
            // Null total means no topic in this subject carries a curated weightage, so there is
            // nothing to report — not zero, which would read as "this subject is worth no marks".
            // When a total does exist, a started figure of zero is a real measurement and is
            // reported as zero rather than left null.
            BigDecimal started = weightageTotal == null
                    ? null
                    : (weightageStarted == null ? BigDecimal.ZERO : weightageStarted);
            return new SubjectLearningState(subjectId, subjectName, topicsInSyllabus, topicsStarted,
                    topicsWithEvidence, Map.copyOf(curriculumCounts), Map.copyOf(performanceCounts),
                    weightageTotal, started);
        }
    }
}
