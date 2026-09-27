package com.sarkaritaiyaari.backend.video;

import java.net.URI;

/**
 * How a permitted caller should actually get the bytes.
 *
 * <p>Two shapes because the two stores work differently, and flattening them would mean either
 * proxying an object store through this backend or teaching every caller about storage. The
 * access decision is already made by the time one of these is returned - neither variant is a
 * second chance to check entitlement.
 */
public sealed interface VideoPlayback {

    /** This backend holds the file and serves it (the local-filesystem store). */
    record Stream(StoredVideo video) implements VideoPlayback {
    }

    /**
     * The client fetches it from the object store directly.
     *
     * <p>The URL is issued only after the caller passed every check, and the store is expected to
     * make it unguessable and short-lived - see {@code CloudinaryVideoStorage} for what that
     * actually amounts to on a given plan.
     */
    record Redirect(URI url) implements VideoPlayback {
    }
}
