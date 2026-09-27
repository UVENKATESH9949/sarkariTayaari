package com.sarkaritaiyaari.backend.entitlement;

/**
 * Something a user may or may not be allowed to do, independent of how they came to be allowed.
 *
 * <p>This exists so that premium gating has exactly one name and one check point. The alternative
 * - scattering {@code if (user.isPremium())} through controllers and hiding buttons in the app -
 * is how a paywall ends up enforced only on the client, which is not enforcement at all.
 */
public enum Capability {
    /** Watching a generated video lesson. */
    AI_VIDEO
}
