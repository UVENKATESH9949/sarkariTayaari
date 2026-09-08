package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.DifficultyLevel;
import com.sarkaritaiyaari.backend.entity.EvidenceLevel;
import com.sarkaritaiyaari.backend.entity.PerformanceTrend;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.entity.TopicHealthState;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserTopicHealth;
import com.sarkaritaiyaari.backend.repository.DifficultyLevelRepository;
import com.sarkaritaiyaari.backend.repository.TopicEvidenceRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicHealthRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/**
 * Computes one student's per-topic health, confidence and trend from their raw question
 * attempts (Weakness Radar v1 — {@code tasks/TASK-2201-weakness-radar.md}).
 *
 * <h2>This is the only place the formula lives</h2>
 * The supplied spec's §5 requires the calculation to sit in one isolated, versioned service
 * so it can become v2 without rewriting the feature, and §15 requires it not to be scattered
 * across controllers, repositories or UI. Everything below {@link #score} is pure and static:
 * it takes evidence and a clock, and returns numbers. Nothing about HTTP, persistence or
 * presentation reaches into it, which is also what makes the §23 test cases expressible as
 * plain fixtures.
 *
 * <p>There is a second copy of these rules in {@code mobile/src/intelligence/topicHealth.ts},
 * for the signed-out path where the attempts never reach a server. That duplication was a
 * deliberate decision, and it follows the precedent this codebase already set for the mastery
 * ladder ({@code TopicProgressState.canTransitionTo} here,
 * {@code db/topicProgressStore.ts}'s {@code deriveState} there). The constants below are
 * mirrored by name and value, and {@code sample-data/weakness-radar-fixtures.json} is the one
 * agreed statement of expected output for both.
 *
 * <h2>Signals that do not exist, and are therefore absent rather than invented</h2>
 * <b>Speed.</b> §9 wants actual-versus-expected time per question. Neither half exists: no
 * result row carried a per-question time before V24 (so no history has one), and there is no
 * expected-time benchmark anywhere in this schema. §9.2 says a missing signal must not become
 * fake data, so the speed component is dropped and its weight redistributed — see
 * {@link #renormalise}. It is not scored as a neutral 50, because "we don't know" and
 * "average pace" are different statements and only one of them is true.
 *
 * <h2>What this deliberately does not touch</h2>
 * {@code user_topic_progress} — the coarse mastery ladder the device derives and syncs. It is
 * a lossy summary (no recency, no difficulty split, no PYQ split) and re-deriving health from
 * it instead of from the attempts would throw away most of the evidence. It is left exactly
 * as shipped.
 */
@Service
@Transactional
public class TopicHealthService {

    /**
     * Bump on any change to {@link #score} or the constants it reads.
     *
     * <p>Stored on every row, same convention and reasoning as
     * {@link TopicIntelligenceService#ALGORITHM_VERSION}: a stored score has to stay
     * interpretable after the formula changes. Unlike that service, superseded rows are
     * <em>replaced</em> rather than kept — see {@code V24__weakness_radar.sql} for why (per-user
     * rows, no editorial content, reproducible exactly from untouched attempts). A version bump
     * is therefore the whole of §19's historical-recalculation path: the next read of every
     * student recomputes.
     */
    public static final String ALGORITHM_VERSION = "TOPIC_HEALTH_V1";

    /* ------------------------------------------------------------ Evidence windows (§4, §6) */

    /**
     * Evidence older than this is excluded entirely. A year-old attempt says very little about
     * a student's current preparation, and this is also what bounds the aggregate query.
     */
    static final int EVIDENCE_WINDOW_DAYS = 365;

    /** "Recent" means within this many days of now. */
    static final int RECENT_WINDOW_DAYS = 30;

    /**
     * Each window needs this many answered questions before the two are compared.
     *
     * <p>This is what stops §21's "one bad session" from producing a trend: five answers is
     * the floor at which a difference between two windows is worth reading at all.
     */
    static final int MIN_WINDOW_ATTEMPTS = 5;

    /**
     * Recency half-life for the weighted accuracy. A 45-day-old answer counts half as much as
     * today's.
     */
    static final double HALF_LIFE_DAYS = 45.0;

    /**
     * The weight an old attempt can never fall below. §6 wants recent performance to dominate
     * but historical performance not to disappear, and §21 wants very old data de-emphasised
     * rather than discarded — a floor is what expresses both at once.
     */
    static final double RECENCY_FLOOR = 0.15;

    /* --------------------------------------------------------------- Component weights (§5) */
    /*
     * The supplied §5 starting weights, verbatim. They are v1 estimates and are expected to
     * change, which is exactly why they are named constants in a versioned service rather than
     * numbers inside a query.
     *
     * A component with no evidence is DROPPED and the rest renormalised to 1.0 — never
     * replaced with a neutral score. See renormalise().
     */
    static final double W_ACCURACY = 0.30;
    static final double W_TREND = 0.20;
    static final double W_SPEED = 0.15;
    static final double W_CONSISTENCY = 0.10;
    static final double W_DIFFICULTY = 0.10;
    static final double W_PYQ = 0.10;
    static final double W_RETENTION = 0.05;

    static {
        double sum = W_ACCURACY + W_TREND + W_SPEED + W_CONSISTENCY + W_DIFFICULTY + W_PYQ + W_RETENTION;
        // Asserted for the same reason TopicIntelligenceService asserts its own: a silent
        // drift here rescales every score in the system with no visible symptom.
        if (Math.abs(sum - 1.0) > 1e-9) {
            throw new IllegalStateException("Topic health weights must sum to 1.00 but sum to " + sum);
        }
    }

