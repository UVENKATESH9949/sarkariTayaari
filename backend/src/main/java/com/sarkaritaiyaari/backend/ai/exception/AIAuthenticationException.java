package com.sarkaritaiyaari.backend.ai.exception;

/** Bad, missing, or revoked API key. Never retried by {@code AIServiceImpl} — a retry can't
 * fix a wrong credential. */
public class AIAuthenticationException extends AIException {
    public AIAuthenticationException(String message) {
        super(message);
    }
}
