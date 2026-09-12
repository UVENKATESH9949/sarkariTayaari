package com.sarkaritaiyaari.backend.ai.exception;

/**
 * Base type for every normalized AI-layer error. A provider adapter must never let a raw
 * vendor/HTTP exception escape past its own boundary — it catches and rethrows as one of this
 * hierarchy's subtypes instead, so {@code AIServiceImpl}'s retry policy and
 * {@code GlobalExceptionHandler} both work off one vocabulary regardless of which vendor is
 * active (§17, §31).
 */
public class AIException extends RuntimeException {
    public AIException(String message) {
        super(message);
    }

    public AIException(String message, Throwable cause) {
        super(message, cause);
    }
}