    /* ------------------------------------------------------------------- Component tuning */

    /** A session/attempt needs this many answers before its accuracy joins the variance series. */
    static final int MIN_EVENT_ANSWERS = 3;

    /** Fewer qualifying events than this and there is no variance to speak of (§10). */
    static final int MIN_EVENTS_FOR_CONSISTENCY = 3;

    /**
     * Standard-deviation multiplier for the consistency score: {@code 100 - 2 * stdDev}. A
     * student swinging +/-25 percentage points scores 50; one holding +/-5 scores 90.
     */
    static final double CONSISTENCY_STDDEV_MULTIPLIER = 2.0;

    /** Below this many PYQ answers the PYQ signal is dropped rather than trusted (§8, §21). */
    static final int MIN_PYQ_ATTEMPTS = 5;

    /** PYQ answers at which PYQ coverage counts as fully established, for confidence. */
    static final int PYQ_COVERAGE_TARGET = 10;

    /*
     * Expected accuracy at the easiest and hardest end of the difficulty scale.
     *
     * This is what makes the difficulty term fair rather than punitive (§7): performance is
     * measured against what that difficulty should produce, so answering hard questions at
     * hard-question accuracy scores neutral. Combined with the term's 10% weight, no amount of
     * attempting very hard questions can move health by more than ten points through it.
     *
     * Judgement constants, not derived from data — there is no per-difficulty accuracy baseline
     * in this database to derive them from yet, and inventing one from the question bank's own
     * distribution would be circular.
     */
    static final double EXPECTED_ACCURACY_EASIEST = 75.0;
    static final double EXPECTED_ACCURACY_HARDEST = 45.0;

    /** Midpoint a difficulty bucket scores when it performs exactly as expected. */
    private static final double DIFFICULTY_NEUTRAL = 50.0;

    /**
     * Midpoint of the trend term: flat performance is neither credit nor penalty, so a topic
     * with no movement scores the same as one whose trend cannot be measured would have, had
     * the term not been dropped instead.
     */
    private static final double TREND_NEUTRAL = 50.0;

    /* ----------------------------------------------------------------- Confidence weights */

    static final double CW_EVIDENCE = 0.40;
    static final double CW_RECENCY = 0.20;
    static final double CW_CONSISTENCY = 0.15;
    static final double CW_DIFFICULTY_COVERAGE = 0.15;
    static final double CW_PYQ_COVERAGE = 0.10;

    /** An attempt this recent contributes full recency confidence. */
    static final int CONFIDENCE_FRESH_DAYS = 14;

    /** At or beyond this age, recency confidence bottoms out (it never reaches zero). */
    static final int CONFIDENCE_STALE_DAYS = 180;

    private static final double CONFIDENCE_STALE_FLOOR = 0.2;

    /* -------------------------------------------------------------- State thresholds (§12) */

    /** Health at or above this, with reliable-enough evidence, is STRONG. */
    static final double STRONG_HEALTH_FLOOR = 70.0;

    /** Health at or below this, with reliable-enough evidence, is NEEDS_ATTENTION. */
    static final double ATTENTION_HEALTH_CEILING = 55.0;

    /**
     * Below this confidence the radar refuses to assert either STRONG or NEEDS_ATTENTION and
     * reports DEVELOPING instead. This is the mechanism §11 asks for: confidence exists to
     * prevent unreliable recommendations, not to be displayed.
     */
    static final double MIN_CONFIDENCE_FOR_VERDICT = 45.0;

    /**
     * Improvement, in percentage points, that counts as genuinely improving.
     *
     * <p>Deliberately lower than {@link #DECLINE_DELTA}: being generous about recognising
     * progress and conservative about declaring decline is the right asymmetry for a student
     * looking at their own preparation, and §6 explicitly forbids labelling an improving
     * student weak.
     */
    static final double IMPROVING_DELTA = 12.0;

    /** Decline, in percentage points, that counts as a real regression rather than noise. */
    static final double DECLINE_DELTA = 15.0;

    /** Historical accuracy a topic must have had to be called "previously strong" (§12). */
    static final double PREVIOUSLY_STRONG_ACCURACY = 75.0;

    /* ------------------------------------------------------------------------- Cache policy */

    /**
     * How long a computed row stays usable with no new attempts.
     *
     * <p>Non-zero because health legitimately drifts with the calendar alone — recency weights
     * decay daily and the 30-day window slides — so a row computed a week ago is describing a
     * student's evidence as it looked a week ago. Non-trivial because recomputing on every
     * read would spend a grouped aggregate to change a number by a fraction of a point.
     */
    static final int MAX_CACHE_AGE_HOURS = 24;

    private final TopicEvidenceRepository evidence;
    private final UserTopicHealthRepository health;
    private final TopicRepository topics;
    private final DifficultyLevelRepository difficultyLevels;

    public TopicHealthService(TopicEvidenceRepository evidence,
                               UserTopicHealthRepository health,
                               TopicRepository topics,
                               DifficultyLevelRepository difficultyLevels) {
        this.evidence = evidence;
        this.health = health;
        this.topics = topics;
        this.difficultyLevels = difficultyLevels;
    }

    /* ============================================================== Public entry points */

