package com.sarkaritaiyaari.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarkaritaiyaari.backend.entity.DifficultyLevel;
import com.sarkaritaiyaari.backend.service.TopicHealthService.DifficultyScale;
import com.sarkaritaiyaari.backend.service.TopicHealthService.EvidenceEvent;
import com.sarkaritaiyaari.backend.service.TopicHealthService.TopicHealthResult;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The supplied spec's §23 test cases, run against the pure scorer.
 *
 * <h2>Why this one is not a {@code @SpringBootTest}</h2>
 * Every other test class in this project boots Spring and talks to the real Neon dev database,
 * because every other test is about an endpoint or a persistence rule. This one is about
 * arithmetic. {@link TopicHealthService#score} takes evidence and a clock and returns numbers,
 * so a Spring context would add ~20 seconds and a network dependency while testing nothing
 * extra — and the recency and trend cases would be untestable at all if "now" came from the
 * system clock instead of being injected.
 *
 * <h2>Why the cases live in a JSON file</h2>
 * {@code sample-data/weakness-radar-fixtures.json} is shared with the TypeScript copy of this
 * algorithm (the signed-out path — see {@link TopicHealthService}'s class comment). Keeping the
 * cases in data rather than in Java means the two implementations are checked against one
 * agreed statement of expected behaviour, not against each other. Expectations are partial by
 * design: each case asserts what it is about, so retuning an unrelated weight does not produce
 * a wall of unrelated failures.
 */
class TopicHealthScoringTest {

    private static final Path FIXTURES =
            Path.of("..", "sample-data", "weakness-radar-fixtures.json");

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void everyFixtureCaseHoldsAndTheFileIsInStepWithTheCode() throws Exception {
        JsonNode root = mapper.readTree(Files.readString(FIXTURES));

        // If the constant is bumped without revisiting the fixtures, the fixtures are stale by
        // definition — every expectation in them was agreed against a specific formula.
        assertThat(root.get("algorithmVersion").asText())
                .as("fixtures were written for a different algorithm version")
                .isEqualTo(TopicHealthService.ALGORITHM_VERSION);

        OffsetDateTime now = OffsetDateTime.parse(root.get("now").asText());
        DifficultyScale scale = scaleFrom(root.get("difficultyLevels"));

        // Scored up front so a case can assert a RELATION to another case — "confidence below
        // the steady one", "health above the easy one". Those pairings are the only way to
        // state §23.7 and §23.8 honestly: both are about a difference between two situations,
        // not about an absolute number either one produces.
        Map<String, TopicHealthResult> results = new LinkedHashMap<>();
        for (JsonNode c : root.get("cases")) {
            String name = c.get("name").asText();
            TopicHealthResult result = TopicHealthService.score(
                    UUID.randomUUID(), eventsFrom(c.get("events")), now, scale);
            assertThat(result).as("case '%s' produced no result at all", name).isNotNull();
            results.put(name, result);
        }

        assertThat(results).as("no fixture cases were loaded").isNotEmpty();

        for (JsonNode c : root.get("cases")) {
            String name = c.get("name").asText();
            TopicHealthResult r = results.get(name);
            JsonNode expect = c.get("expect");
            String as = "case '" + name + "' (" + c.get("specCase").asText() + ")";

            if (expect.has("state")) {
                assertThat(r.state().name()).as(as + " state").isEqualTo(expect.get("state").asText());
            }
            if (expect.has("stateNot")) {
                assertThat(r.state().name()).as(as + " state").isNotEqualTo(expect.get("stateNot").asText());
            }
            if (expect.has("evidenceLevel")) {
                assertThat(r.evidenceLevel().name()).as(as + " evidence level")
                        .isEqualTo(expect.get("evidenceLevel").asText());
            }
            if (expect.has("trend")) {
                assertThat(r.trend().name()).as(as + " trend").isEqualTo(expect.get("trend").asText());
            }
            if (expect.has("healthAtLeast")) {
                assertThat(r.health().doubleValue()).as(as + " health")
                        .isGreaterThanOrEqualTo(expect.get("healthAtLeast").asDouble());
            }
            if (expect.has("healthAtMost")) {
                assertThat(r.health().doubleValue()).as(as + " health")
                        .isLessThanOrEqualTo(expect.get("healthAtMost").asDouble());
            }
            if (expect.has("confidenceAtLeast")) {
                assertThat(r.confidence().doubleValue()).as(as + " confidence")
                        .isGreaterThanOrEqualTo(expect.get("confidenceAtLeast").asDouble());
            }
            if (expect.has("confidenceAtMost")) {
                assertThat(r.confidence().doubleValue()).as(as + " confidence")
                        .isLessThanOrEqualTo(expect.get("confidenceAtMost").asDouble());
            }
            if (expect.has("consistencyAtLeast")) {
                assertThat(r.consistency()).as(as + " consistency").isNotNull();
                assertThat(r.consistency().doubleValue()).as(as + " consistency")
                        .isGreaterThanOrEqualTo(expect.get("consistencyAtLeast").asDouble());
            }
            if (expect.has("consistencyAtMost")) {
                assertThat(r.consistency()).as(as + " consistency").isNotNull();
                assertThat(r.consistency().doubleValue()).as(as + " consistency")
                        .isLessThanOrEqualTo(expect.get("consistencyAtMost").asDouble());
            }
            if (expect.has("trendDeltaAtLeast")) {
                assertThat(r.trendDelta()).as(as + " trend delta").isNotNull();
                assertThat(r.trendDelta().doubleValue()).as(as + " trend delta")
                        .isGreaterThanOrEqualTo(expect.get("trendDeltaAtLeast").asDouble());
            }
            if (expect.has("historicalAccuracyAtLeast")) {
                assertThat(r.historicalAccuracy()).as(as + " historical accuracy").isNotNull();
                assertThat(r.historicalAccuracy().doubleValue()).as(as + " historical accuracy")
                        .isGreaterThanOrEqualTo(expect.get("historicalAccuracyAtLeast").asDouble());
            }
            if (expect.has("pyqAttemptedCount")) {
                assertThat(r.pyqAttemptedCount()).as(as + " PYQ answers")
                        .isEqualTo(expect.get("pyqAttemptedCount").asInt());
            }
            if (expect.has("pyqAccuracyAtMost")) {
                assertThat(r.pyqAccuracy()).as(as + " PYQ accuracy").isNotNull();
                assertThat(r.pyqAccuracy().doubleValue()).as(as + " PYQ accuracy")
                        .isLessThanOrEqualTo(expect.get("pyqAccuracyAtMost").asDouble());
            }
            if (expect.path("pyqAccuracyNull").asBoolean(false)) {
                assertThat(r.pyqAccuracy()).as(as + " PYQ accuracy must be absent").isNull();
            }
            if (expect.path("speedRatioNull").asBoolean(false)) {
                assertThat(r.speedRatio()).as(as + " speed must be absent, not defaulted").isNull();
            }
            if (expect.has("timedAnswerCount")) {
                assertThat(r.inputs().get("timedAnswerCount")).as(as + " timed answers")
                        .isEqualTo(expect.get("timedAnswerCount").asInt());
            }
            if (expect.has("staleRecentWindow")) {
                assertThat(r.inputs().get("staleRecentWindow")).as(as + " stale-window flag")
                        .isEqualTo(expect.get("staleRecentWindow").asBoolean());
            }
            if (expect.has("droppedComponent")) {
                @SuppressWarnings("unchecked")
                Map<String, String> dropped = (Map<String, String>) r.inputs().get("droppedComponents");
                assertThat(dropped).as(as + " dropped components")
                        .containsKey(expect.get("droppedComponent").asText());
                @SuppressWarnings("unchecked")
                Map<String, Object> components = (Map<String, Object>) r.inputs().get("components");
                assertThat(components).as(as + " a dropped component must not also be scored")
                        .doesNotContainKey(expect.get("droppedComponent").asText());
            }
            if (expect.has("healthAboveCase")) {
                TopicHealthResult other = results.get(expect.get("healthAboveCase").asText());
                assertThat(other).as(as + " references an unknown case").isNotNull();
                double diff = r.health().doubleValue() - other.health().doubleValue();
                assertThat(diff).as(as + " health must exceed '%s'", expect.get("healthAboveCase").asText())
                        .isGreaterThan(0);
                if (expect.has("healthAboveCaseByAtMost")) {
                    // The bound is the point: §7 and §8 both require a signal to matter without
                    // being able to dominate. A term that swung health further than its own
                    // weight allows would pass the "exceeds" check and still be wrong.
                    assertThat(diff).as(as + " the difference must stay bounded")
                            .isLessThanOrEqualTo(expect.get("healthAboveCaseByAtMost").asDouble());
                }
            }
            if (expect.has("confidenceBelowCase")) {
                TopicHealthResult other = results.get(expect.get("confidenceBelowCase").asText());
                assertThat(other).as(as + " references an unknown case").isNotNull();
                assertThat(r.confidence().doubleValue())
                        .as(as + " confidence must be below '%s'", expect.get("confidenceBelowCase").asText())
                        .isLessThan(other.confidence().doubleValue());
            }
        }
    }

    /**
     * §23.15 — the algorithm version can change without touching raw attempts.
     *
     * <p>Asserted here as the property that makes it true: the scorer is a pure function of the
     * evidence it is handed. Scoring the same events twice yields identical output, and nothing
     * in {@code score} can mutate them — so a version bump can only ever change derived rows.
     * The persistence half (replacing rows, leaving {@code user_practice_session_results}
     * untouched) is asserted in {@code WeaknessRadarTest}.
     */
    @Test
    void scoringIsPureSoRawEvidenceCanNeverBeRewritten() {
        OffsetDateTime now = OffsetDateTime.parse("2026-09-03T12:00:00Z");
        List<EvidenceEvent> events = new ArrayList<>(List.of(
                new EvidenceEvent(UUID.randomUUID(), "s1", now.minusDays(5), "medium", false, 10, 7, null, 0),
                new EvidenceEvent(UUID.randomUUID(), "s2", now.minusDays(2), "hard", true, 10, 4, null, 0)));
        List<EvidenceEvent> snapshot = List.copyOf(events);
        UUID topicId = UUID.randomUUID();
        DifficultyScale scale = scale("easy", "medium", "hard");

        TopicHealthResult first = TopicHealthService.score(topicId, events, now, scale);
        TopicHealthResult second = TopicHealthService.score(topicId, events, now, scale);

        assertThat(first.health()).isEqualByComparingTo(second.health());
        assertThat(first.confidence()).isEqualByComparingTo(second.confidence());
        assertThat(first.state()).isEqualTo(second.state());
        assertThat(events).as("the scorer must not touch the evidence it was handed")
                .containsExactlyElementsOf(snapshot);
        assertThat(first.inputs().get("algorithmVersion")).isEqualTo(TopicHealthService.ALGORITHM_VERSION);
    }

    /** No evidence is not a weak topic — it is no row at all (§21, "topic never practised"). */
    @Test
    void noEvidenceProducesNoRow() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThat(TopicHealthService.score(UUID.randomUUID(), List.of(), now, scale("easy"))).isNull();
        assertThat(TopicHealthService.score(UUID.randomUUID(), null, now, scale("easy"))).isNull();
        // A session that offered questions but recorded no answers is the same case: a
        // mock-test question left unattempted says nothing about whether the student can do it.
        assertThat(TopicHealthService.score(UUID.randomUUID(),
                List.of(new EvidenceEvent(UUID.randomUUID(), "s1", now, "easy", false, 0, 0, null, 0)),
                now, scale("easy"))).isNull();
    }

    /**
     * Dropping a component must redistribute its weight, not leave the score short.
     *
     * <p>The failure this guards against is subtle and would look like a working feature: if the
     * surviving weights were used unnormalised, every student's health would be scaled down by
     * whatever fraction was missing — speed alone would cap everyone at 85.
     */
    @Test
    void renormalisationMakesSurvivingWeightsSumToOne() {
        Map<String, Double> weights = new LinkedHashMap<>();
        weights.put("accuracy", TopicHealthService.W_ACCURACY);
        weights.put("consistency", TopicHealthService.W_CONSISTENCY);

        Map<String, Double> effective = TopicHealthService.renormalise(weights);

        assertThat(effective.values().stream().mapToDouble(Double::doubleValue).sum())
                .isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-9));
        // Relative proportions are preserved: accuracy is still three times consistency.
        assertThat(effective.get("accuracy") / effective.get("consistency")).isCloseTo(3.0,
                org.assertj.core.data.Offset.offset(1e-9));

        assertThat(TopicHealthService.renormalise(new LinkedHashMap<>())).isEmpty();
    }

    /**
     * A perfect score on a single easy question must not out-rank a solid record.
     *
     * <p>The plain-accuracy trap: 1/1 is 100%, and any system that ranks on accuracy alone
     * puts it top. Health has to come out lower because confidence gates the verdict and the
     * evidence level is the floor.
     */
    @Test
    void oneLuckyAnswerDoesNotOutrankRealEvidence() {
        OffsetDateTime now = OffsetDateTime.parse("2026-09-03T12:00:00Z");
        DifficultyScale scale = scale("easy", "medium", "hard");

        TopicHealthResult lucky = TopicHealthService.score(UUID.randomUUID(), List.of(
                new EvidenceEvent(UUID.randomUUID(), "s1", now.minusDays(1), "easy", false, 1, 1, null, 0)),
                now, scale);

        List<EvidenceEvent> solid = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            solid.add(new EvidenceEvent(UUID.randomUUID(), "s" + i, now.minusDays(3L * i + 1),
                    "medium", false, 8, 6, null, 0));
        }
        TopicHealthResult real = TopicHealthService.score(UUID.randomUUID(), solid, now, scale);

        assertThat(lucky.state().name()).isEqualTo("INSUFFICIENT_DATA");
        assertThat(lucky.confidence().doubleValue())
                .as("one answer cannot be a confident diagnosis")
                .isLessThan(real.confidence().doubleValue());
    }

    /* ------------------------------------------------------------------------- helpers */

    private static List<EvidenceEvent> eventsFrom(JsonNode events) {
        List<EvidenceEvent> out = new ArrayList<>();
        OffsetDateTime base = OffsetDateTime.parse("2026-09-03T12:00:00Z");
        for (JsonNode e : events) {
            out.add(new EvidenceEvent(
                    UUID.randomUUID(),
                    e.get("eventId").asText(),
                    base.minusDays(e.get("daysAgo").asLong()),
                    e.get("difficulty").isNull() ? null : e.get("difficulty").asText(),
                    e.get("pyq").asBoolean(),
                    e.get("answered").asInt(),
                    e.get("correct").asInt(),
                    null,
                    0));
        }
        return out;
    }

    private static DifficultyScale scaleFrom(JsonNode codes) {
        List<String> list = new ArrayList<>();
        codes.forEach(node -> list.add(node.asText()));
        return scale(list.toArray(String[]::new));
    }

    /** A difficulty ladder in the order {@code difficulty_levels.display_order} would give. */
    private static DifficultyScale scale(String... codes) {
        List<DifficultyLevel> levels = new ArrayList<>();
        for (int i = 0; i < codes.length; i++) {
            DifficultyLevel level = new DifficultyLevel();
            level.setCode(codes[i]);
            level.setLabel(codes[i]);
            level.setDisplayOrder(i);
            level.setActive(true);
            levels.add(level);
        }
        return DifficultyScale.of(levels);
    }
}
