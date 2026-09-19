package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.UserAnalyticsDtos;
import com.sarkaritaiyaari.backend.entity.DifficultyLevel;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.DifficultyLevelRepository;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.repository.UserAnalyticsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Derived analytics over a student's own history (TASK-2801).
 *
 * <h2>What this is not</h2>
 * It answers "what has this student done, and how did it go". It deliberately makes <strong>no
 * recommendation</strong> — no "study Geometry next", no weakness verdict, no readiness score.
 * Those belong to a planning layer that sits on top of this and does not exist yet; building
 * them into the measurement layer is how a foundation stops being reusable. {@code
 * WeaknessRadarService} already owns the diagnosis half, and this does not duplicate it.
 *
 * <p>Nothing here calls a model. Accuracy, averages, counts, streaks and trends are arithmetic,
 * and an LLM would make them slower, costlier and non-deterministic without making them better.
 *
 * <h2>Everything is computed on read</h2>
 * No aggregate is stored. The attempt rows are immutable, so a figure is always reproducible, and
 * a cache would be a second thing that can disagree with them. If profiling ever demands one, the
 * shape to copy is {@code user_topic_health} (V24): rebuildable, algorithm-versioned, safe to drop.
 *
 * <h2>The rules that keep figures honest</h2>
 * <ul>
 *   <li>Unattempted and pending-review answers are excluded from both numerator and denominator
 *       (enforced in {@link UserAnalyticsRepository}, not here).</li>
 *   <li>An average time is divided by the attempts that carry a time, never by all of them.</li>
 *   <li>Null is returned wherever there is nothing to measure. Nothing falls back to zero.</li>
 * </ul>
 */
@Service
@Transactional(readOnly = true)
public class UserAnalyticsService {

    /**
     * How far back a "lifetime" read reaches.
     *
     * <p>Not unbounded: every query here is time-bounded so a student with years of history
     * cannot turn one screen into a full-table scan. Matches the evidence window Weakness Radar
     * already uses, so the two features describe the same span of a student's life.
     */
    private static final int LIFETIME_DAYS = 365;

    /**
     * Attempts needed in both halves of the activity series before its direction is asserted at
     * all. This no longer gates any <i>per-topic</i> direction: that was removed in TASK-3001
     * (D3.1) because it duplicated {@code user_topic_health.trend_direction}, and the health model
     * owns it. What remains is the overall series on {@code /trends}, a different question.
     */
    private static final int TREND_MIN_ATTEMPTS = 5;

    /**
     * Percentage points a window has to move before it is called a change rather than noise.
     *
     * <p>A judgement call, not a derived figure. Too small and every student is permanently
     * "improving" or "declining" on ordinary variance; this is roughly one extra right answer in
     * twenty.
     */
    private static final BigDecimal TREND_DELTA_THRESHOLD = new BigDecimal("5");

    private static final String IMPROVING = "IMPROVING";
    private static final String DECLINING = "DECLINING";
    private static final String STABLE = "STABLE";
    private static final String INSUFFICIENT_DATA = "INSUFFICIENT_DATA";

    private final UserAnalyticsRepository analytics;
    private final TopicRepository topics;
    private final SubjectRepository subjects;
    private final DifficultyLevelRepository difficultyLevels;

    public UserAnalyticsService(UserAnalyticsRepository analytics,
                                TopicRepository topics,
                                SubjectRepository subjects,
                                DifficultyLevelRepository difficultyLevels) {
        this.analytics = analytics;
        this.topics = topics;
        this.subjects = subjects;
        this.difficultyLevels = difficultyLevels;
    }

    /* ==================================================================== overview */