    /**
     * This student's health rows, recomputing first if the cache is stale.
     *
     * <p>Recompute-on-read rather than a scheduled job or a database trigger. A student's
     * inputs change every time they finish a quiz — unlike
     * {@link TopicIntelligenceService}, whose inputs only change when an admin edits content,
     * which is why that one is admin-triggered. An in-process scheduler was already ruled out
     * for this project: on Cloud Run with scale-to-zero it fires only while some instance
     * happens to be alive, which can be never (see {@link ReminderService}).
     */
    public List<UserTopicHealth> healthForUser(User user) {
        if (isStale(user.getId())) {
            recompute(user);
        }
        return health.findForUserAndVersion(user.getId(), ALGORITHM_VERSION);
    }

    /**
     * This student's health rows exactly as stored, with no staleness check and no recompute.
     *
     * <p>For the admin debug view (§22): someone investigating "why does the app say I'm weak
     * in this topic?" needs to see the rows the student was actually served. Recomputing first
     * could resolve the very thing being investigated and leave no trace of it.
     */
    @Transactional(readOnly = true)
    public List<UserTopicHealth> healthForUserWithoutRecompute(User user) {
        return health.findForUserAndVersion(user.getId(), ALGORITHM_VERSION);
    }

    /**
     * Recomputes and replaces every health row for one student.
     *
     * <p>Replace-wholesale rather than update-in-place, so a topic whose evidence has aged out
     * of the window loses its row instead of keeping a stale verdict forever.
     */
    public List<UserTopicHealth> recompute(User user) {
        /*
         * Truncated to microseconds, which is all a Postgres TIMESTAMPTZ can hold.
         *
         * Not cosmetic. OffsetDateTime.now() carries nanoseconds, so without this the value
         * stamped on the returned in-memory entities and the value a later read loads back from
         * the database differ in their last three digits — meaning POST /recompute and a
         * subsequent GET report different computedAt for the *same* computation. A client that
         * stores one and compares it against the other (the mobile radar cache stores exactly
         * this field) would see a change that never happened.
         *
         * Same reasoning as recordTopicPractice's rounding of accuracy to two places to match
         * its NUMERIC(5,2) column: send the column precisely what it can store, so the value
         * this service believes it wrote is the value that comes back.
         *
         * Found by a full-suite failure in cachedHealthIsReusedUntilNewPracticeArrives, which
         * compared the two and differed by 100 nanoseconds.
         */
        OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
        OffsetDateTime since = now.minusDays(EVIDENCE_WINDOW_DAYS);

        Map<UUID, List<EvidenceEvent>> byTopic = new HashMap<>();
        collect(byTopic, evidence.practiceEvidence(user.getId(), since));
        collect(byTopic, evidence.mockEvidence(user.getId(), since));

        DifficultyScale scale = difficultyScale();

        /*
         * Deleted before the new rows are built, and flushed, for the same reason
         * TopicIntelligenceService.recompute flushes: Hibernate is free to order an insert
         * before a pending delete, and these rows share their synthetic ids with the ones being
         * replaced.
         *
         * Nothing was read as a managed entity first (isStale() uses scalar projections
         * precisely so this holds) — re-saving ids that are still managed after a bulk delete
         * is the exact shape that produced real 500s in TopicPriorityRepository's history.
         */
        health.deleteByUserId(user.getId());
        health.flush();

        if (byTopic.isEmpty()) {
            return List.of();
        }

        // One fetch for every topic that has evidence, rather than one per topic.
        Map<UUID, Topic> topicsById = new HashMap<>();
        for (Topic topic : topics.findAllById(byTopic.keySet())) {
            topicsById.put(topic.getId(), topic);
        }

        List<UserTopicHealth> rows = new ArrayList<>();
        OffsetDateTime evidenceThrough = now;

        for (Map.Entry<UUID, List<EvidenceEvent>> entry : byTopic.entrySet()) {
            Topic topic = topicsById.get(entry.getKey());
            // A topic deleted server-side after the student practised it. The attempt is real
            // history, but there is nothing left to name or rank, so no row is written.
            if (topic == null) continue;

            TopicHealthResult result = score(entry.getKey(), entry.getValue(), now, scale);
            if (result == null) continue;

            UserTopicHealth row = new UserTopicHealth();
            row.setId(UserTopicHealth.idFor(user.getId(), topic.getId()));
            row.setUser(user);
            row.setTopic(topic);
            row.setAlgorithmVersion(ALGORITHM_VERSION);
            row.setHealthScore(result.health());
            row.setConfidenceScore(result.confidence());
            row.setState(result.state());
            row.setTrendDirection(result.trend());
            row.setTrendDelta(result.trendDelta());
            row.setEvidenceLevel(result.evidenceLevel());
            row.setAttemptedCount(result.attemptedCount());
            row.setCorrectCount(result.correctCount());
            row.setRecentAttemptedCount(result.recentAttemptedCount());
            row.setRecentAccuracy(result.recentAccuracy());
            row.setHistoricalAccuracy(result.historicalAccuracy());
            row.setPyqAttemptedCount(result.pyqAttemptedCount());
            row.setPyqAccuracy(result.pyqAccuracy());
            row.setConsistencyScore(result.consistency());
            row.setSpeedRatio(result.speedRatio());
            row.setInputs(result.inputs());
            row.setLastAttemptAt(result.lastAttemptAt());
            row.setEvidenceThroughAt(evidenceThrough);
            row.setComputedAt(now);
            rows.add(row);
        }

        return health.saveAll(rows);
    }

