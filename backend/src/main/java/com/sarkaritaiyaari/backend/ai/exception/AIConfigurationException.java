package com.sarkaritaiyaari.backend.ai.exception;

/** AI is disabled ({@code app.ai.enabled=false}), or a required config value (e.g. an API
 * key) is missing. Never retried — nothing about the call itself changes on retry. */
public class AIConfigurationException extends AIException {
    public AIConfigurationException(String message) {
        super(message);
    }
}