    public UserAnalyticsDtos.Overview overview(User user, ZoneId zone, OffsetDateTime now) {
        OffsetDateTime since = now.minusDays(LIFETIME_DAYS);

        Totals practice = totals(analytics.practiceTotals(user.getId(), since));
        Totals mock = totals(analytics.mockTotals(user.getId(), since));

        List<Object[]> practiceSessions = analytics.practiceSessionRows(user.getId(), since);
        List<Object[]> mockAttempts = analytics.mockAttemptRows(user.getId(), since);

        long studyTimeMs = 0;
        long sessionsWithoutDuration = 0;
        for (Object[] row : practiceSessions) {
            Long durationMs = (Long) row[3];
            if (durationMs == null) {
                // Every practice session recorded before V47 has none. Counted rather than treated
                // as zero-length study, so the total above can be read as "time we actually
                // measured" instead of silently understating a long history.
                sessionsWithoutDuration++;
            } else {
                studyTimeMs += durationMs;
            }
        }
        for (Object[] row : mockAttempts) {
            studyTimeMs += ((Number) row[3]).longValue() * 1000L;
        }

        List<OffsetDateTime> activity = new ArrayList<>();
        for (Object[] row : practiceSessions) activity.add((OffsetDateTime) row[0]);
        for (Object[] row : mockAttempts) activity.add((OffsetDateTime) row[0]);

        OffsetDateTime lastActiveAt = activity.stream().max(Comparator.naturalOrder()).orElse(null);
        Integer daysSinceLastActivity = lastActiveAt == null ? null
                : (int) ChronoUnit.DAYS.between(lastActiveAt.atZoneSameInstant(zone).toLocalDate(),
                                                now.atZoneSameInstant(zone).toLocalDate());

        Streaks streaks = streaks(activity, zone, now);

        long attempted = practice.attempted() + mock.attempted();
        long correct = practice.correct() + mock.correct();

        return new UserAnalyticsDtos.Overview(
                practiceSessions.size(),
                mockAttempts.size(),
                attempted,
                correct,
                percentage(correct, attempted),
                studyTimeMs,
                sessionsWithoutDuration,
                lastActiveAt,
                daysSinceLastActivity,
                streaks.current(),
                streaks.longest());
    }

    /* ==================================================================== subjects */

    public List<UserAnalyticsDtos.SubjectStat> subjects(User user, OffsetDateTime now) {
        OffsetDateTime since = now.minusDays(LIFETIME_DAYS);
        Map<UUID, Split> bySubject = mergeByUuid(
                analytics.practiceBySubject(user.getId(), since),
                analytics.mockBySubject(user.getId(), since));

        Map<UUID, String> names = new HashMap<>();
        for (Subject subject : subjects.findAllById(bySubject.keySet())) {
            names.put(subject.getId(), subject.getName());
        }

        List<UserAnalyticsDtos.SubjectStat> out = new ArrayList<>();
        bySubject.forEach((subjectId, split) -> out.add(new UserAnalyticsDtos.SubjectStat(
                subjectId,
                names.get(subjectId),
                split.total().attempted(),
                percentage(split.total().correct(), split.total().attempted()),
                averageTimeMs(split.total()),
                percentage(split.practice().correct(), split.practice().attempted()),
                percentage(split.mock().correct(), split.mock().attempted()),
                split.lastAttemptedAt())));
        out.sort(Comparator.comparingLong(UserAnalyticsDtos.SubjectStat::attempts).reversed());
        return out;
    }

    /* ====================================================================== topics */

    public List<UserAnalyticsDtos.TopicStat> topics(User user, OffsetDateTime now) {
        OffsetDateTime since = now.minusDays(LIFETIME_DAYS);

        Map<UUID, Split> byTopic = mergeByUuid(
                analytics.practiceByTopic(user.getId(), since),
                analytics.mockByTopic(user.getId(), since));

        Map<UUID, Topic> topicsById = new HashMap<>();
        for (Topic topic : topics.findAllById(byTopic.keySet())) {
            topicsById.put(topic.getId(), topic);
        }

        List<UserAnalyticsDtos.TopicStat> out = new ArrayList<>();
        byTopic.forEach((topicId, split) -> {
            Topic topic = topicsById.get(topicId);
            out.add(new UserAnalyticsDtos.TopicStat(
                    topicId,
                    topic == null ? null : topic.getName(),
                    topic == null || topic.getSubject() == null ? null : topic.getSubject().getName(),
                    split.total().attempted(),
                    percentage(split.total().correct(), split.total().attempted()),
                    averageTimeMs(split.total()),
                    percentage(split.practice().correct(), split.practice().attempted()),
                    percentage(split.mock().correct(), split.mock().attempted()),
                    split.lastAttemptedAt()));
        });
        out.sort(Comparator.comparingLong(UserAnalyticsDtos.TopicStat::attempts).reversed());
        return out;
    }

