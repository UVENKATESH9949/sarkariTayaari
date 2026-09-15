package com.sarkaritaiyaari.backend.ai.feedback;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Set;

/**
 * TASK-2701 Phase 7.4. Validates a {@code MISTAKE_ANALYSIS} response before a student sees it.
 *
 * <p>Sibling to {@link PersonalNarrativeValidation} rather than an extension of it, for a
 * structural reason: that one validates a single free-text {@code narrative}, while this task's
 * contract is a three-field object whose {@code mistakeType} must land inside a closed taxonomy.
 * Same {@code Ok}/{@code Failed} shape, same "nothing throws, a bad response is a value" posture,
 * and the same failure vocabulary as {@code validate.ts} so both sides read alike.
 *
 * <p>The taxonomy is duplicated from {@code MISTAKE_TYPES} in
 * {@code packages/core/src/ai/schema/types.ts} for the same reason {@code PersonalNarrativeGrounding}
 * mirrors {@code groundedNarrative}: this side generates, the TypeScript side is what a client
 * re-checks. {@link #MISTAKE_TYPES} and that constant must stay in step.
 */
public final class MistakeAnalysisValidation {

    /** Must match MISTAKE_TYPES in packages/core/src/ai/schema/types.ts exactly. */
    public static final Set<String> MISTAKE_TYPES = Set.of(
            "KNOWLEDGE_GAP",
            "CONCEPT_CONFUSION",
            "CALCULATION_ERROR",
            "MISREADING",
            "GUESSING",
            "TIME_PRESSURE",
            "SIMILAR_OPTION_CONFUSION",
            "MEMORY_FAILURE",
            "REPEATED_MISTAKE");

    private MistakeAnalysisValidation() {
    }

    public sealed interface Result permits Ok, Failed {
    }

    public record Ok(String mistakeType, String explanation, String suggestedAction) implements Result {
    }

    public record Failed(String code, String detail) implements Result {
    }

    /**
     * <h2>Why there is no number/topic grounding here, unlike {@link PersonalNarrativeValidation}</h2>
     * Both checks were tried against real Groq output and both rejected correct analyses:
     * <ul>
     *   <li>The topic-name rule rejected "you picked 50 km/h, but 120 km over 2 hours is 60" for
     *       never naming the topic — but this task's subject is one question, not a topic.</li>
     *   <li>The number rule rejected an analysis for citing {@code 0.15} while correctly working
     *       15% out as a decimal. Showing the working <em>is</em> the explanation on a
     *       quantitative question, so a literal-number allowlist fights the feature itself.</li>
     * </ul>
     * The protection those rules exist to give — no invented statistic about the student — is
     * instead achieved by not supplying one: the prompt sends the topic state qualitatively and
     * the repeat signal in words, never an accuracy or an attempt count, and instructs the model
     * that any such figure would be invented. What remains enforced here is the closed taxonomy
     * and that no field is blank.
     *
     * <p><b>Residual risk, stated rather than hidden:</b> a model could still hallucinate a
     * performance figure unprompted, and nothing here would catch it. Accepted because the
     * verified answer is supplied (so the answer itself cannot be invented) and the authored
     * explanation always renders above this card.
     */
    public static Result validate(JsonNode raw) {
        if (raw == null || !raw.isObject()) {
            return new Failed("NOT_AN_OBJECT", "response was not a JSON object");
        }

        Failed badType = checkText(raw, "mistakeType");
        if (badType != null) {
            return badType;
        }
        Failed badExplanation = checkText(raw, "explanation");
        if (badExplanation != null) {
            return badExplanation;
        }
        Failed badAction = checkText(raw, "suggestedAction");
        if (badAction != null) {
            return badAction;
        }

        String mistakeType = text(raw, "mistakeType");
        String explanation = text(raw, "explanation");
        String suggestedAction = text(raw, "suggestedAction");

        if (!MISTAKE_TYPES.contains(mistakeType)) {
            return new Failed("UNKNOWN_ENUM", "mistakeType \"" + mistakeType + "\" is not in the taxonomy");
        }

        return new Ok(mistakeType, explanation, suggestedAction);
    }

    /** {@code null} when the field is a present, non-blank string; otherwise why it is not. */
    private static Failed checkText(JsonNode raw, String field) {
        JsonNode node = raw.get(field);
        if (node == null || node.isNull()) {
            return new Failed("MISSING_FIELD", field);
        }
        if (!node.isTextual()) {
            return new Failed("WRONG_TYPE", field + " must be a string");
        }
        if (node.asText().trim().isEmpty()) {
            return new Failed("EMPTY_FIELD", field);
        }
        return null;
    }

    private static String text(JsonNode raw, String field) {
        return raw.get(field).asText().trim();
    }
}
