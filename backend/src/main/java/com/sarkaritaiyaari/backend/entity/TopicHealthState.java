package com.sarkaritaiyaari.backend.entity;

/**
 * How a student currently stands in one topic (Weakness Radar v1, supplied spec §12).
 *
 * <p><strong>Not the same thing as {@link TopicProgressState}, and deliberately not merged
 * with it.</strong> That enum is a coarse progress ladder the device derives from cumulative
 * counts and syncs last-write-wins; it has a state machine, a wire contract, and devices
 * several releases behind that depend on both. This enum is a <em>diagnosis</em>, recomputed
 * from raw attempts on every meaningful change, with no legal-transition rules at all —
 * moving from STRONG straight to NEEDS_REVISION is not a suspicious event to reject, it is
 * the finding. Folding the two together would mean either giving the diagnosis a transition
 * guard that would suppress real findings, or removing the guard that stops a stale device
 * erasing practice history.
 *
 * <p>Stored as a string with a {@code CHECK}, not an ordinal — an ordinal makes inserting a
 * state later silently rewrite the meaning of every existing row.
 *
 * <p>These six are resolved in a fixed order by
 * {@code TopicHealthService.resolveState}; they are the <em>label</em>, while health,
 * confidence, trend and priority stay separate fields on the same row. §12 is explicit that
 * a topic can be health 63, trend IMPROVING and priority HIGH at once, and that this must
 * not render as "Weak".
 */
public enum TopicHealthState {

    /** Fewer than {@code EvidenceLevel}'s floor of meaningful attempts. Not "weak" (§21). */
    INSUFFICIENT_DATA,

    /** Real evidence, but not yet reliable enough — or improving — to call either way. */
    DEVELOPING,

    /** Good current performance, on evidence strong enough to believe. */
    STRONG,

    /** Reliable evidence of current weakness. The only state that asserts a problem. */
    NEEDS_ATTENTION,

    /** Was genuinely strong historically and has since declined meaningfully. */
    NEEDS_REVISION,

    /** Recent performance is materially better than historical. Never labelled weak (§6). */
    IMPROVING;

    /** Whether this state is one the radar surfaces as a problem to act on. */
    public boolean isConcern() {
        return this == NEEDS_ATTENTION || this == NEEDS_REVISION;
    }
}
