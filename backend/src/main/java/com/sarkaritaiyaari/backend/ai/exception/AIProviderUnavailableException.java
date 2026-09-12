package com.sarkaritaiyaari.backend.ai.exception;

/** Provider unreachable, or returned a 5xx/overloaded response. Retried with backoff by
 * {@code AIServiceImpl}. */
public class AIProviderUnavailableException extends AIException {
    public AIProviderUnavailableException(String message) {
        super(message);
    }

    public AIProviderUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
