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
 * TASK-2501 Phase 1 -- one real-world appearance of a canonical {@link Question}. See
 * {@code V36__question_occurrences.sql} for why this exists: the same question can now
 * legitimately appear in more than one exam/year/shift without duplicating the whole row.
 *
 * <p>{@link #sourcePaperId}/{@link #sourceDocumentId} are plain ids, not mapped
 * associations -- same reasoning {@link Question#getSourcePaperId()} already gives: nothing
 * here needs to navigate into the paper or document as an object graph, and a lazy proxy
 * would be one more thing for a batch read to trip over.
 */
@Entity
@Table(name = "question_occurrences")
public class QuestionOccurrence {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Column(name = "exam_code", length = 30)
    private String examCode;

    @Column(name = "pyq_year")
    private Integer pyqYear;

    @Column(name = "pyq_shift", length = 30)
    private String pyqShift;

    @Column(name = "source_paper_id")
    private UUID sourcePaperId;

    @Column(name = "question_number")
    private Integer questionNumber;

    @Column(name = "source_url", columnDefinition = "text")
    private String sourceUrl;

    /** Set only for an occurrence the Phase 2 ingestion pipeline created. */
    @Column(name = "source_document_id")
    private UUID sourceDocumentId;

    @Column(name = "page_number")
    private Integer pageNumber;

    @Column(name = "verbatim_text", columnDefinition = "text")
    private String verbatimText;

    /**
     * True for the single row {@code QuestionService.syncLegacyOccurrence} derives from the
     * question's own singular pyq_year/pyq_shift/... columns -- replaced wholesale on every
     * write, never accumulated. False for anything explicitly added as an additional
     * occurrence (via {@code QuestionOccurrenceController}) or produced by the ingestion
     * pipeline -- both of those are left alone by that sync.
     */
    @Column(name = "is_legacy_derived", nullable = false)
    private boolean legacyDerived;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public Question getQuestion() {
        return question;
    }

    public void setQuestion(Question question) {
        this.question = question;
    }

    public String getExamCode() {
        return examCode;
    }

    public void setExamCode(String examCode) {
        this.examCode = examCode;
    }

    public Integer getPyqYear() {
        return pyqYear;
    }

    public void setPyqYear(Integer pyqYear) {
        this.pyqYear = pyqYear;
    }

    public String getPyqShift() {
        return pyqShift;
    }

    public void setPyqShift(String pyqShift) {
        this.pyqShift = pyqShift;
    }

    public UUID getSourcePaperId() {
        return sourcePaperId;
    }

    public void setSourcePaperId(UUID sourcePaperId) {
        this.sourcePaperId = sourcePaperId;
    }

    public Integer getQuestionNumber() {
        return questionNumber;
    }

    public void setQuestionNumber(Integer questionNumber) {
        this.questionNumber = questionNumber;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public UUID getSourceDocumentId() {
        return sourceDocumentId;
    }

    public void setSourceDocumentId(UUID sourceDocumentId) {
        this.sourceDocumentId = sourceDocumentId;
    }

    public Integer getPageNumber() {
        return pageNumber;
    }

    public void setPageNumber(Integer pageNumber) {
        this.pageNumber = pageNumber;
    }

    public String getVerbatimText() {
        return verbatimText;
    }

    public void setVerbatimText(String verbatimText) {
        this.verbatimText = verbatimText;
    }

    public boolean isLegacyDerived() {
        return legacyDerived;
    }

    public void setLegacyDerived(boolean legacyDerived) {
        this.legacyDerived = legacyDerived;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
