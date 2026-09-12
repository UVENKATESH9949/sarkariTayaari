package com.sarkaritaiyaari.backend.ai.exception;

/** The requested model id doesn't exist for this provider. Never retried. */
public class AIModelNotFoundException extends AIException {
    public AIModelNotFoundException(String message) {
        super(message);
    }
}
