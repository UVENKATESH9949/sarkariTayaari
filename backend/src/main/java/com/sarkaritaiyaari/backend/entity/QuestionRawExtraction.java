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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * TASK-2501 Phase 2 -- immutable raw output straight off a question-paper PDF, one row per
 * (document, extractor_version, position-in-document). Never updated; re-running extraction
 * with a new {@link #extractorVersion} produces new rows so an already-published question's
 * source record is never silently rewritten underneath it. See V37's own migration comment.
 */
@Entity
@Table(name = "question_raw_extractions")
public class QuestionRawExtraction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", nullable = false)
    private IngestionDocument document;

    @Column(name = "extractor_version", nullable = false)
    private String extractorVersion;

    @Column(name = "position_in_document", nullable = false)
    private int positionInDocument;

    @Column(name = "page_number")
    private Integer pageNumber;

    @Column(name = "raw_question_text", nullable = false, columnDefinition = "text")
    private String rawQuestionText;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_options")
    private List<String> rawOptions;

    @Column(name = "raw_answer_text")
    private String rawAnswerText;

    @Column(name = "is_text_extractable", nullable = false)
    private boolean textExtractable = true;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

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

    public String getExtractorVersion() {
        return extractorVersion;
    }

    public void setExtractorVersion(String extractorVersion) {
        this.extractorVersion = extractorVersion;
    }

    public int getPositionInDocument() {
        return positionInDocument;
    }

    public void setPositionInDocument(int positionInDocument) {
        this.positionInDocument = positionInDocument;
    }

    public Integer getPageNumber() {
        return pageNumber;
    }

    public void setPageNumber(Integer pageNumber) {
        this.pageNumber = pageNumber;
    }

    public String getRawQuestionText() {
        return rawQuestionText;
    }

    public void setRawQuestionText(String rawQuestionText) {
        this.rawQuestionText = rawQuestionText;
    }

    public List<String> getRawOptions() {
        return rawOptions;
    }

    public void setRawOptions(List<String> rawOptions) {
        this.rawOptions = rawOptions;
    }

    public String getRawAnswerText() {
        return rawAnswerText;
    }

    public void setRawAnswerText(String rawAnswerText) {
        this.rawAnswerText = rawAnswerText;
    }

    public boolean isTextExtractable() {
        return textExtractable;
    }

    public void setTextExtractable(boolean textExtractable) {
        this.textExtractable = textExtractable;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
