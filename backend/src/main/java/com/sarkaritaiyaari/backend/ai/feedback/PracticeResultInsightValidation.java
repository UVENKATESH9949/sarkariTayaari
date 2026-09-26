package com.sarkaritaiyaari.backend.ai.feedback;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Validates a {@code PRACTICE_RESULT_INSIGHT} response before it is ever shown to a student —
 * same {@code Ok}/{@code Failed}/"nothing throws" shape as {@link PersonalNarrativeValidation}
 * and {@link MistakeAnalysisValidation}.
 *
 * <p><b>Grounding here is topic-name-only, deliberately NOT the strict numeric check
 * {@link PersonalNarrativeGrounding} applies to SESSION_FEEDBACK/PROFILE_SUMMARY.</b> This
 * task's {@code recommendation} field legitimately invents a practice count ("practice 10-15
 * questions") — an action item, not a claimed statistic about the student — so rejecting every
 * unlisted number would reject the exact wording the product spec asks for. What still must not
 * happen is the model naming a sub-topic, previous score or trend it was never given; that is
 * caught the same permissive way {@code PersonalNarrativeGrounding.mentionsAKnownTopic} already
 * does for the other two Phase 7 tasks — this is a mirror of that check's TypeScript
 * counterpart's own {@code checkTopicNameGrounding} in {@code validate.ts}.
 */
public final class PracticeResultInsightValidation {

    private static final Set<String> ALLOWED_ACTIONS = Set.of("RETRY", "NEXT_LEVEL", "NEXT_TOPIC", "PRACTICE_WEAK_AREA");

    private PracticeResultInsightValidation() {
    }

    public sealed interface Result permits Ok, Failed {
    }

    public record Ok(
            String summary,
            List<String> strengths,
            List<String> weakAreas,
            String timeInsight,
            String recommendation,
            String recommendedAction) implements Result {
    }

    public record Failed(String code, String detail) implements Result {
    }

    public static Result validate(JsonNode raw, List<String> allowedSubtopicNames) {
        if (raw == null || !raw.isObject()) {
            return new Failed("NOT_AN_OBJECT", "response was not a JSON object");
        }

        String summary = requiredString(raw, "summary");
        if (summary == null) {
            return new Failed("MISSING_FIELD", "summary");
        }

        List<String> strengths = stringArray(raw, "strengths");
        List<String> weakAreas = stringArray(raw, "weakAreas");
        String timeInsight = optionalString(raw, "timeInsight");

        String recommendation = requiredString(raw, "recommendation");
        if (recommendation == null) {
            return new Failed("MISSING_FIELD", "recommendation");
        }

        String recommendedAction = requiredString(raw, "recommendedAction");
        if (recommendedAction == null) {
            return new Failed("MISSING_FIELD", "recommendedAction");
        }
        String normalizedAction = recommendedAction.trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_ACTIONS.contains(normalizedAction)) {
            return new Failed("UNKNOWN_ENUM", "recommendedAction \"" + recommendedAction + "\" is not one of " + ALLOWED_ACTIONS);
        }

        if (!allowedSubtopicNames.isEmpty()) {
            String combined = String.join(" ", summary, String.join(" ", strengths), String.join(" ", weakAreas),
                    timeInsight == null ? "" : timeInsight, recommendation).toLowerCase(Locale.ROOT);
            boolean mentionsAKnownTopic = allowedSubtopicNames.stream()
                    .anyMatch(name -> combined.contains(name.trim().toLowerCase(Locale.ROOT)));
            if (!mentionsAKnownTopic) {
                return new Failed("UNGROUNDED_NARRATIVE", "response names none of the sub-topics it was given");
            }
        }

        return new Ok(summary, strengths.subList(0, Math.min(3, strengths.size())),
                weakAreas.subList(0, Math.min(3, weakAreas.size())), timeInsight, recommendation, normalizedAction);
    }

    private static String requiredString(JsonNode raw, String field) {
        JsonNode node = raw.get(field);
        if (node == null || node.isNull() || !node.isTextual()) {
            return null;
        }
        String trimmed = node.asText().trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String optionalString(JsonNode raw, String field) {
        JsonNode node = raw.get(field);
        if (node == null || node.isNull() || !node.isTextual()) {
            return null;
        }
        String trimmed = node.asText().trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static List<String> stringArray(JsonNode raw, String field) {
        JsonNode node = raw.get(field);
        List<String> items = new ArrayList<>();
        if (node == null || node.isNull() || !node.isArray()) {
            return items;
        }
        for (JsonNode entry : node) {
            if (entry.isTextual() && !entry.asText().trim().isEmpty()) {
                items.add(entry.asText().trim());
            }
        }
        return items;
    }
}
