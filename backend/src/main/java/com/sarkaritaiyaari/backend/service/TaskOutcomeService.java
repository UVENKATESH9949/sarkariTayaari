package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.StudyTask;
import com.sarkaritaiyaari.backend.repository.StudyTaskRepository;
import com.sarkaritaiyaari.backend.repository.TaskOutcomeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Did the student actually do what they were asked? (TASK-3401, Phase 6.)
 *
 * <h2>Inferred, not reported (D6.1)</h2>
 * There is no "mark as done" control, because there is no screen to put one on — so an outcome is
 * worked out from real attempts instead. Migration V47 froze {@code topic_id} onto every attempt
 * row, which is the only reason this is possible at all: joining {@code questions} live would let a
 * question retagged since silently change what a past day looks like.
 *
 * <p>Two limits, stated here rather than discovered later:
 * <ul>
 *   <li><b>Self-directed practice counts.</b> If Percentages was assigned and the student practised
 *       it for their own reasons, the task reads as done. The system can see activity, not intent,
 *       and inventing a distinction it cannot observe would be worse than the over-count.</li>
 *   <li><b>Partial work is its own outcome.</b> Four answers against a fifteen-question task is
 *       neither done nor ignored, and {@link #COMPLETION_THRESHOLD} is a declared judgement about
 *       where the line sits — not a measurement.</li>
 * </ul>
 */
@Service
@Transactional
public class TaskOutcomeService {

    /**
     * The share of a task's planned questions that counts as having done it. Below this but above
     * zero is {@code PARTIAL}; exactly zero is {@code SKIPPED}.
     *
     * <p>0.6 rather than 1.0 deliberately: a student who answers 10 of 15 questions did the task in
     * any sense that matters, and demanding the exact count would mark real work as a failure.
     */
    static final double COMPLETION_THRESHOLD = 0.6;

    /**
     * How far back settlement looks. A student returning after a month should not trigger a scan of
     * every plan they were ever given, and an unsettled task from six weeks ago tells Phase 6
     * nothing it can still act on — it stays ASSIGNED, which is an honest "never judged".
     */
    static final int SETTLE_LOOKBACK_DAYS = 14;

    public static final String COMPLETED = "COMPLETED";
    public static final String PARTIAL = "PARTIAL";
    public static final String SKIPPED = "SKIPPED";

    private final StudyTaskRepository tasks;
    private final TaskOutcomeRepository outcomes;

    public TaskOutcomeService(StudyTaskRepository tasks, TaskOutcomeRepository outcomes) {
        this.tasks = tasks;
        this.outcomes = outcomes;
    }

    /** What was actually answered on one topic in one day. */
    public record Observed(long answered, long correct) {

        static final Observed NOTHING = new Observed(0, 0);

        public Integer accuracyPercent() {
            return answered == 0 ? null : (int) Math.round(100.0 * correct / answered);
        }
    }

    /**
     * Settle every task from a day that has already closed. Called when a new day's plan is
     * generated — the natural moment, because it is the only time the system is guaranteed to be
     * looking at this student again, and it needs yesterday's outcome anyway.
     *
     * <p>Idempotent: a settled task is never revisited, since the query only returns ASSIGNED rows.
     */
    public int settlePastDays(UUID userId, LocalDate today) {
        List<StudyTask> unsettled =
                tasks.findUnsettledBefore(userId, today, today.minusDays(SETTLE_LOOKBACK_DAYS));
        if (unsettled.isEmpty()) return 0;

        // Group by the day each task belongs to: one pair of queries per day, not per task.
        Map<LocalDate, List<StudyTask>> byDay = new HashMap<>();
        for (StudyTask task : unsettled) {
            byDay.computeIfAbsent(task.getPlanDate(), d -> new ArrayList<>()).add(task);
        }

        List<StudyTask> settled = new ArrayList<>();
        for (Map.Entry<LocalDate, List<StudyTask>> entry : byDay.entrySet()) {
            // Each task carries the zone its day was resolved in, so a student who travelled still
            // gets their own midnight rather than the server's.
            ZoneId zone = zoneOf(entry.getValue().get(0));
            Map<UUID, Observed> observed = observedOn(userId, entry.getKey(), zone);

            for (StudyTask task : entry.getValue()) {
                task.setStatus(outcomeFor(task, observed.getOrDefault(task.getTopicId(), Observed.NOTHING)));
                settled.add(task);
            }
        }

        tasks.saveAll(settled);
        return settled.size();
    }

    /** What the student answered per topic on one calendar day, in their own zone. */
    public Map<UUID, Observed> observedOn(UUID userId, LocalDate day, ZoneId zone) {
        OffsetDateTime from = day.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime to = day.plusDays(1).atStartOfDay(zone).toOffsetDateTime();

        Map<UUID, long[]> totals = new HashMap<>();
        accumulate(totals, outcomes.practiceByTopicInWindow(userId, from, to));
        accumulate(totals, outcomes.mockByTopicInWindow(userId, from, to));

        Map<UUID, Observed> out = new HashMap<>();
        for (Map.Entry<UUID, long[]> e : totals.entrySet()) {
            out.put(e.getKey(), new Observed(e.getValue()[0], e.getValue()[1]));
        }
        return out;
    }

    /**
     * The outcome rule. A task with no planned question count — which Phase 5 does not currently
     * produce, but the shape allows — counts as done on any activity at all, since there is no
     * target to measure against.
     */
    public static String outcomeFor(StudyTask task, Observed observed) {
        if (observed.answered() == 0) return SKIPPED;

        Integer planned = task.getPlannedQuestionCount();
        if (planned == null || planned <= 0) return COMPLETED;

        return observed.answered() >= Math.ceil(planned * COMPLETION_THRESHOLD)
                ? COMPLETED
                : PARTIAL;
    }

    private static ZoneId zoneOf(StudyTask task) {
        try {
            return ZoneId.of(task.getPlanZone());
        } catch (java.time.DateTimeException e) {
            // A zone stored on an old row that the JDK no longer recognises must not stop
            // settlement; UTC is a defensible fallback for a day that is already over.
            return ZoneId.of("UTC");
        }
    }

    private static void accumulate(Map<UUID, long[]> totals, List<Object[]> rows) {
        for (Object[] row : rows) {
            UUID topicId = (UUID) row[0];
            if (topicId == null) continue;
            long[] slot = totals.computeIfAbsent(topicId, id -> new long[2]);
            slot[0] += ((Number) row[1]).longValue();
            if (row[2] != null) slot[1] += ((Number) row[2]).longValue();
        }
    }
}
