package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * The question-type reference table (V25) — same shape as {@link DifficultyLevel}: a real
 * table so an admin can see labels and disable a type without a code deploy, but every
 * code is also checked against {@link QuestionTypeCode} before anything type-specific runs,
 * so this table can disable a type, never invent one nothing can render.
 */
@Entity
@Table(name = "question_types")
public class QuestionType {

    @Id
    private String code;

    @Column(nullable = false)
    private String label;

    @Column(name = "evaluator_family", nullable = false)
    private String evaluatorFamily;

    @Column(name = "is_authoring_enabled", nullable = false)
    private boolean authoringEnabled;

    @Column(name = "default_negative_marking", nullable = false)
    private boolean defaultNegativeMarking;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getEvaluatorFamily() {
        return evaluatorFamily;
    }

    public void setEvaluatorFamily(String evaluatorFamily) {
        this.evaluatorFamily = evaluatorFamily;
    }

    public boolean isAuthoringEnabled() {
        return authoringEnabled;
    }

    public void setAuthoringEnabled(boolean authoringEnabled) {
        this.authoringEnabled = authoringEnabled;
    }

    public boolean isDefaultNegativeMarking() {
        return defaultNegativeMarking;
    }

    public void setDefaultNegativeMarking(boolean defaultNegativeMarking) {
        this.defaultNegativeMarking = defaultNegativeMarking;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