    /* ================================================================== difficulty */

    public List<UserAnalyticsDtos.DifficultyStat> difficulty(User user, OffsetDateTime now) {
        OffsetDateTime since = now.minusDays(LIFETIME_DAYS);
        Map<String, Split> byCode = mergeByString(
                analytics.practiceByDifficulty(user.getId(), since),
                analytics.mockByDifficulty(user.getId(), since));

        Map<String, String> labels = new HashMap<>();
        Map<String, Integer> order = new HashMap<>();
        for (DifficultyLevel level : difficultyLevels.findAll()) {
            labels.put(level.getCode(), level.getLabel());
            order.put(level.getCode(), level.getDisplayOrder());
        }

        List<UserAnalyticsDtos.DifficultyStat> out = new ArrayList<>();
        byCode.forEach((code, split) -> out.add(new UserAnalyticsDtos.DifficultyStat(
                code,
                labels.get(code),
                split.total().attempted(),
                percentage(split.total().correct(), split.total().attempted()),
                averageTimeMs(split.total()))));
        // Easy before Hard, using the admin-curated display order rather than alphabetical —
        // "Easy, Hard, Medium" reads as a bug even when the numbers are right.
        out.sort(Comparator.comparingInt(s -> order.getOrDefault(s.difficultyCode(), Integer.MAX_VALUE)));
        return out;
    }

    /* ==================================================================== activity */

    public UserAnalyticsDtos.ActivitySummary activity(User user, String window, ZoneId zone, OffsetDateTime now) {
        OffsetDateTime from = switch (window == null ? "" : window.toUpperCase()) {
            case "TODAY" -> now.atZoneSameInstant(zone).toLocalDate().atStartOfDay(zone).toOffsetDateTime();
            case "7D" -> now.minusDays(7);
            case "30D" -> now.minusDays(30);
            case "90D" -> now.minusDays(90);
            default -> throw new IllegalArgumentException(
                    "Unknown window '" + window + "' — expected TODAY, 7D, 30D or 90D");
        };

        Totals practice = totals(analytics.practiceTotals(user.getId(), from));
        Totals mock = totals(analytics.mockTotals(user.getId(), from));
        List<Object[]> practiceSessions = analytics.practiceSessionRows(user.getId(), from);
        List<Object[]> mockAttempts = analytics.mockAttemptRows(user.getId(), from);

        long studyTimeMs = 0;
        for (Object[] row : practiceSessions) {
            Long durationMs = (Long) row[3];
            if (durationMs != null) studyTimeMs += durationMs;
        }
        for (Object[] row : mockAttempts) {
            studyTimeMs += ((Number) row[3]).longValue() * 1000L;
        }

        long attempted = practice.attempted() + mock.attempted();
        long correct = practice.correct() + mock.correct();

        return new UserAnalyticsDtos.ActivitySummary(
                window.toUpperCase(), from, attempted, correct, percentage(correct, attempted),
                studyTimeMs, practiceSessions.size(), mockAttempts.size());
    }

    /* ====================================================================== trends */

