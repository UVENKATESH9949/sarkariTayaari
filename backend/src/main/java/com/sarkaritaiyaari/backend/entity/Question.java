package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "questions")
public class Question {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "correct_answer", nullable = false)
    private String correctAnswer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    @Column(nullable = false)
    private String difficulty;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "question_exam_types",
            joinColumns = @JoinColumn(name = "question_id"),
            inverseJoinColumns = @JoinColumn(name = "exam_code")
    )
    private Set<Exam> exams = new HashSet<>();

    @Column(name = "is_premium", nullable = false)
    private boolean premium;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "is_deleted", nullable = false)
    private boolean deleted;

    /* ------------------------------------------------- PYQ provenance (TICKET-2104) */

    /**
     * Whether this is a previous-year question. Stored rather than derived from
     * {@code pyqYear != null}: a question can be known to be a PYQ while its exact year is
     * still unverified, and collapsing the two makes "PYQ, year unknown" unrepresentable.
     */
    @Column(name = "is_pyq", nullable = false)
    private boolean pyq;

    @Column(name = "pyq_year")
    private Integer pyqYear;

    /** Free text — shift naming is not standardised across conducting bodies. See V13. */
    @Column(name = "pyq_shift", length = 30)
    private String pyqShift;

    /**
     * The real paper this appeared in, when known. A plain id rather than a
     * {@code @ManyToOne ExamPaper}: nothing on the question side ever needs to navigate
     * into the paper, and a lazy association here would be one more proxy for the sync
     * mapper to trip over on the hottest read path in the system.
     */
    @Column(name = "source_paper_id")
    private UUID sourcePaperId;

    @Column(name = "question_number")
    private Integer questionNumber;

    @Column(name = "source_url", columnDefinition = "text")
    private String sourceUrl;

    /* --------------------------------------------- Duplicate detection (TICKET-2109) */

    /**
     * Normalised-text digest of the English translation, so a duplicate check is an indexed
     * equality lookup instead of a full-table text scan. Written by
     * {@code DuplicateDetectionService}, which owns the normalisation — nothing else should
     * set this, or the two sides stop agreeing.
     */
    @Column(name = "content_fingerprint", length = 32)
    private String contentFingerprint;

    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<QuestionTranslation> translations = new ArrayList<>();

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getCorrectAnswer() {
        return correctAnswer;
    }

    public void setCorrectAnswer(String correctAnswer) {
        this.correctAnswer = correctAnswer;
    }

    public Topic getTopic() {
        return topic;
    }

    public void setTopic(Topic topic) {
        this.topic = topic;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }

    public Set<Exam> getExams() {
        return exams;
    }

    public void setExams(Set<Exam> exams) {
        this.exams = exams;
    }

    public boolean isPremium() {
        return premium;
    }

    public void setPremium(boolean premium) {
        this.premium = premium;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public void setDeleted(boolean deleted) {
        this.deleted = deleted;
    }

    public List<QuestionTranslation> getTranslations() {
        return translations;
    }

    public void setTranslations(List<QuestionTranslation> translations) {
        this.translations = translations;
    }

    public boolean isPyq() {
        return pyq;
    }

    public void setPyq(boolean pyq) {
        this.pyq = pyq;
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

    public String getContentFingerprint() {
        return contentFingerprint;
    }

    public void setContentFingerprint(String contentFingerprint) {
        this.contentFingerprint = contentFingerprint;
    }
}
