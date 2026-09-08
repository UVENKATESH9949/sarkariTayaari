package com.sarkaritaiyaari.backend.evaluation;

/** {@code scoreFraction} is 0.0–1.0 so a future partial-credit family has somewhere to put a value other than 0 or 1. */
public record EvaluationResult(EvaluationOutcome outcome, double scoreFraction) {
}
