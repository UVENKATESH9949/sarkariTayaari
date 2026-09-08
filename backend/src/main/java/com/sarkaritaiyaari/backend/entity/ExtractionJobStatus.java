package com.sarkaritaiyaari.backend.entity;

/** TASK-2401 Document 15 -- a plain status column is the whole "queue" at this pipeline's
 * scale; no distributed lock or dead-letter queue needed. */
public enum ExtractionJobStatus {
    PENDING,
    RUNNING,
    SUCCEEDED,
    FAILED,
}
