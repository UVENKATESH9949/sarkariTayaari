package com.sarkaritaiyaari.backend.entity;

/**
 * TASK-2401 Document 3. What shape a source's own listing mechanism takes -- resolved
 * alongside {@code parser_key} to pick the right {@code NoticeSourceAdapter} bean.
 * HYBRID covers a source with more than one mechanism (e.g. an API for some content and
 * plain PDF links for the rest).
 */
public enum IngestionSourceType {
    API,
    WEBSITE,
    PDF,
    RSS,
    SITEMAP,
    MANUAL,
    HYBRID,
}
