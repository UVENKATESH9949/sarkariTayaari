package com.sarkaritaiyaari.backend.entity;

/**
 * Does a playable file exist yet. This is the generation lifecycle, and it is a different
 * question from {@link ContentStatus}, which is whether a human approved it.
 *
 * <p>Deliberately absent: NOT_AVAILABLE. The absence of a row is what not-available means;
 * storing it would require writing a row for every question that has no video, which is nearly
 * all of them. The read API synthesises that state when it finds nothing.
 *
 * <p>QUEUED/GENERATING/PROCESSING exist so an on-demand generation runner has somewhere to land
 * without a schema change. Nothing sets them today - an admin upload goes straight to READY.
 */
public enum VideoStatus {
    /** A generation request was recorded; no work has started. */
    QUEUED,
    /** A model or renderer is producing the lesson. */
    GENERATING,
    /** Rendered; being encoded, measured, or stored. */
    PROCESSING,
    /** A file exists and can be served. */
    READY,
    /** Generation failed. {@code error_message} says why, for operators only. */
    FAILED,
    /** Superseded or withdrawn; kept for history, never served. */
    ARCHIVED
}