    /**
     * Accuracy per period over the last {@code weeks} weeks.
     *
     * <p>Built from the parent session/attempt rows, which already carry their own counts — so a
     * chart of a year's history never touches the per-question tables. Empty periods are kept in
     * the series rather than dropped: a week with no study is a fact about the student, and
     * omitting it would let a client draw a continuous line through a gap that was not there.
     */
    public UserAnalyticsDtos.TrendSeries trends(User user, int weeks, ZoneId zone, OffsetDateTime now) {
        int clampedWeeks = Math.min(Math.max(weeks, 2), 52);
        OffsetDateTime since = now.minusWeeks(clampedWeeks);

        LinkedHashMap<LocalDate, long[]> buckets = new LinkedHashMap<>();
        LocalDate today = now.atZoneSameInstant(zone).toLocalDate();
        for (int i = clampedWeeks - 1; i >= 0; i--) {
            buckets.put(today.minusWeeks(i), new long[2]);
        }

        for (Object[] row : analytics.practiceSessionRows(user.getId(), since)) {
            addToBucket(buckets, zone, today, (OffsetDateTime) row[0],
                    ((Number) row[2]).longValue(), ((Number) row[1]).longValue());
        }
        for (Object[] row : analytics.mockAttemptRows(user.getId(), since)) {
            addToBucket(buckets, zone, today, (OffsetDateTime) row[0],
                    ((Number) row[2]).longValue(), ((Number) row[1]).longValue());
        }

        List<UserAnalyticsDtos.TrendPoint> points = new ArrayList<>();
        buckets.forEach((weekStart, counts) -> points.add(new UserAnalyticsDtos.TrendPoint(
                weekStart.atStartOfDay(zone).toOffsetDateTime(),
                counts[0], counts[1], percentage(counts[1], counts[0]))));

        // Direction over the series: its first half against its second. This is about the
        // student's OVERALL activity over time, not a verdict on any one topic — per-topic
        // direction belongs to the health model (TASK-3001, D3.1), which is why this is the only
        // direction this service still computes.
        int half = points.size() / 2;
        long earlyAttempted = 0, earlyCorrect = 0, lateAttempted = 0, lateCorrect = 0;
        for (int i = 0; i < points.size(); i++) {
            if (i < half) {
                earlyAttempted += points.get(i).questionsAttempted();
                earlyCorrect += points.get(i).correct();
            } else {
                lateAttempted += points.get(i).questionsAttempted();
                lateCorrect += points.get(i).correct();
            }
        }

        return new UserAnalyticsDtos.TrendSeries("WEEK", points,
                direction(new Window(lateAttempted, lateCorrect, earlyAttempted, earlyCorrect)));
    }

    private static void addToBucket(Map<LocalDate, long[]> buckets, ZoneId zone, LocalDate today,
                                    OffsetDateTime at, long attempted, long correct) {
        LocalDate day = at.atZoneSameInstant(zone).toLocalDate();
        long daysAgo = ChronoUnit.DAYS.between(day, today);
        if (daysAgo < 0) daysAgo = 0;
        LocalDate weekStart = today.minusWeeks(daysAgo / 7);
        long[] counts = buckets.get(weekStart);
        if (counts == null) return;
        counts[0] += attempted;
        counts[1] += correct;
    }

    /* ===================================================================== helpers */

    /** Attempted/correct plus the time actually measured for them. */
    private record Totals(long attempted, long correct, long totalTimeMs, long timedCount) {
        static Totals empty() {
            return new Totals(0, 0, 0, 0);
        }

        Totals plus(Totals other) {
            return new Totals(attempted + other.attempted, correct + other.correct,
                    totalTimeMs + other.totalTimeMs, timedCount + other.timedCount);
        }
    }

    /** One group's numbers, kept split by source because practice and mock are not interchangeable. */
    private record Split(Totals practice, Totals mock, OffsetDateTime lastAttemptedAt) {
        Totals total() {
            return practice.plus(mock);
        }
    }

    /** Two comparable windows of the same group, for a direction of travel. */
    private record Window(long recentAttempted, long recentCorrect, long priorAttempted, long priorCorrect) {
    }

    private static Totals totals(List<Object[]> rows) {
        if (rows.isEmpty()) return Totals.empty();
        Object[] row = rows.get(0);
        // count() is never null, but sum() over an empty set is — and sum(timeMs) is null whenever
        // no attempt in the group carried a time, which is the normal state for older history.
        return new Totals(num(row[0]), num(row[1]), num(row[2]), num(row[3]));
    }

    private static long num(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }

    private static Map<UUID, Split> mergeByUuid(List<Object[]> practiceRows, List<Object[]> mockRows) {
        return merge(practiceRows, mockRows, row -> (UUID) row[0]);
    }

    private static Map<String, Split> mergeByString(List<Object[]> practiceRows, List<Object[]> mockRows) {
        return merge(practiceRows, mockRows, row -> (String) row[0]);
    }

