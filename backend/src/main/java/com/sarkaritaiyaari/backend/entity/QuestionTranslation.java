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
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(
        name = "question_translations",
        uniqueConstraints = @UniqueConstraint(columnNames = {"question_id", "language_code"})
)
public class QuestionTranslation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "language_code", nullable = false)
    private Language language;

    @Column(name = "question_text", nullable = false, columnDefinition = "text")
    private String questionText;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private List<String> options;

    @Column(columnDefinition = "text")
    private String explanation;

    /**
     * Per-language authored content that does not fit the flat {@code options} array —
     * Assertion & Reason's {@code {assertion, reason}}, Statement-Based's
     * {@code {statements: [...]}} (V26, TASK-2301 Phase P2 Wave A). {@code options} stays
     * the fixed relationship/combination phrases for those two types, unchanged.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column
    private Map<String, Object> content;

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

    public Language getLanguage() {
        return language;
    }

    public void setLanguage(Language language) {
        this.language = language;
    }

    public String getQuestionText() {
        return questionText;
    }

    public void setQuestionText(String questionText) {
        this.questionText = questionText;
    }

    public List<String> getOptions() {
        return options;
    }

    public void setOptions(List<String> options) {
        this.options = options;
    }

    public String getExplanation() {
        return explanation;
    }

    public void setExplanation(String explanation) {
        this.explanation = explanation;
    }

    public Map<String, Object> getContent() {
        return content;
    }

    public void setContent(Map<String, Object> content) {
        this.content = content;
    }
}
