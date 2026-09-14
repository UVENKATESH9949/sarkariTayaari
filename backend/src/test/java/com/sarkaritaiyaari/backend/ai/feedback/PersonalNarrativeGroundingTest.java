package com.sarkaritaiyaari.backend.ai.feedback;

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
 * Every case in {@code sample-data/personal-narrative-grounding-fixtures.json}, run against
 * this package's {@link PersonalNarrativeGrounding} — the Java side of a check that also
 * exists in {@code packages/core/src/ai/schema/validate.ts}'s {@code groundedNarrative},
 * asserted against the same fixture from both sides (see {@code validate.test.ts}'s
 * "groundedNarrative" block). Plain JUnit, no Spring, no database — same precedent
 * {@code AiAnswerGroundingTest} sets for a check that is pure logic.
 */
class PersonalNarrativeGroundingTest {

    private static final Path FIXTURES = Path.of("..", "sample-data", "personal-narrative-grounding-fixtures.json");

    @Test
    void everyFixtureCaseHolds() throws Exception {
        JsonNode root = new ObjectMapper().readTree(Files.readString(FIXTURES));
        List<String> failures = new ArrayList<>();

        for (JsonNode c : root.get("cases")) {
            String narrative = c.get("narrative").asText();
            boolean expected = c.get("expectedGrounded").asBoolean();
            String note = c.get("note").asText();
            List<Integer> allowedNumbers = StreamSupport.stream(c.get("allowedNumbers").spliterator(), false)
                    .map(JsonNode::asInt)
                    .toList();
            List<String> allowedTopicNames = StreamSupport.stream(c.get("allowedTopicNames").spliterator(), false)
                    .map(JsonNode::asText)
                    .toList();

            var grounding = new PersonalNarrativeGrounding.Grounding(allowedNumbers, allowedTopicNames);
            boolean actual = PersonalNarrativeGrounding.firstUngroundedNumber(narrative, grounding) == null
                    && PersonalNarrativeGrounding.mentionsAKnownTopic(narrative, grounding);

            if (actual != expected) {
                failures.add("narrative=\"%s\" allowedNumbers=%s allowedTopicNames=%s (%s): expected grounded=%s, got %s"
                        .formatted(narrative, allowedNumbers, allowedTopicNames, note, expected, actual));
            }
        }

        assertThat(failures).isEmpty();
    }

    @Test
    void firstUngroundedNumberNamesTheOffendingToken() {
        var grounding = new PersonalNarrativeGrounding.Grounding(List.of(70), List.of());
        assertThat(PersonalNarrativeGrounding.firstUngroundedNumber("You scored 95%.", grounding))
                .isEqualTo("95");
        assertThat(PersonalNarrativeGrounding.firstUngroundedNumber("You scored 70%.", grounding)).isNull();
    }
}
