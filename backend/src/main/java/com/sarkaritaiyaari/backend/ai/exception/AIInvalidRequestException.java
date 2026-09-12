package com.sarkaritaiyaari.backend.ai.exception;

/** Malformed request (empty messages, an unsupported parameter, etc.). Never retried — a
 * retry would send the exact same malformed request again. */
public class AIInvalidRequestException extends AIException {
    public AIInvalidRequestException(String message) {
        super(message);
    }
}
