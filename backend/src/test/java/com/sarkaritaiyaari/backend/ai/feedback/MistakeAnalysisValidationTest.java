package com.sarkaritaiyaari.backend.ai.feedback;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2701 Phase 7.4. Plain JUnit, no Spring context and no database -- the same precedent
 * {@code PersonalNarrativeGroundingTest} and {@code AiContentValidationTest} set for pure
 * validation logic.
 *
 * <p>What this class deliberately does <em>not</em> assert is as important as what it does: there
 * is no number-grounding or topic-mention case here, because neither rule applies to this task.
 * Both were tried and both rejected correct real Groq output -- see
 * {@link MistakeAnalysisValidation#validate} for the full reasoning and for what replaced the
 * protection they were giving.
 */
class MistakeAnalysisValidationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private MistakeAnalysisValidation.Result validate(String json) throws Exception {
        return MistakeAnalysisValidation.validate(MAPPER.readTree(json));
    }

    private static MistakeAnalysisValidation.Failed failed(MistakeAnalysisValidation.Result result) {
        assertThat(result).isInstanceOf(MistakeAnalysisValidation.Failed.class);
        return (MistakeAnalysisValidation.Failed) result;
    }

    @Test
    void acceptsAnAnalysisThatShowsItsWorking() throws Exception {
        // Both the answers it was given and an intermediate value it worked out itself (0.15).
        // Under the original number-grounding rule a real Groq call was rejected for exactly this.
        MistakeAnalysisValidation.Result result = validate("""
                {"mistakeType":"MISREADING",
                 "explanation":"You picked 50 km/h, but 120 km over 2 hours is 60 km/h. 15% is 0.15.",
                 "suggestedAction":"Re-read the units before choosing."}""");

        assertThat(result).isInstanceOf(MistakeAnalysisValidation.Ok.class);
        assertThat(((MistakeAnalysisValidation.Ok) result).mistakeType()).isEqualTo("MISREADING");
    }

    /**
     * The counterpart to {@code PersonalNarrativeValidation}'s topic rule, deliberately not
     * enforced here: a good mistake analysis is about one question and may never name the topic.
     */
    @Test
    void acceptsAnAnalysisThatNeverNamesTheTopic() throws Exception {
        MistakeAnalysisValidation.Result result = validate("""
                {"mistakeType":"MISREADING",
                 "explanation":"You misread the units.",
                 "suggestedAction":"Re-read the units before choosing."}""");

        assertThat(result).isInstanceOf(MistakeAnalysisValidation.Ok.class);
    }

    @Test
    void rejectsAMistakeTypeOutsideTheTaxonomy() throws Exception {
        assertThat(failed(validate("""
                {"mistakeType":"CARELESSNESS",
                 "explanation":"You misread it.",
                 "suggestedAction":"Slow down."}""")).code())
                .isEqualTo("UNKNOWN_ENUM");
    }

    @Test
    void rejectsAMissingField() throws Exception {
        assertThat(failed(validate("""
                {"mistakeType":"MISREADING","suggestedAction":"Slow down."}""")).code())
                .isEqualTo("MISSING_FIELD");
    }

    @Test
    void rejectsABlankField() throws Exception {
        assertThat(failed(validate("""
                {"mistakeType":"MISREADING","explanation":"   ","suggestedAction":"Slow down."}""")).code())
                .isEqualTo("EMPTY_FIELD");
    }

    @Test
    void rejectsAWronglyTypedField() throws Exception {
        assertThat(failed(validate("""
                {"mistakeType":"MISREADING","explanation":42,"suggestedAction":"Slow down."}""")).code())
                .isEqualTo("WRONG_TYPE");
    }

    @Test
    void rejectsSomethingThatIsNotAnObject() throws Exception {
        assertThat(failed(validate("[]")).code()).isEqualTo("NOT_AN_OBJECT");
    }

    /** The taxonomy exists in two languages; a drift here silently breaks the client's re-check. */
    @Test
    void taxonomyMatchesTheSharedTypeScriptConstant() {
        assertThat(MistakeAnalysisValidation.MISTAKE_TYPES).containsExactlyInAnyOrder(
                "KNOWLEDGE_GAP", "CONCEPT_CONFUSION", "CALCULATION_ERROR", "MISREADING", "GUESSING",
                "TIME_PRESSURE", "SIMILAR_OPTION_CONFUSION", "MEMORY_FAILURE", "REPEATED_MISTAKE");
    }
}
