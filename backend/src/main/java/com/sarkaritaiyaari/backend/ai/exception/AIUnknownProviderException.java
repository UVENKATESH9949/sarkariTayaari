package com.sarkaritaiyaari.backend.ai.exception;

/** {@code app.ai.provider} names a provider with no registered bean — unimplemented (e.g.
 * OPENAI/GEMINI before they exist) or a plain typo. Never retried — the provider will still
 * not exist on the next attempt. */
public class AIUnknownProviderException extends AIException {
    public AIUnknownProviderException(String message) {
        super(message);
    }
}
