package com.sarkaritaiyaari.backend.evaluation;

import java.util.Map;

/**
 * The MANUAL evaluator family's sole member (TASK-2301 Phase P4), for SHORT_ANSWER and
 * LONG_ANSWER. Unlike every other family, this one cannot resolve a correctness verdict
 * from {@code answerKey} at all — a descriptive answer needs a human reader, not a
 * comparison. {@code response} is {@code {"enteredText": string | null}}, the same shape
 * {@link TextAnswerEvaluator} uses; {@code answerKey} is read by nobody here (whatever a
 * future review workflow stores as a model answer/rubric is out of this phase's scope).
 *
 * An attempted answer is always {@link EvaluationOutcome#PENDING_REVIEW} with a
 * placeholder {@code scoreFraction} of 0.0 — not asserting "wrong" the way INCORRECT
 * would, and not asserting "right" either; a real score only exists once a human
 * reviewer overrides it, which this phase deliberately does not build (see the task doc's
 * own "no student UI" / "human evaluation workflow is out of scope" notes). Nothing calls
 * this evaluator yet: SHORT_ANSWER/LONG_ANSWER stay {@code is_authoring_enabled = false}
 * (V25), so no question of either type can exist to be evaluated — this class exists so
 * the registry is complete and the fixture file can assert the contract now, ahead of
 * whichever future phase actually unlocks authoring and review.
 */
public final class ManualEvaluator implements QuestionEvaluator {

    @Override
    public EvaluationResult evaluate(Map<String, Object> answerKey, Map<String, Object> answerConfig, Map<String, Object> response) {
        Object enteredRaw = response == null ? null : response.get("enteredText");
        if (!(enteredRaw instanceof String entered) || entered.trim().isEmpty()) {
            return new EvaluationResult(EvaluationOutcome.UNATTEMPTED, 0.0);
        }

        return new EvaluationResult(EvaluationOutcome.PENDING_REVIEW, 0.0);
    }
}
