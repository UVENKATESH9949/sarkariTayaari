package com.sarkaritaiyaari.backend.ai.feedback;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Phase 7. Parses and validates a {@code SESSION_FEEDBACK}/{@code PROFILE_SUMMARY} response
 * before it is ever persisted or shown to a student -- the narrative-only counterpart to
 * {@code AiContentValidation}, same {@code Ok}/{@code Failed} shape and same "nothing throws, a
 * bad response is a value" posture (the caller's job on failure is to fall back to the
 * deterministic template, never to error the screen).
 */
public final class PersonalNarrativeValidation {

    private PersonalNarrativeValidation() {
    }

    public sealed interface Result permits Ok, Failed {
    }

    public record Ok(String narrative) implements Result {
    }

    /** {@code code} matches the failure vocabulary in {@code validate.ts} for the same reason
     *  {@code AiContentValidation.Failed} does. */
    public record Failed(String code, String detail) implements Result {
    }

    public static Result validate(JsonNode raw, PersonalNarrativeGrounding.Grounding grounding) {
        if (raw == null || !raw.isObject()) {
            return new Failed("NOT_AN_OBJECT", "response was not a JSON object");
        }

        JsonNode narrativeNode = raw.get("narrative");
        if (narrativeNode == null || narrativeNode.isNull()) {
            return new Failed("MISSING_FIELD", "narrative");
        }
        if (!narrativeNode.isTextual()) {
            return new Failed("WRONG_TYPE", "narrative must be a string");
        }
        String narrative = narrativeNode.asText().trim();
        if (narrative.isEmpty()) {
            return new Failed("EMPTY_FIELD", "narrative");
        }

        String ungroundedNumber = PersonalNarrativeGrounding.firstUngroundedNumber(narrative, grounding);
        if (ungroundedNumber != null) {
            return new Failed("UNGROUNDED_NARRATIVE",
                    "narrative cites \"" + ungroundedNumber + "\", which was not among the given facts");
        }
        if (!PersonalNarrativeGrounding.mentionsAKnownTopic(narrative, grounding)) {
            return new Failed("UNGROUNDED_NARRATIVE", "narrative names none of the topics it was given");
        }

        return new Ok(narrative);
    }
}
