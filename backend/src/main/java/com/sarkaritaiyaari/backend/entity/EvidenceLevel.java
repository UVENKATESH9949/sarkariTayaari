package com.sarkaritaiyaari.backend.entity;

/**
 * How much usable evidence a topic has (Weakness Radar v1, supplied spec §4).
 *
 * <p>The whole point of this enum is that "weak" must never be concluded from one or two
 * mistakes. The thresholds live here as named constants rather than as magic numbers spread
 * across a scoring service, so changing the product's tolerance is one edit in one place —
 * which §4 asks for explicitly.
 *
 * <p>"Meaningful attempt" means an <em>answered</em> question. A mock-test question left
 * unattempted carries no information about whether the student can solve it, so it is not
 * counted here (nor as a wrong answer anywhere else in this feature).
 *
 * <p>Mirrored on the device in {@code mobile/src/intelligence/topicHealth.ts} for the
 * signed-out path — keep the two in step.
 */
public enum EvidenceLevel {

    INSUFFICIENT_DATA(0),
    EARLY_SIGNAL(5),
    DEVELOPING_CONFIDENCE(10),
    RELIABLE(20);

    private final int minAttempts;

    EvidenceLevel(int minAttempts) {
        this.minAttempts = minAttempts;
    }

    public int getMinAttempts() {
        return minAttempts;
    }

    /**
     * The level a given number of meaningful attempts earns.
     *
     * <p>Walks the highest band down rather than chaining {@code if} ranges, so adding a band
     * needs no second edit and no range can be left with a gap in it.
     */
    public static EvidenceLevel forAttempts(int meaningfulAttempts) {
        EvidenceLevel result = INSUFFICIENT_DATA;
        for (EvidenceLevel level : values()) {
            if (meaningfulAttempts >= level.minAttempts) {
                result = level;
            }
        }
        return result;
    }

    /** Whether there is enough evidence to assert anything about the topic at all. */
    public boolean isSufficient() {
        return this != INSUFFICIENT_DATA;
    }
}
