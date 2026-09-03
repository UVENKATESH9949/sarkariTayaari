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

import java.util.UUID;

/** Exam Guide spec §11 — one document row in a cycle's document catalogue. */
@Entity
@Table(name = "document_requirements")
public class DocumentRequirement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recruitment_cycle_id", nullable = false)
    private RecruitmentCycle recruitmentCycle;

    @Column(name = "document_name", nullable = false)
    private String documentName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DocumentRequirementLevel required = DocumentRequirementLevel.YES;

    @Column(name = "applicable_for")
    private String applicableFor;

    private String format;

    @Column(name = "max_size_kb")
    private Integer maxSizeKb;

    private String dimensions;

    private String instructions;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "source_id")
    private UUID sourceId;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public RecruitmentCycle getRecruitmentCycle() {
        return recruitmentCycle;
    }

    public void setRecruitmentCycle(RecruitmentCycle recruitmentCycle) {
        this.recruitmentCycle = recruitmentCycle;
    }

    public String getDocumentName() {
        return documentName;
    }

    public void setDocumentName(String documentName) {
        this.documentName = documentName;
    }

    public DocumentRequirementLevel getRequired() {
        return required;
    }

    public void setRequired(DocumentRequirementLevel required) {
        this.required = required;
    }

    public String getApplicableFor() {
        return applicableFor;
    }

    public void setApplicableFor(String applicableFor) {
        this.applicableFor = applicableFor;
    }

    public String getFormat() {
        return format;
    }

    public void setFormat(String format) {
        this.format = format;
    }

    public Integer getMaxSizeKb() {
        return maxSizeKb;
    }

    public void setMaxSizeKb(Integer maxSizeKb) {
        this.maxSizeKb = maxSizeKb;
    }

    public String getDimensions() {
        return dimensions;
    }

    public void setDimensions(String dimensions) {
        this.dimensions = dimensions;
    }

    public String getInstructions() {
        return instructions;
    }

    public void setInstructions(String instructions) {
        this.instructions = instructions;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public UUID getSourceId() {
        return sourceId;
    }

    public void setSourceId(UUID sourceId) {
        this.sourceId = sourceId;
    }
}
