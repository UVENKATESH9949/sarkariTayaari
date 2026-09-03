package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * Exam Guide spec §9/§34. One row per cycle — the {@code @Id} IS the cycle's id
 * ({@link MapsId}), because eligibility is one fact about a cycle, not a list of things.
 */
@Entity
@Table(name = "eligibility_rules")
public class EligibilityRule {

    @Id
    private UUID recruitmentCycleId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "recruitment_cycle_id")
    private RecruitmentCycle recruitmentCycle;

    @Column(name = "minimum_age")
    private Integer minimumAge;

    @Column(name = "maximum_age")
    private Integer maximumAge;

    /** Age is computed as-of this date ("as on 01-08-2027"), never as-of today — see the migration. */
    @Column(name = "age_cutoff_date")
    private LocalDate ageCutoffDate;

    private String qualification;

    private String nationality;

    @Column(name = "gender_requirement")
    private String genderRequirement;

    /** e.g. {"OBC": 3, "SC": 5, "ST": 5, "PWBD": 10} — years of age relaxation per category. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "category_relaxation")
    private Map<String, Integer> categoryRelaxation;

    @Column(name = "special_requirements")
    private String specialRequirements;

    /** Plain id reference, not a managed association — matches Question.sourcePaperId's
     * convention: this is looked up by id only where the source's detail is actually
     * needed, not joined on every read. */
    @Column(name = "source_id")
    private UUID sourceId;

    public UUID getRecruitmentCycleId() {
        return recruitmentCycleId;
    }

    public RecruitmentCycle getRecruitmentCycle() {
        return recruitmentCycle;
    }

    public void setRecruitmentCycle(RecruitmentCycle recruitmentCycle) {
        this.recruitmentCycle = recruitmentCycle;
    }

    public Integer getMinimumAge() {
        return minimumAge;
    }

    public void setMinimumAge(Integer minimumAge) {
        this.minimumAge = minimumAge;
    }

    public Integer getMaximumAge() {
        return maximumAge;
    }

    public void setMaximumAge(Integer maximumAge) {
        this.maximumAge = maximumAge;
    }

    public LocalDate getAgeCutoffDate() {
        return ageCutoffDate;
    }

    public void setAgeCutoffDate(LocalDate ageCutoffDate) {
        this.ageCutoffDate = ageCutoffDate;
    }

    public String getQualification() {
        return qualification;
    }

    public void setQualification(String qualification) {
        this.qualification = qualification;
    }

    public String getNationality() {
        return nationality;
    }

    public void setNationality(String nationality) {
        this.nationality = nationality;
    }

    public String getGenderRequirement() {
        return genderRequirement;
    }

    public void setGenderRequirement(String genderRequirement) {
        this.genderRequirement = genderRequirement;
    }

    public Map<String, Integer> getCategoryRelaxation() {
        return categoryRelaxation;
    }

    public void setCategoryRelaxation(Map<String, Integer> categoryRelaxation) {
        this.categoryRelaxation = categoryRelaxation;
    }

    public String getSpecialRequirements() {
        return specialRequirements;
    }

    public void setSpecialRequirements(String specialRequirements) {
        this.specialRequirements = specialRequirements;
    }

    public UUID getSourceId() {
        return sourceId;
    }

    public void setSourceId(UUID sourceId) {
        this.sourceId = sourceId;
    }
}