    /**
     * Whether the cached rows are missing, superseded, or older than the student's newest
     * attempt.
     *
     * <p>Uses scalar projections only — see {@link #recompute}'s comment on why nothing here
     * may load a managed entity.
     */
    private boolean isStale(UUID userId) {
        OffsetDateTime latestAttempt = latestAttemptAt(userId);
        long rowCount = health.countForUserAndVersion(userId, ALGORITHM_VERSION);

        /*
         * "Has this student any evidence a recompute could actually use", not merely "have they
         * ever practised". The distinction is load-bearing: latestAttemptAt() sees their whole
         * history, but the evidence query is bounded to EVIDENCE_WINDOW_DAYS. A student
         * returning after a year has a real newest-attempt timestamp and yet nothing in window,
         * so comparing the two directly would find the cache empty, recompute, write no rows,
         * and conclude it was stale again on the very next read - a recompute per read, forever.
         *
         * Found by reading the diff rather than by a failing test, because every fixture and
         * every test student has recent attempts by construction.
         */
        boolean anyEvidenceInWindow = latestAttempt != null
                && latestAttempt.isAfter(OffsetDateTime.now().minusDays(EVIDENCE_WINDOW_DAYS));

        if (!anyEvidenceInWindow) {
            // Nothing to compute from. Recompute once if rows exist, so stale verdicts are
            // cleared rather than served; after that there is nothing to do and this settles.
            return rowCount > 0;
        }
        if (rowCount == 0) return true;

        OffsetDateTime evidenceThrough = health.oldestEvidenceThrough(userId, ALGORITHM_VERSION);
        if (evidenceThrough == null || latestAttempt.isAfter(evidenceThrough)) return true;

        OffsetDateTime computedAt = health.oldestComputedAt(userId, ALGORITHM_VERSION);
        return computedAt == null
                || computedAt.isBefore(OffsetDateTime.now().minusHours(MAX_CACHE_AGE_HOURS));
    }

    /** The student's most recent attempt of either kind, or null if they have none. */
    public OffsetDateTime latestAttemptAt(UUID userId) {
        OffsetDateTime practice = evidence.latestPracticeAt(userId);
        OffsetDateTime mock = evidence.latestMockAt(userId);
        if (practice == null) return mock;
        if (mock == null) return practice;
        return practice.isAfter(mock) ? practice : mock;
    }

    /* ==================================================================== The formula */

