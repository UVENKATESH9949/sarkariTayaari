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

import java.util.UUID;

/** Exam Guide spec §13 — "Common Application Mistakes". A flat list, not tied to a step
 * (see the migration comment on why this isn't folded into application_steps). */
@Entity
@Table(name = "application_mistakes")
public class ApplicationMistake {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recruitment_cycle_id", nullable = false)
    private RecruitmentCycle recruitmentCycle;

    @Column(nullable = false)
    private String mistake;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

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

    public String getMistake() {
        return mistake;
    }

    public void setMistake(String mistake) {
        this.mistake = mistake;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
