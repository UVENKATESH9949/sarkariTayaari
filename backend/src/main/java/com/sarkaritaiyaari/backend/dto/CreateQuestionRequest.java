package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public class CreateQuestionRequest implements PyqProvenanceCarrier {

    /**
     * Defaults to "SINGLE_CHOICE" (V25/V26, TASK-2301) so a request shaped for the pre-Wave-A
     * API — which never sent this field — behaves exactly as before. Required (a real,
     * enabled {@code question_types} code) for MULTIPLE_CHOICE/TRUE_FALSE/ASSERTION_REASON/
     * STATEMENT_COMBINATION; validated in {@code QuestionService}, not by an annotation here,
     * since "which value is valid" is admin-editable data, not a compile-time enum.
     */
    private String questionType = "SINGLE_CHOICE";

    /**
     * Required and a letter A-D for SINGLE_CHOICE/ASSERTION_REASON/STATEMENT_COMBINATION —
     * validated in {@code QuestionService}, not {@code @NotBlank} here, because it is
     * genuinely optional for MULTIPLE_CHOICE/TRUE_FALSE (where {@link #answerKey} is
     * authoritative instead) and a blanket required-field annotation cannot express that.
     */
    private String correctAnswer;

    /**
     * Required for MULTIPLE_CHOICE ({@code {"correctOptions": [0,2]}}) and TRUE_FALSE
     * ({@code {"correctBoolean": true}}). Ignored for the other three types, which derive
     * their answer key from {@link #correctAnswer} server-side instead (P1's existing
     * behaviour, unchanged).
     */
    private Map<String, Object> answerKey;

    /**
     * The language-independent skeleton (V25/V27, TASK-2301 Phase P2 Wave B) — required for
     * MATCH ({@code {"leftKeys": [...], "rightKeys": [...]}}) and ORDERING
     * ({@code {"itemKeys": [...]}}), ignored for every other type. Immutable after creation,
     * like {@link #questionType} — there is no equivalent field on
     * {@code UpdateQuestionRequest} at all, since changing the set of keys mid-life would
     * strand any translation's per-language labels keyed against the old set.
     */
    private Map<String, Object> contentStructure;

    /**
     * Null for a standalone question (the entire bank as of Phase P3's own migration, and
     * most future content too) — must reference an existing, non-deleted question_group.
     * Unlike {@link #questionType}/{@link #contentStructure}, group membership is purely
     * organisational (it doesn't change how a question is evaluated), so it's editable via
     * {@code UpdateQuestionRequest} too, not fixed at creation.
     */
    private UUID questionGroupId;

    /** This question's position among its group siblings. Ignored when {@link #questionGroupId} is null. */
    private Integer groupOrder;

    @NotNull
    private UUID topicId;

    @NotBlank
    private String difficulty;

    @NotEmpty(message = "at least one exam code is required")
    private List<String> examCodes;

    private boolean premium;

    /* ------------------------------------------- PYQ provenance (TICKET-2104) */

    private boolean pyq;

    /**
     * Bounded rather than left open. A four-digit sanity range turns a typo'd "202" or
     * "20223" into a readable 400 instead of a stored value that quietly skews every trend
     * computed from it.
     */
    @Min(1950)
    @Max(2100)
    private Integer pyqYear;

    @Size(max = 30)
    private String pyqShift;

    private UUID sourcePaperId;

    @Min(1)
    private Integer questionNumber;

    private String sourceUrl;

    @NotEmpty(message = "at least one translation (the 'en' root language) is required")
    @Valid
    private List<TranslationRequest> translations;

    public String getQuestionType() {
        return questionType;
    }

    public void setQuestionType(String questionType) {
        this.questionType = questionType;
    }

    public String getCorrectAnswer() {
        return correctAnswer;
    }

    public void setCorrectAnswer(String correctAnswer) {
        this.correctAnswer = correctAnswer;
    }

    public Map<String, Object> getAnswerKey() {
        return answerKey;
    }

    public void setAnswerKey(Map<String, Object> answerKey) {
        this.answerKey = answerKey;
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

    public UUID getTopicId() {
        return topicId;
    }

    public void setTopicId(UUID topicId) {
        this.topicId = topicId;
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

    public List<TranslationRequest> getTranslations() {
        return translations;
    }

    public void setTranslations(List<TranslationRequest> translations) {
        this.translations = translations;
    }

    @Override
    public boolean isPyq() {
        return pyq;
    }

    public void setPyq(boolean pyq) {
        this.pyq = pyq;
    }

    @Override
    public Integer getPyqYear() {
        return pyqYear;
    }

    public void setPyqYear(Integer pyqYear) {
        this.pyqYear = pyqYear;
    }

    @Override
    public String getPyqShift() {
        return pyqShift;
    }

    public void setPyqShift(String pyqShift) {
        this.pyqShift = pyqShift;
    }

    @Override
    public UUID getSourcePaperId() {
        return sourcePaperId;
    }

    public void setSourcePaperId(UUID sourcePaperId) {
        this.sourcePaperId = sourcePaperId;
    }

    @Override
    public Integer getQuestionNumber() {
        return questionNumber;
    }

    public void setQuestionNumber(Integer questionNumber) {
        this.questionNumber = questionNumber;
    }

    @Override
    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }
}