    /**
     * One topic's diagnosis from its evidence. Pure, deterministic, and the only implementation
     * of the v1 formula.
     *
     * @param now injected rather than read from the clock, so the §23 recency and trend cases
     *            are expressible as fixtures instead of as sleeps
     * @return null when there is no usable evidence at all (no row should exist)
     */
    static TopicHealthResult score(UUID topicId,
                                    List<EvidenceEvent> events,
                                    OffsetDateTime now,
                                    DifficultyScale scale) {
        if (events == null || events.isEmpty()) return null;

        int attempted = 0;
        int correct = 0;
        int timedAnswers = 0;
        OffsetDateTime lastAttemptAt = null;
        for (EvidenceEvent e : events) {
            attempted += e.answered();
            correct += e.correct();
            timedAnswers += e.timedAnswers();
            if (lastAttemptAt == null || e.occurredAt().isAfter(lastAttemptAt)) {
                lastAttemptAt = e.occurredAt();
            }
        }
        if (attempted == 0) return null;

        EvidenceLevel evidenceLevel = EvidenceLevel.forAttempts(attempted);

        /* -------------------------------------------------------------- windows */
        List<EvidenceEvent> sortedNewestFirst = new ArrayList<>(events);
        sortedNewestFirst.sort(Comparator.comparing(EvidenceEvent::occurredAt).reversed());

        OffsetDateTime recentCutoff = now.minusDays(RECENT_WINDOW_DAYS);
        List<EvidenceEvent> recent = new ArrayList<>();
        for (EvidenceEvent e : sortedNewestFirst) {
            if (!e.occurredAt().isBefore(recentCutoff)) recent.add(e);
        }
        boolean staleRecentWindow = false;
        if (answeredIn(recent) < MIN_WINDOW_ATTEMPTS) {
            /*
             * The student has not practised this topic lately. Rather than report no recent
             * performance at all, fall back to their newest attempts whatever their age — and
             * flag it, which lowers confidence via the recency factor below. §21 asks for very
             * old data to be de-emphasised, not treated as current; that is what the flag plus
             * the recency factor do together, and it is why this does not simply fabricate a
             * trend from a single old session.
             */
            recent = new ArrayList<>();
            int gathered = 0;
            for (EvidenceEvent e : sortedNewestFirst) {
                recent.add(e);
                // Flag only when the fallback genuinely had to reach past the recent window.
                // A brand-new student with three answers from today has a thin window, not a
                // stale one, and halving their confidence for it would be wrong.
                if (e.occurredAt().isBefore(recentCutoff)) staleRecentWindow = true;
                gathered += e.answered();
                if (gathered >= MIN_WINDOW_ATTEMPTS) break;
            }
        }
        Set<String> recentIds = new HashSet<>();
        for (EvidenceEvent e : recent) recentIds.add(e.eventId());
        List<EvidenceEvent> historical = new ArrayList<>();
        for (EvidenceEvent e : events) {
            if (!recentIds.contains(e.eventId())) historical.add(e);
        }

        int recentAttempted = answeredIn(recent);
        int historicalAttempted = answeredIn(historical);
        Double recentAccuracy = plainAccuracy(recent);
        Double historicalAccuracy = plainAccuracy(historical);

        boolean windowsComparable = recentAttempted >= MIN_WINDOW_ATTEMPTS
                && historicalAttempted >= MIN_WINDOW_ATTEMPTS;
        Double trendDelta = windowsComparable ? recentAccuracy - historicalAccuracy : null;
        PerformanceTrend trend;
        if (trendDelta == null) {
            trend = PerformanceTrend.NOT_ENOUGH_DATA;
        } else if (trendDelta >= IMPROVING_DELTA) {
            trend = PerformanceTrend.IMPROVING;
        } else if (trendDelta <= -DECLINE_DELTA) {
            trend = PerformanceTrend.DECLINING;
        } else {
            trend = PerformanceTrend.STABLE;
        }

        /* ----------------------------------------------------------- components */
        Map<String, Double> components = new LinkedHashMap<>();
        Map<String, Double> weights = new LinkedHashMap<>();
        Map<String, String> dropped = new LinkedHashMap<>();

        components.put("accuracy", weightedAccuracy(events, now));
        weights.put("accuracy", W_ACCURACY);

        if (trendDelta != null) {
            // Direction as a 0-100 score: flat is 50, +25pp is 75, -25pp is 25.
            components.put("recentTrend", clamp(TREND_NEUTRAL + trendDelta, 0, 100));
            weights.put("recentTrend", W_TREND);
        } else {
            dropped.put("recentTrend", "NOT_ENOUGH_EVIDENCE_IN_BOTH_WINDOWS");
        }

        // Never available under v1. Recorded as dropped rather than silently omitted, so the
        // admin debug view says *why* the weight moved.
        dropped.put("speed", "NO_EXPECTED_TIME_BENCHMARKS");

        Double consistency = consistency(events);
        if (consistency != null) {
            components.put("consistency", consistency);
            weights.put("consistency", W_CONSISTENCY);
        } else {
            dropped.put("consistency", "FEWER_THAN_" + MIN_EVENTS_FOR_CONSISTENCY + "_QUALIFYING_SESSIONS");
        }

        Double difficulty = difficultyHandling(events, scale);
        if (difficulty != null) {
            components.put("difficultyHandling", difficulty);
            weights.put("difficultyHandling", W_DIFFICULTY);
        } else {
            dropped.put("difficultyHandling", "NO_RESOLVABLE_DIFFICULTY_METADATA");
        }

        int pyqAttempted = 0;
        for (EvidenceEvent e : events) if (e.pyq()) pyqAttempted += e.answered();
        Double pyqAccuracy = null;
        if (pyqAttempted >= MIN_PYQ_ATTEMPTS) {
            List<EvidenceEvent> pyqEvents = new ArrayList<>();
            for (EvidenceEvent e : events) if (e.pyq()) pyqEvents.add(e);
            pyqAccuracy = weightedAccuracy(pyqEvents, now);
            components.put("pyqPerformance", pyqAccuracy);
            weights.put("pyqPerformance", W_PYQ);
        } else {
            // Excluded, not assumed. §21: missing PYQ metadata means no PYQ signal, never
            // "treat these as non-PYQ and score them anyway".
            dropped.put("pyqPerformance", "FEWER_THAN_" + MIN_PYQ_ATTEMPTS + "_PYQ_ANSWERS");
        }

        if (historicalAccuracy != null) {
            // Decay specifically, not direction: only a drop from the historical level counts
            // against retention, so improving never scores below holding steady.
            components.put("retention",
                    clamp(100 - CONSISTENCY_STDDEV_MULTIPLIER * Math.max(0, historicalAccuracy - recentAccuracy), 0, 100));
            weights.put("retention", W_RETENTION);
        } else {
            dropped.put("retention", "NO_HISTORICAL_WINDOW");
        }

        Map<String, Double> effectiveWeights = renormalise(weights);
        double healthScore = 0;
        for (Map.Entry<String, Double> c : components.entrySet()) {
            healthScore += c.getValue() * effectiveWeights.get(c.getKey());
        }

        /* ---------------------------------------------------------- confidence */
        Map<String, Double> confidenceFactors = new LinkedHashMap<>();
        Map<String, Double> confidenceWeights = new LinkedHashMap<>();

        confidenceFactors.put("evidence", evidenceFactor(evidenceLevel));
        confidenceWeights.put("evidence", CW_EVIDENCE);

        confidenceFactors.put("recency", recencyFactor(lastAttemptAt, now, staleRecentWindow));
        confidenceWeights.put("recency", CW_RECENCY);

        if (consistency != null) {
            confidenceFactors.put("consistency", consistency / 100.0);
            confidenceWeights.put("consistency", CW_CONSISTENCY);
        }
        Double coverage = difficultyCoverage(events, scale);
        if (coverage != null) {
            confidenceFactors.put("difficultyCoverage", coverage);
            confidenceWeights.put("difficultyCoverage", CW_DIFFICULTY_COVERAGE);
        }
        if (pyqAttempted > 0) {
            confidenceFactors.put("pyqCoverage",
                    Math.min(1.0, pyqAttempted / (double) PYQ_COVERAGE_TARGET));
            confidenceWeights.put("pyqCoverage", CW_PYQ_COVERAGE);
        }

        Map<String, Double> effectiveConfidenceWeights = renormalise(confidenceWeights);
        double confidenceScore = 0;
        for (Map.Entry<String, Double> f : confidenceFactors.entrySet()) {
            confidenceScore += f.getValue() * 100.0 * effectiveConfidenceWeights.get(f.getKey());
        }

        /* --------------------------------------------------------------- state */
        TopicHealthState state = resolveState(
                evidenceLevel, healthScore, confidenceScore, trendDelta, historicalAccuracy, recentAccuracy);

        Map<String, Object> inputs = new LinkedHashMap<>();
        inputs.put("algorithmVersion", ALGORITHM_VERSION);
        Map<String, Object> componentDetail = new LinkedHashMap<>();
        for (Map.Entry<String, Double> c : components.entrySet()) {
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("score", round2(c.getValue()));
            detail.put("declaredWeight", weights.get(c.getKey()));
            detail.put("effectiveWeight", round4(effectiveWeights.get(c.getKey())));
            componentDetail.put(c.getKey(), detail);
        }
        inputs.put("components", componentDetail);
        inputs.put("droppedComponents", dropped);
        inputs.put("confidenceFactors", confidenceFactors);
        inputs.put("eventCount", events.size());
        inputs.put("recentWindowDays", RECENT_WINDOW_DAYS);
        inputs.put("staleRecentWindow", staleRecentWindow);
        inputs.put("recencyHalfLifeDays", HALF_LIFE_DAYS);
        inputs.put("timedAnswerCount", timedAnswers);

        return new TopicHealthResult(
                topicId,
                round2(healthScore),
                round2(confidenceScore),
                state,
                trend,
                trendDelta == null ? null : round2(trendDelta),
                evidenceLevel,
                attempted,
                correct,
                recentAttempted,
                recentAccuracy == null ? null : round2(recentAccuracy),
                historicalAccuracy == null ? null : round2(historicalAccuracy),
                pyqAttempted,
                pyqAccuracy == null ? null : round2(pyqAccuracy),
                consistency == null ? null : round2(consistency),
                // Always null in v1 — see the class comment. Not a bug to be fixed by
                // substituting 1.0.
                null,
                lastAttemptAt,
                inputs);
    }

