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
 * without a schema change. Nothing sets them today.
 *
 * <p>PENDING_UPLOAD/UPLOADING/UPLOAD_FAILED are the object-store leg, and they are deliberately
 * distinct from FAILED. A render that never produced a file and a finished file that could not be
 * uploaded are different problems with different fixes - the first needs regenerating, the second
 * only needs retrying - and collapsing them would make an operator guess which they were looking
 * at. The column is a plain VARCHAR with no CHECK, so adding values costs nothing (the same
 * property study_tasks.source relied on in V52).
 */
public enum VideoStatus {
    /** A generation request was recorded; no work has started. */
    QUEUED,
    /** The file is staged in this database, awaiting the publish that sends it to the store. */
    PENDING_UPLOAD,
    /** A promotion to the object store is in flight. */
    UPLOADING,
    /**
     * The file is still staged and an upload to the object store failed. {@code error_message}
     * says why. Retryable: the bytes are intact, only the transfer did not complete.
     */
    UPLOAD_FAILED,
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
