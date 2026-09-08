package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/** TASK-2401 Document 9 -- one row per document-processing attempt. */
@Entity
@Table(name = "ingestion_extraction_jobs")
public class IngestionExtractionJob {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", nullable = false)
    private IngestionDocument document;

    @Column(name = "parser_version", nullable = false)
    private String parserVersion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ExtractionJobStatus status;

    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;

    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "fields_extracted_count", nullable = false)
    private int fieldsExtractedCount;

    @Column(name = "fields_requiring_ai_count", nullable = false)
    private int fieldsRequiringAiCount;

    @Column(name = "ai_tokens_used", nullable = false)
    private int aiTokensUsed;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public IngestionDocument getDocument() {
        return document;
    }

    public void setDocument(IngestionDocument document) {
        this.document = document;
    }

    public String getParserVersion() {
        return parserVersion;
    }

    public void setParserVersion(String parserVersion) {
        this.parserVersion = parserVersion;
    }

    public ExtractionJobStatus getStatus() {
        return status;
    }

    public void setStatus(ExtractionJobStatus status) {
        this.status = status;
    }

    public OffsetDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(OffsetDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public OffsetDateTime getFinishedAt() {
        return finishedAt;
    }

    public void setFinishedAt(OffsetDateTime finishedAt) {
        this.finishedAt = finishedAt;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public int getFieldsExtractedCount() {
        return fieldsExtractedCount;
    }

    public void setFieldsExtractedCount(int fieldsExtractedCount) {
        this.fieldsExtractedCount = fieldsExtractedCount;
    }

    public int getFieldsRequiringAiCount() {
        return fieldsRequiringAiCount;
    }

    public void setFieldsRequiringAiCount(int fieldsRequiringAiCount) {
        this.fieldsRequiringAiCount = fieldsRequiringAiCount;
    }

    public int getAiTokensUsed() {
        return aiTokensUsed;
    }

    public void setAiTokensUsed(int aiTokensUsed) {
        this.aiTokensUsed = aiTokensUsed;
    }
}
