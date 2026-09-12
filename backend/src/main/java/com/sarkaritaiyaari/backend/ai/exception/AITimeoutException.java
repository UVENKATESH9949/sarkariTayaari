package com.sarkaritaiyaari.backend.ai.exception;

/** Connect or read timeout. Retried with backoff by {@code AIServiceImpl} — a slow provider
 * often answers on the next attempt. */
public class AITimeoutException extends AIException {
    public AITimeoutException(String message) {
        super(message);
    }

    public AITimeoutException(String message, Throwable cause) {
        super(message, cause);
    }
}
