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

import java.util.UUID;

/** Exam Guide spec §14 — one category's fee for a cycle. */
@Entity
@Table(name = "fee_rules", uniqueConstraints = @UniqueConstraint(columnNames = {"recruitment_cycle_id", "category"}))
public class FeeRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recruitment_cycle_id", nullable = false)
    private RecruitmentCycle recruitmentCycle;

    /** GENERAL | OBC | SC | ST | FEMALE | PWBD | EX_SERVICEMEN — open vocabulary, see the migration. */
    @Column(nullable = false)
    private String category;

    @Column(name = "amount_rupees", nullable = false)
    private int amountRupees;

    @Column(name = "is_exempted", nullable = false)
    private boolean exempted;

    private String notes;

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

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public int getAmountRupees() {
        return amountRupees;
    }

    public void setAmountRupees(int amountRupees) {
        this.amountRupees = amountRupees;
    }

    public boolean isExempted() {
        return exempted;
    }

    public void setExempted(boolean exempted) {
        this.exempted = exempted;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
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
