package com.sarkaritaiyaari.backend.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class QuestionResponse {

    private UUID id;
    private String correctAnswer;
    private UUID subjectId;
    private String subjectName;
    private UUID topicId;
    private String topicName;
    private String difficulty;
    private List<String> examCodes;
    private boolean premium;
    private OffsetDateTime updatedAt;
    private boolean deleted;
    private List<TranslationResponse> translations;

    /* --------------------------------------------- PYQ provenance (TICKET-2104) */

    private boolean pyq;
    private Integer pyqYear;
    private String pyqShift;
    private UUID sourcePaperId;
    private Integer questionNumber;
    private String sourceUrl;

    /**
     * Populated only on the admin CRUD reads, and only when a pair has actually been
     * detected (TICKET-2109). Left null on the sync/public paths — a student has no use for
     * it, and it would be dead weight on every one of ~37,900 synced rows.
     */
    private List<UUID> duplicateOfQuestionIds;

    /* ----------------------------------- Multi-type question foundation (V25, TASK-2301) */

    /** {@code correct_answer} stays authoritative; this is a structured mirror nothing reads yet. */
    private String questionType;
    private Map<String, Object> answerKey;
    private Map<String, Object> answerConfig;
    private Map<String, Object> contentStructure;

    /* ------------------------------------------- Shared content / groups (V29, TASK-2301 Phase P3) */

    /** Null for a standalone question — the entire bank as of P3's own migration, and most future content too. */
    private UUID questionGroupId;
    private Integer groupOrder;

    /** This question's own media (a diagram), separate from any media attached to its {@link #questionGroupId}. */
    private List<QuestionMediaResponse> media;

    /**
     * This question's exam appearances (TASK-2501 Phase 1). Left {@code null}/empty on the
     * student-facing sync/live/mock-sample paths — see {@link #duplicateOfQuestionIds}'s own
     * "dead weight on every synced row" note, same reasoning applies here.
     */
    private List<QuestionOccurrenceResponse> occurrences;

    /** TASK-2501 Phase 2. "PUBLISHED" for every question that predates this column and everything hand-authored/bulk-imported since. */
    private String contentStatus;

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

    public UUID getSubjectId() {
        return subjectId;
    }

    public void setSubjectId(UUID subjectId) {
        this.subjectId = subjectId;
    }

    public String getSubjectName() {
        return subjectName;
    }

    public void setSubjectName(String subjectName) {
        this.subjectName = subjectName;
    }

    public UUID getTopicId() {
        return topicId;
    }

    public void setTopicId(UUID topicId) {
        this.topicId = topicId;
    }

    public String getTopicName() {
        return topicName;
    }

    public void setTopicName(String topicName) {
        this.topicName = topicName;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }

    public List<String> getExamCodes() {
        return examCodes;
    }

    public void setExamCodes(List<String> examCodes) {
        this.examCodes = examCodes;
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

    public List<TranslationResponse> getTranslations() {
        return translations;
    }

    public void setTranslations(List<TranslationResponse> translations) {
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

    public List<UUID> getDuplicateOfQuestionIds() {
        return duplicateOfQuestionIds;
    }

    public void setDuplicateOfQuestionIds(List<UUID> duplicateOfQuestionIds) {
        this.duplicateOfQuestionIds = duplicateOfQuestionIds;
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

    public UUID getQuestionGroupId() {
        return questionGroupId;
    }

    public void setQuestionGroupId(UUID questionGroupId) {
        this.questionGroupId = questionGroupId;
    }

    public Integer getGroupOrder() {
        return groupOrder;
    }

    public void setGroupOrder(Integer groupOrder) {
        this.groupOrder = groupOrder;
    }

    public List<QuestionMediaResponse> getMedia() {
        return media;
    }

    public void setMedia(List<QuestionMediaResponse> media) {
        this.media = media;
    }

    public List<QuestionOccurrenceResponse> getOccurrences() {
        return occurrences;
    }

    public void setOccurrences(List<QuestionOccurrenceResponse> occurrences) {
        this.occurrences = occurrences;
    }

    public String getContentStatus() {
        return contentStatus;
    }

    public void setContentStatus(String contentStatus) {
        this.contentStatus = contentStatus;
    }
}
