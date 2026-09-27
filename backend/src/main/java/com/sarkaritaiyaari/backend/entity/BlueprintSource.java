package com.sarkaritaiyaari.backend.entity;

/** How a teaching blueprint came to exist. */
public enum BlueprintSource {
    /** Written by a human. */
    AUTHORED,
    /** Produced by a model. */
    AI_GENERATED,
    /** Copied in from the AI Video Studio repository's {@code lessons/} directory. */
    IMPORTED
}