    /**
     * The six states of §12, resolved in a fixed order.
     *
     * <p>The order is the design, not an implementation detail:
     * <ol>
     *   <li>No evidence beats everything — §21 is explicit that a never-practised or barely
     *       practised topic is not weak.</li>
     *   <li>A real regression from a genuinely strong past is its own finding, and would
     *       otherwise be flattened into NEEDS_ATTENTION, losing the fact that the student
     *       once knew this.</li>
     *   <li>STRONG before IMPROVING, so a student who is strong <em>and</em> rising reads as
     *       strong; the trend is still stored separately and shown alongside.</li>
     *   <li>IMPROVING before NEEDS_ATTENTION, which is §6's requirement — a student climbing
     *       from 51% to 79% must not be told they are weak.</li>
     * </ol>
     */
    static TopicHealthState resolveState(EvidenceLevel evidenceLevel,
                                          double health,
                                          double confidence,
                                          Double trendDelta,
                                          Double historicalAccuracy,
                                          Double recentAccuracy) {
        if (!evidenceLevel.isSufficient()) return TopicHealthState.INSUFFICIENT_DATA;

        boolean previouslyStrong = historicalAccuracy != null
                && historicalAccuracy >= PREVIOUSLY_STRONG_ACCURACY;
        boolean declined = trendDelta != null && trendDelta <= -DECLINE_DELTA;
        if (previouslyStrong && declined) return TopicHealthState.NEEDS_REVISION;

        boolean reliable = confidence >= MIN_CONFIDENCE_FOR_VERDICT;
        if (health >= STRONG_HEALTH_FLOOR && reliable) return TopicHealthState.STRONG;
        if (trendDelta != null && trendDelta >= IMPROVING_DELTA) return TopicHealthState.IMPROVING;
        if (health <= ATTENTION_HEALTH_CEILING && reliable) return TopicHealthState.NEEDS_ATTENTION;
        return TopicHealthState.DEVELOPING;
    }

    /* ------------------------------------------------------------------- component maths */

    /**
     * Scales the supplied weights so the ones that survived sum to 1.0.
     *
     * <p>This is the mechanism that makes a missing signal honest. The alternative — scoring an
     * absent component at a neutral 50 — would drag every score toward the middle and quietly
     * assert something about the student that was never measured. With speed permanently absent
     * in v1, accuracy's declared 30% becomes an effective ~35%, and so on.
     */
    static Map<String, Double> renormalise(Map<String, Double> weights) {
        double total = 0;
        for (double w : weights.values()) total += w;
        Map<String, Double> out = new LinkedHashMap<>();
        if (total <= 0) return out;
        for (Map.Entry<String, Double> e : weights.entrySet()) {
            out.put(e.getKey(), e.getValue() / total);
        }
        return out;
    }

    /** Recency-weighted accuracy as a percentage. Old answers count less, never nothing. */
    private static double weightedAccuracy(List<EvidenceEvent> events, OffsetDateTime now) {
        double weightedCorrect = 0;
        double weightedAnswered = 0;
        for (EvidenceEvent e : events) {
            double w = recencyWeight(e.occurredAt(), now);
            weightedCorrect += w * e.correct();
            weightedAnswered += w * e.answered();
        }
        return weightedAnswered <= 0 ? 0 : 100.0 * weightedCorrect / weightedAnswered;
    }