    /**
     * Folds the two per-source result sets into one map keyed by the dimension.
     *
     * <p>Merged here rather than in SQL because a single query spanning both result tables would
     * need a union over two different entities, and keeping them apart is what lets every figure
     * be reported per source as well as combined.
     */
    private static <K> Map<K, Split> merge(List<Object[]> practiceRows, List<Object[]> mockRows,
                                           java.util.function.Function<Object[], K> key) {
        Map<K, Totals> practice = new HashMap<>();
        Map<K, Totals> mock = new HashMap<>();
        Map<K, OffsetDateTime> lastAt = new HashMap<>();
        Set<K> keys = new HashSet<>();

        for (Object[] row : practiceRows) {
            K k = key.apply(row);
            keys.add(k);
            practice.put(k, new Totals(num(row[1]), num(row[2]), num(row[3]), num(row[4])));
            lastAt.merge(k, (OffsetDateTime) row[5], UserAnalyticsService::latest);
        }
        for (Object[] row : mockRows) {
            K k = key.apply(row);
            keys.add(k);
            mock.put(k, new Totals(num(row[1]), num(row[2]), num(row[3]), num(row[4])));
            lastAt.merge(k, (OffsetDateTime) row[5], UserAnalyticsService::latest);
        }

        Map<K, Split> out = new LinkedHashMap<>();
        for (K k : keys) {
            out.put(k, new Split(practice.getOrDefault(k, Totals.empty()),
                    mock.getOrDefault(k, Totals.empty()), lastAt.get(k)));
        }
        return out;
    }

    private static OffsetDateTime latest(OffsetDateTime a, OffsetDateTime b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.isAfter(b) ? a : b;
    }

    /**
     * IMPROVING / DECLINING / STABLE, or INSUFFICIENT_DATA when either window is too thin to
     * compare — which is asserted rather than papered over, because "we cannot tell yet" is a
     * useful answer and a fabricated STABLE is not.
     */
    private static String direction(Window window) {
        if (window == null) return INSUFFICIENT_DATA;
        if (window.recentAttempted() < TREND_MIN_ATTEMPTS || window.priorAttempted() < TREND_MIN_ATTEMPTS) {
            return INSUFFICIENT_DATA;
        }
        BigDecimal recent = percentage(window.recentCorrect(), window.recentAttempted());
        BigDecimal prior = percentage(window.priorCorrect(), window.priorAttempted());
        if (recent == null || prior == null) return INSUFFICIENT_DATA;

        BigDecimal delta = recent.subtract(prior);
        if (delta.abs().compareTo(TREND_DELTA_THRESHOLD) < 0) return STABLE;
        return delta.signum() > 0 ? IMPROVING : DECLINING;
    }

    /** Percentage 0-100 at one decimal, or null when the denominator is zero. */
    private static BigDecimal percentage(long part, long whole) {
        if (whole <= 0) return null;
        return BigDecimal.valueOf(part)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(whole), 1, RoundingMode.HALF_UP);
    }

    /** Divided by the attempts that carry a time, never by all of them. Null when none do. */
    private static Long averageTimeMs(Totals totals) {
        if (totals.timedCount() <= 0) return null;
        return totals.totalTimeMs() / totals.timedCount();
    }

    /**
     * Current and longest run of consecutive active days.
     *
     * <p>In the caller's zone, because a day boundary is a property of where the student is, not
     * of the server. A current streak survives "nothing yet today" — it breaks only once a whole
     * day has passed with no activity, so opening the app in the morning does not report a streak
     * already lost.
     */
    private Streaks streaks(List<OffsetDateTime> activity, ZoneId zone, OffsetDateTime now) {
        if (activity.isEmpty()) return new Streaks(0, 0);

        Set<LocalDate> days = new HashSet<>();
        for (OffsetDateTime at : activity) days.add(at.atZoneSameInstant(zone).toLocalDate());

        List<LocalDate> sorted = new ArrayList<>(days);
        sorted.sort(Comparator.naturalOrder());

        int longest = 1;
        int run = 1;
        for (int i = 1; i < sorted.size(); i++) {
            if (Duration.between(sorted.get(i - 1).atStartOfDay(), sorted.get(i).atStartOfDay()).toDays() == 1) {
                run++;
            } else {
                run = 1;
            }
            longest = Math.max(longest, run);
        }

        LocalDate today = now.atZoneSameInstant(zone).toLocalDate();
        int current = 0;
        LocalDate cursor = days.contains(today) ? today : today.minusDays(1);
        while (days.contains(cursor)) {
            current++;
            cursor = cursor.minusDays(1);
        }

        return new Streaks(current, longest);
    }

    private record Streaks(int current, int longest) {
    }
}
