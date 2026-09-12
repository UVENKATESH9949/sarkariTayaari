package com.sarkaritaiyaari.backend.ai;

/**
 * Structured-output extension point (§12). Phase 1 only threads this through as a hint a
 * provider adapter may use when building its request — no JSON-schema enforcement or
 * tool-use pipeline is built yet; that's real future work once a feature actually needs it.
 */
public enum ResponseFormat {
    TEXT,
    JSON
}