    static double recencyWeight(OffsetDateTime occurredAt, OffsetDateTime now) {
        double ageDays = Math.max(0, Duration.between(occurredAt, now).toMinutes() / (60.0 * 24.0));
        return Math.max(RECENCY_FLOOR, Math.pow(0.5, ageDays / HALF_LIFE_DAYS));
    }

    /** Unweighted accuracy over a window, or null if the window has no answers. */
    private static Double plainAccuracy(List<EvidenceEvent> events) {
        int answered = answeredIn(events);
        if (answered == 0) return null;
        int correct = 0;
        for (EvidenceEvent e : events) correct += e.correct();
        return 100.0 * correct / answered;
    }

    private static int answeredIn(List<EvidenceEvent> events) {
        int total = 0;
        for (EvidenceEvent e : events) total += e.answered();
        return total;
    }

    /**
     * How stable performance is across sessions (§10).
     *
     * <p>Grouped per attempt-event, not per question: the question here is whether the
     * student's <em>sessions</em> come out alike, and 80/82/78/81/79 is a different preparation
     * state from 95/42/91/38/87 at the same average. Events are merged by id first, because one
     * session can produce several evidence rows (one per difficulty and PYQ flag) and treating
     * those as separate sittings would understate variance.
     */
    static Double consistency(List<EvidenceEvent> events) {
        Map<String, int[]> byEvent = new LinkedHashMap<>();
        for (EvidenceEvent e : events) {
            int[] acc = byEvent.computeIfAbsent(e.eventId(), k -> new int[2]);
            acc[0] += e.answered();
            acc[1] += e.correct();
        }
        List<Double> series = new ArrayList<>();
        for (int[] acc : byEvent.values()) {
            if (acc[0] >= MIN_EVENT_ANSWERS) series.add(100.0 * acc[1] / acc[0]);
        }
        if (series.size() < MIN_EVENTS_FOR_CONSISTENCY) return null;

        double mean = 0;
        for (double v : series) mean += v;
        mean /= series.size();
        double variance = 0;
        for (double v : series) variance += (v - mean) * (v - mean);
        variance /= series.size();
        return clamp(100 - CONSISTENCY_STDDEV_MULTIPLIER * Math.sqrt(variance), 0, 100);
    }

    /**
     * How the student handles difficulty, measured against what each difficulty should produce
     * (§7).
     *
     * <p>Bounded by construction. A bucket that performs exactly as expected scores the
     * neutral 50; over-performing raises it, under-performing lowers it, and the whole term
     * carries 10% of the weight. So attempting a pile of very hard questions cannot swing
     * health — which is the distortion §7 asks to be prevented — while genuinely handling hard
     * questions well still shows up.
     *
     * @return null when no attempt has difficulty metadata this database recognises, in which
     *         case the term is dropped rather than guessed (§21)
     */
    static Double difficultyHandling(List<EvidenceEvent> events, DifficultyScale scale) {
        double weightedScore = 0;
        int totalAnswered = 0;
        Map<String, int[]> byCode = new LinkedHashMap<>();
        for (EvidenceEvent e : events) {
            // An unrecognised difficulty code contributes nothing rather than being bucketed
            // as medium — a question whose difficulty this database cannot resolve is not
            // evidence about how the student handles difficulty.
            if (scale.hardnessOf(e.difficultyCode()) == null) continue;
            int[] acc = byCode.computeIfAbsent(e.difficultyCode(), k -> new int[2]);
            acc[0] += e.answered();
            acc[1] += e.correct();
        }
        for (Map.Entry<String, int[]> entry : byCode.entrySet()) {
            int answered = entry.getValue()[0];
            if (answered == 0) continue;
            double observed = 100.0 * entry.getValue()[1] / answered;
            double expected = scale.expectedAccuracyOf(entry.getKey());
            weightedScore += answered * clamp(observed - expected + DIFFICULTY_NEUTRAL, 0, 100);
            totalAnswered += answered;
        }
        return totalAnswered == 0 ? null : weightedScore / totalAnswered;
    }

    /**
     * What share of the difficulty scale the evidence actually spans, for confidence (§11).
     *
     * <p>A student judged entirely on easy questions is a weaker diagnosis than one judged
     * across the range, whatever the accuracy — which is a confidence question, not a health
     * one.
     */
    static Double difficultyCoverage(List<EvidenceEvent> events, DifficultyScale scale) {
        if (scale.levelCount() == 0) return null;
        Set<String> seen = new TreeSet<>();
        for (EvidenceEvent e : events) {
            if (e.difficultyCode() != null && scale.hardnessOf(e.difficultyCode()) != null) {
                seen.add(e.difficultyCode());
            }
        }
        if (seen.isEmpty()) return null;
        return Math.min(1.0, seen.size() / (double) scale.levelCount());
    }

    private static double evidenceFactor(EvidenceLevel level) {
        return switch (level) {
            case INSUFFICIENT_DATA -> 0.0;
            case EARLY_SIGNAL -> 0.35;
            case DEVELOPING_CONFIDENCE -> 0.70;
            case RELIABLE -> 1.0;
        };
    }

