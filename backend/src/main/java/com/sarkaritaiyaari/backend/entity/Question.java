package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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

    /* ------------------------------------- Multi-type question foundation (V25, TASK-2301) */

    /**
     * FK to {@code question_types.code}. Defaults to {@code SINGLE_CHOICE} at the database
     * level (every row before this migration was one); set explicitly here too, because a
     * future type will need to set it explicitly, and one write path silently relying on the
     * column default while every other sets it would be a trap for whoever adds the next one.
     */
    @Column(name = "question_type", nullable = false)
    private String questionType = QuestionTypeCode.SINGLE_CHOICE.name();

    /**
     * The canonical, structured answer — {@code correct_answer} in JSON form
     * ({@code {"correctOption": 1}} for SINGLE_CHOICE). Nothing reads this yet; it is
     * populated by {@code QuestionService} alongside {@code correct_answer} so it never
     * drifts, ahead of {@link com.sarkaritaiyaari.backend.evaluation.QuestionEvaluator}
     * being wired into a live scoring path in a later phase. See {@code QuestionResponse}'s
     * own note on why {@code correct_answer} — not this field — stays authoritative today.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "answer_key")
    private Map<String, Object> answerKey;

    /** Per-question evaluation/scoring overrides (partial credit, tolerance, …). Unused until P2. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "answer_config")
    private Map<String, Object> answerConfig;

    /** The language-independent skeleton (match/ordering element keys, statement keys, …). Unused until P2/P3. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "content_structure")
    private Map<String, Object> contentStructure;

    /* ------------------------------------------- Shared content / groups (V29, TASK-2301 Phase P3) */

    /** Null for a standalone question — the entire bank as of P3's own migration, and most future content too. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_group_id")
    private QuestionGroup questionGroup;

    /** This question's position among its group siblings. Null when {@link #questionGroup} is null. */
    @Column(name = "group_order")
    private Integer groupOrder;

    /**
     * TASK-2501 Phase 2. Reuses {@link ContentStatus}, the same DRAFT/REVIEW/PUBLISHED
     * lifecycle Exam Guide already applies to {@code recruitment_cycles} -- "is this fact
     * ready for students to see," asked of a question instead of a cycle. Every hand-
     * authored/bulk-imported question stays {@code PUBLISHED} (unchanged behavior); only the
     * ingestion Accept path ever sets {@code DRAFT}.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "content_status", nullable = false)
    private ContentStatus contentStatus = ContentStatus.PUBLISHED;

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

    public String getQuestionType() {
        return questionType;
    }

    public void setQuestionType(String questionType) {
        this.questionType = questionType;
    }

    public Map<String, Object> getAnswerKey() {
        return answerKey;
    }

    public void setAnswerKey(Map<String, Object> answerKey) {
        this.answerKey = answerKey;
    }

    public Map<String, Object> getAnswerConfig() {
        return answerConfig;
    }

    public void setAnswerConfig(Map<String, Object> answerConfig) {
        this.answerConfig = answerConfig;
    }

    public Map<String, Object> getContentStructure() {
        return contentStructure;
    }

    public void setContentStructure(Map<String, Object> contentStructure) {
        this.contentStructure = contentStructure;
    }

    public QuestionGroup getQuestionGroup() {
        return questionGroup;
    }

    public void setQuestionGroup(QuestionGroup questionGroup) {
        this.questionGroup = questionGroup;
    }

    public Integer getGroupOrder() {
        return groupOrder;
    }

    public void setGroupOrder(Integer groupOrder) {
        this.groupOrder = groupOrder;
    }

    public ContentStatus getContentStatus() {
        return contentStatus;
    }

    public void setContentStatus(ContentStatus contentStatus) {
        this.contentStatus = contentStatus;
    }
}
