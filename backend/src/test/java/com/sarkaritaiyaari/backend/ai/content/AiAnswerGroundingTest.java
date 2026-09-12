package com.sarkaritaiyaari.backend.ai.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every case in {@code sample-data/ai-answer-grounding-fixtures.json}, run against this
 * package's {@link AiAnswerGrounding} — the Java side of a check that also exists in
 * {@code packages/core/src/ai/schema/validate.ts}'s {@code answerMatches}, asserted against the
 * same fixture from both sides (see {@code validate.test.ts}'s "shared fixture parity" block).
 * Plain JUnit, no Spring, no database — the same precedent {@code QuestionEvaluatorsTest} sets
 * for a check that is pure logic and needs no running context.
 */
class AiAnswerGroundingTest {

    private static final Path FIXTURES = Path.of("..", "sample-data", "ai-answer-grounding-fixtures.json");

    @Test
    void everyFixtureCaseHolds() throws Exception {
        JsonNode root = new ObjectMapper().readTree(Files.readString(FIXTURES));
        List<String> failures = new ArrayList<>();

        for (JsonNode c : root.get("cases")) {
            String claimed = c.get("claimedAnswer").asText();
            String correct = c.get("correctAnswer").asText();
            boolean expected = c.get("expectedMatch").asBoolean();
            String note = c.get("note").asText();
            List<String> options = StreamSupport.stream(c.get("options").spliterator(), false)
                    .map(JsonNode::asText)
                    .toList();

            boolean actual = AiAnswerGrounding.groundedAnswer(claimed, correct, options);
            if (actual != expected) {
                failures.add("claimed=\"%s\" correct=\"%s\" options=%s (%s): expected %s, got %s"
                        .formatted(claimed, correct, options, note, expected, actual));
            }
        }

        assertThat(failures).isEmpty();
    }

    @Test
    void nullInputsNeverMatch() {
        assertThat(AiAnswerGrounding.groundedAnswer(null, "Kolkata", List.of("Kolkata"))).isFalse();
        assertThat(AiAnswerGrounding.groundedAnswer("Kolkata", null, List.of("Kolkata"))).isFalse();
    }
}