    /**
     * How much the age of the evidence supports trusting it.
     *
     * <p>Never reaches zero: old evidence is weak evidence, not no evidence. The stale-window
     * flag halves whatever the age alone earned, because a topic the student has not touched in
     * a month has a "recent" window that is recent only by fallback.
     */
    private static double recencyFactor(OffsetDateTime lastAttemptAt, OffsetDateTime now, boolean staleWindow) {
        double ageDays = Math.max(0, Duration.between(lastAttemptAt, now).toMinutes() / (60.0 * 24.0));
        double base;
        if (ageDays <= CONFIDENCE_FRESH_DAYS) {
            base = 1.0;
        } else if (ageDays >= CONFIDENCE_STALE_DAYS) {
            base = CONFIDENCE_STALE_FLOOR;
        } else {
            double span = CONFIDENCE_STALE_DAYS - CONFIDENCE_FRESH_DAYS;
            double progress = (ageDays - CONFIDENCE_FRESH_DAYS) / span;
            base = 1.0 - progress * (1.0 - CONFIDENCE_STALE_FLOOR);
        }
        return staleWindow ? Math.max(CONFIDENCE_STALE_FLOOR, base * 0.5) : base;
    }

    /* ----------------------------------------------------------------------- plumbing */

    /** Reshapes a repository row batch into events keyed by topic. */
    private static void collect(Map<UUID, List<EvidenceEvent>> byTopic, List<Object[]> rows) {
        for (Object[] row : rows) {
            UUID topicId = (UUID) row[0];
            Long totalTimeMs = row[7] == null ? null : ((Number) row[7]).longValue();
            byTopic.computeIfAbsent(topicId, k -> new ArrayList<>()).add(new EvidenceEvent(
                    topicId,
                    (String) row[1],
                    (OffsetDateTime) row[2],
                    (String) row[3],
                    Boolean.TRUE.equals(row[4]),
                    ((Number) row[5]).intValue(),
                    row[6] == null ? 0 : ((Number) row[6]).intValue(),
                    totalTimeMs,
                    row[8] == null ? 0 : ((Number) row[8]).intValue()));
        }
    }

    /**
     * The active difficulty scale, built from {@code difficulty_levels.display_order}.
     *
     * <p>Read from the database rather than hardcoded, because this project deliberately made
     * difficulty admin-editable data (V3) — an exam-domain constant in code is the thing the
     * exam-structure work set out to remove.
     */
    DifficultyScale difficultyScale() {
        List<DifficultyLevel> levels = difficultyLevels.findByActiveTrueOrderByDisplayOrderAsc();
        return DifficultyScale.of(levels);
    }

    /* --------------------------------------------------------------------- value types */

    /**
     * One (topic, session-or-attempt, difficulty, PYQ flag) bucket of answered questions.
     *
     * <p>The grain is deliberate: per-event so consistency can be measured across sittings,
     * per-difficulty and per-PYQ so those terms need no second query, and counts rather than
     * individual answers so the payload stays small for a student with years of history.
     *
     * @param totalTimeMs   sum of recorded per-question times, or null when none were recorded
     * @param timedAnswers  how many of {@code answered} carried a time — kept separate from
     *                      {@code totalTimeMs} because a sum alone cannot distinguish a fast
     *                      answer from an unrecorded one
     */
    public record EvidenceEvent(UUID topicId,
                                 String eventId,
                                 OffsetDateTime occurredAt,
                                 String difficultyCode,
                                 boolean pyq,
                                 int answered,
                                 int correct,
                                 Long totalTimeMs,
                                 int timedAnswers) {
    }

    /**
     * The difficulty ladder, normalised to 0 (easiest) .. 1 (hardest).
     *
     * <p>Interpolating expected accuracy across the ladder rather than hardcoding a
     * three-bucket table means adding a fourth difficulty level in the admin console needs no
     * code change — with the current easy/medium/hard it yields exactly 75/60/45.
     */
    public record DifficultyScale(Map<String, Double> hardnessByCode) {

        public static DifficultyScale of(List<DifficultyLevel> orderedLevels) {
            Map<String, Double> hardness = new LinkedHashMap<>();
            int n = orderedLevels.size();
            for (int i = 0; i < n; i++) {
                hardness.put(orderedLevels.get(i).getCode(), n == 1 ? 0.5 : i / (double) (n - 1));
            }
            return new DifficultyScale(hardness);
        }

        /** Null for a code this database does not recognise — the caller must then drop the signal. */
        public Double hardnessOf(String code) {
            return code == null ? null : hardnessByCode.get(code);
        }

        public double expectedAccuracyOf(String code) {
            Double hardness = hardnessOf(code);
            double h = hardness == null ? 0.5 : hardness;
            return EXPECTED_ACCURACY_EASIEST + h * (EXPECTED_ACCURACY_HARDEST - EXPECTED_ACCURACY_EASIEST);
        }

        public int levelCount() {
            return hardnessByCode.size();
        }
    }

    /** The scorer's output for one topic, before it becomes a row or a response. */
    public record TopicHealthResult(UUID topicId,
                                     BigDecimal health,
                                     BigDecimal confidence,
                                     TopicHealthState state,
                                     PerformanceTrend trend,
                                     BigDecimal trendDelta,
                                     EvidenceLevel evidenceLevel,
                                     int attemptedCount,
                                     int correctCount,
                                     int recentAttemptedCount,
                                     BigDecimal recentAccuracy,
                                     BigDecimal historicalAccuracy,
                                     int pyqAttemptedCount,
                                     BigDecimal pyqAccuracy,
                                     BigDecimal consistency,
                                     BigDecimal speedRatio,
                                     OffsetDateTime lastAttemptAt,
                                     Map<String, Object> inputs) {
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static BigDecimal round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal round4(double value) {
        return BigDecimal.valueOf(value).setScale(4, RoundingMode.HALF_UP);
    }
}
