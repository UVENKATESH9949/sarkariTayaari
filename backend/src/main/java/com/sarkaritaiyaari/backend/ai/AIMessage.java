package com.sarkaritaiyaari.backend.ai;

/** One turn in a conversation. Anthropic (and most vendors) treat the system prompt as a
 * separate top-level field rather than a message role — see {@link AIRequest#systemPrompt()} —
 * so this only models the two roles that actually belong in the turn-by-turn history. */
public record AIMessage(Role role, String content) {

    public enum Role { USER, ASSISTANT }

    public static AIMessage user(String content) {
        return new AIMessage(Role.USER, content);
    }

    public static AIMessage assistant(String content) {
        return new AIMessage(Role.ASSISTANT, content);
    }
}
