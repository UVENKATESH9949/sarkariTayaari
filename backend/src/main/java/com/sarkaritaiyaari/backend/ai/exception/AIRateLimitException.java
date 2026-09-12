package com.sarkaritaiyaari.backend.ai.exception;

/** Provider returned a rate-limit response (e.g. HTTP 429). Retried with backoff by
 * {@code AIServiceImpl}. */
public class AIRateLimitException extends AIException {
    public AIRateLimitException(String message) {
        super(message);
    }
}
