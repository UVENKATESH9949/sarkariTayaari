package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * TASK-2401 Document 9 -- one row per unique downloaded file, deduplicated by
 * {@link #sha256Hash}. {@link #pageCount}/{@link #isTextExtractable} stay null until
 * Task 5's text extraction runs.
 */
@Entity
@Table(name = "ingestion_documents")
public class IngestionDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "notice_id")
    private IngestionNotice notice;

    @Column(name = "source_url", nullable = false)
    private String sourceUrl;

    @Column(name = "storage_url", nullable = false)
    private String storageUrl;

    @Column(name = "sha256_hash", nullable = false)
    private String sha256Hash;

    @Column(name = "file_size_bytes", nullable = false)
    private long fileSizeBytes;

    @Column(name = "mime_type", nullable = false)
    private String mimeType;

    @Column(name = "page_count")
    private Integer pageCount;

    @Column(name = "is_text_extractable")
    private Boolean isTextExtractable;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supersedes_document_id")
    private IngestionDocument supersedesDocument;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public IngestionNotice getNotice() {
        return notice;
    }

    public void setNotice(IngestionNotice notice) {
        this.notice = notice;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public String getStorageUrl() {
        return storageUrl;
    }

    public void setStorageUrl(String storageUrl) {
        this.storageUrl = storageUrl;
    }

    public String getSha256Hash() {
        return sha256Hash;
    }

    public void setSha256Hash(String sha256Hash) {
        this.sha256Hash = sha256Hash;
    }

    public long getFileSizeBytes() {
        return fileSizeBytes;
    }

    public void setFileSizeBytes(long fileSizeBytes) {
        this.fileSizeBytes = fileSizeBytes;
    }

    public String getMimeType() {
        return mimeType;
    }

    public void setMimeType(String mimeType) {
        this.mimeType = mimeType;
    }

    public Integer getPageCount() {
        return pageCount;
    }

    public void setPageCount(Integer pageCount) {
        this.pageCount = pageCount;
    }

    public Boolean getIsTextExtractable() {
        return isTextExtractable;
    }

    public void setIsTextExtractable(Boolean isTextExtractable) {
        this.isTextExtractable = isTextExtractable;
    }

    public IngestionDocument getSupersedesDocument() {
        return supersedesDocument;
    }

    public void setSupersedesDocument(IngestionDocument supersedesDocument) {
        this.supersedesDocument = supersedesDocument;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
