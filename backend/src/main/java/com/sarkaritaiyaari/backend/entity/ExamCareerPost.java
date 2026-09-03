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

/**
 * One post a passing candidate can be assigned to for an exam (spec §25/§26). Exam-scoped,
 * not recruitment-cycle-scoped — see the V19 migration comment for why. An exam can have
 * several of these (SSC CGL recruits for multiple distinct posts at once).
 */
@Entity
@Table(name = "exam_career_posts")
public class ExamCareerPost {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_code", nullable = false)
    private Exam exam;

    @Column(name = "post_title", nullable = false)
    private String postTitle;

    @Column(name = "pay_level")
    private String payLevel;

    @Column(name = "salary_min_rupees")
    private Integer salaryMinRupees;

    @Column(name = "salary_max_rupees")
    private Integer salaryMaxRupees;

    @Column(name = "growth_path", columnDefinition = "text")
    private String growthPath;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "source_id")
    private UUID sourceId;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public Exam getExam() {
        return exam;
    }

    public void setExam(Exam exam) {
        this.exam = exam;
    }

    public String getPostTitle() {
        return postTitle;
    }

    public void setPostTitle(String postTitle) {
        this.postTitle = postTitle;
    }

    public String getPayLevel() {
        return payLevel;
    }

    public void setPayLevel(String payLevel) {
        this.payLevel = payLevel;
    }

    public Integer getSalaryMinRupees() {
        return salaryMinRupees;
    }

    public void setSalaryMinRupees(Integer salaryMinRupees) {
        this.salaryMinRupees = salaryMinRupees;
    }

    public Integer getSalaryMaxRupees() {
        return salaryMaxRupees;
    }

    public void setSalaryMaxRupees(Integer salaryMaxRupees) {
        this.salaryMaxRupees = salaryMaxRupees;
    }

    public String getGrowthPath() {
        return growthPath;
    }

    public void setGrowthPath(String growthPath) {
        this.growthPath = growthPath;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public UUID getSourceId() {
        return sourceId;
    }

    public void setSourceId(UUID sourceId) {
        this.sourceId = sourceId;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
