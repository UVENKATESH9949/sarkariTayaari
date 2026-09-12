package com.sarkaritaiyaari.backend.ai.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Plain JUnit, no Spring, no database — {@link AiContentValidation} is pure logic over an
 * already-parsed {@link JsonNode}, the same "no running context needed" precedent as
 * {@code TopicHealthScoringTest}/{@code AIServiceImplTest}.
 */
class AiContentValidationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final List<String> OPTIONS = List.of("Mumbai", "Kolkata", "Chennai", "Patna");

    private static JsonNode json(Map<String, Object> value) throws Exception {
        return MAPPER.valueToTree(value);
    }

    @Test
    void acceptsAWellFormedGroundedExplanation() throws Exception {
        JsonNode raw = json(Map.of(
                "answer", "Kolkata",
                "whyCorrect", "Kolkata has been the state capital since 1947.",
                "whyOthersWrong", List.of(Map.of("option", "Mumbai", "why", "Mumbai is Maharashtra's capital.")),
                "concept", "State capitals",
                "examTip", "These recur in General Awareness."));

        var result = AiContentValidation.validateQuestionExplanation(raw, "Kolkata", OPTIONS);

        assertThat(result).isInstanceOf(AiContentValidation.Ok.class);
        Map<String, Object> payload = ((AiContentValidation.Ok) result).payload();
        assertThat(payload.get("answer")).isEqualTo("Kolkata");
        assertThat(payload.get("taskId")).isEqualTo("QUESTION_EXPLANATION");
    }

    /** The single most important check in this class — see AI_ARCHITECTURE.md §8. */
    @Test
    void rejectsAnExplanationOfADifferentAnswer() throws Exception {
        JsonNode raw = json(Map.of(
                "answer", "Chennai",
                "whyCorrect", "Some explanation.",
                "whyOthersWrong", List.of()));

        var result = AiContentValidation.validateQuestionExplanation(raw, "Kolkata", OPTIONS);

        assertThat(result).isInstanceOf(AiContentValidation.Failed.class);
        AiContentValidation.Failed failed = (AiContentValidation.Failed) result;
        assertThat(failed.code()).isEqualTo("UNGROUNDED_ANSWER");
        assertThat(failed.detail()).contains("Chennai").contains("Kolkata");
    }

    @Test
    void acceptsALetterAnswerAgainstAStoredLetterCorrectAnswer() throws Exception {
        // Legacy rows store the correct answer as a letter (V1); the model may still answer with
        // option text. Both directions must validate — see AiAnswerGroundingTest.
        JsonNode raw = json(Map.of("answer", "Kolkata", "whyCorrect", "Because.", "whyOthersWrong", List.of()));

        var result = AiContentValidation.validateQuestionExplanation(raw, "B", OPTIONS);

        assertThat(result).isInstanceOf(AiContentValidation.Ok.class);
    }

    @Test
    void rejectsAMissingRequiredField() throws Exception {
        JsonNode raw = json(Map.of("whyCorrect", "Because."));

        var result = AiContentValidation.validateQuestionExplanation(raw, "Kolkata", OPTIONS);

        assertThat(result).isInstanceOf(AiContentValidation.Failed.class);
        assertThat(((AiContentValidation.Failed) result).code()).isEqualTo("MISSING_FIELD");
    }

    @Test
    void rejectsABlankRequiredField() throws Exception {
        JsonNode raw = json(Map.of("answer", "Kolkata", "whyCorrect", "   "));

        var result = AiContentValidation.validateQuestionExplanation(raw, "Kolkata", OPTIONS);

        assertThat(result).isInstanceOf(AiContentValidation.Failed.class);
        assertThat(((AiContentValidation.Failed) result).code()).isEqualTo("EMPTY_FIELD");
    }

    @Test
    void rejectsAMalformedWhyOthersWrongEntry() throws Exception {
        JsonNode raw = json(Map.of(
                "answer", "Kolkata",
                "whyCorrect", "Because.",
                "whyOthersWrong", List.of(Map.of("option", "Mumbai"))));

        var result = AiContentValidation.validateQuestionExplanation(raw, "Kolkata", OPTIONS);

        assertThat(result).isInstanceOf(AiContentValidation.Failed.class);
    }

    @Test
    void tolerateAnAbsentWhyOthersWrongList() throws Exception {
        JsonNode raw = json(Map.of("answer", "Kolkata", "whyCorrect", "Because."));

        var result = AiContentValidation.validateQuestionExplanation(raw, "Kolkata", OPTIONS);

        assertThat(result).isInstanceOf(AiContentValidation.Ok.class);
        assertThat(((AiContentValidation.Ok) result).payload().get("whyOthersWrong")).isEqualTo(List.of());
    }

    @Test
    void rejectsANonObjectResponse() throws Exception {
        JsonNode raw = MAPPER.valueToTree("just a plain string");

        var result = AiContentValidation.validateQuestionExplanation(raw, "Kolkata", OPTIONS);

        assertThat(result).isInstanceOf(AiContentValidation.Failed.class);
        assertThat(((AiContentValidation.Failed) result).code()).isEqualTo("NOT_AN_OBJECT");
    }

    @Test
    void conceptExplanationHasNoAnswerToGround() throws Exception {
        JsonNode raw = json(Map.of(
                "concept", "Fundamental Rights",
                "explanation", "Part III of the Constitution guarantees these to every citizen.",
                "examTip", "Read Articles 12-35 closely."));

        var result = AiContentValidation.validateConceptExplanation(raw);

        assertThat(result).isInstanceOf(AiContentValidation.Ok.class);
        assertThat(((AiContentValidation.Ok) result).payload().get("taskId")).isEqualTo("CONCEPT_EXPLANATION");
    }

    @Test
    void conceptExplanationStillRequiresItsFields() throws Exception {
        JsonNode raw = json(Map.of("concept", "Fundamental Rights"));

        var result = AiContentValidation.validateConceptExplanation(raw);

        assertThat(result).isInstanceOf(AiContentValidation.Failed.class);
        assertThat(((AiContentValidation.Failed) result).code()).isEqualTo("MISSING_FIELD");
    }
}
