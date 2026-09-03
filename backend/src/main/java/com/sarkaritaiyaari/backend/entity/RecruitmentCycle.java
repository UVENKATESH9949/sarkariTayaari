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
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * One year's/round's version of an exam (Exam Guide spec §33 "Information Versioning").
 * Eligibility, dates, fees and documents all belong to a cycle, not to the exam itself,
 * so a new year never overwrites the old one's data — see {@code eligibilityRule},
 * {@code importantDates} etc. below and the cascade note on the migration.
 */
@Entity
@Table(name = "recruitment_cycles", uniqueConstraints = @UniqueConstraint(columnNames = {"exam_code", "cycle_name"}))
public class RecruitmentCycle {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_code", nullable = false)
    private Exam exam;

    @Column(name = "cycle_name", nullable = false)
    private String cycleName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RecruitmentCycleStatus status = RecruitmentCycleStatus.NOT_ANNOUNCED;

    @Column(name = "notification_date")
    private LocalDate notificationDate;

    @Column(name = "application_start")
    private LocalDate applicationStart;

    @Column(name = "application_end")
    private LocalDate applicationEnd;

    @Column(name = "exam_start")
    private LocalDate examStart;

    @Column(name = "exam_end")
    private LocalDate examEnd;

    @Column(name = "vacancy_count")
    private Integer vacancyCount;

    @Column(name = "notification_url")
    private String notificationUrl;

    /** Exam Guide spec §1/§4 "What is this exam?" — a plain-language overview paragraph. */
    @Column(name = "overview_text", columnDefinition = "TEXT")
    private String overviewText;

    /**
     * §62's "current cycle" logic: admin-set, not date-derived. See the migration's
     * {@code uq_recruitment_cycles_current} partial unique index, which is what makes
     * "at most one current cycle per exam" a DB guarantee rather than an app convention.
     */
    @Column(name = "is_current", nullable = false)
    private boolean current;

    /**
     * True for seeded/editorial content that has never been backed by a real
     * notification. Rendered as a visible badge on every consumer (mobile + admin) —
     * see the report for why this exists as a persistent flag rather than a one-time
     * seeding note.
     */
    @Column(name = "is_demo", nullable = false)
    private boolean demo;

    /**
     * Exam Guide spec §36 "Content Validation States" — gates whether this cycle (and
     * everything under it) is visible to public/mobile reads. Defaults to DRAFT for a
     * newly-created cycle in the Java layer (the DB column itself defaults to PUBLISHED
     * for direct-SQL safety — see the V18 migration comment for why the two differ).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "content_status", nullable = false)
    private ContentStatus contentStatus = ContentStatus.DRAFT;

    @Column(name = "last_verified_at")
    private OffsetDateTime lastVerifiedAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @OneToMany(mappedBy = "recruitmentCycle", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("displayOrder asc")
    private List<ImportantDate> importantDates = new ArrayList<>();

    @OneToMany(mappedBy = "recruitmentCycle", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("displayOrder asc")
    private List<DocumentRequirement> documentRequirements = new ArrayList<>();

    @OneToMany(mappedBy = "recruitmentCycle", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("stepNumber asc")
    private List<ApplicationStep> applicationSteps = new ArrayList<>();

    @OneToMany(mappedBy = "recruitmentCycle", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("displayOrder asc")
    private List<ApplicationMistake> applicationMistakes = new ArrayList<>();

    @OneToMany(mappedBy = "recruitmentCycle", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("displayOrder asc")
    private List<FeeRule> feeRules = new ArrayList<>();

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

    public String getCycleName() {
        return cycleName;
    }

    public void setCycleName(String cycleName) {
        this.cycleName = cycleName;
    }

    public RecruitmentCycleStatus getStatus() {
        return status;
    }

    public void setStatus(RecruitmentCycleStatus status) {
        this.status = status;
    }

    public LocalDate getNotificationDate() {
        return notificationDate;
    }

    public void setNotificationDate(LocalDate notificationDate) {
        this.notificationDate = notificationDate;
    }

    public LocalDate getApplicationStart() {
        return applicationStart;
    }

    public void setApplicationStart(LocalDate applicationStart) {
        this.applicationStart = applicationStart;
    }

    public LocalDate getApplicationEnd() {
        return applicationEnd;
    }

    public void setApplicationEnd(LocalDate applicationEnd) {
        this.applicationEnd = applicationEnd;
    }

    public LocalDate getExamStart() {
        return examStart;
    }

    public void setExamStart(LocalDate examStart) {
        this.examStart = examStart;
    }

    public LocalDate getExamEnd() {
        return examEnd;
    }

    public void setExamEnd(LocalDate examEnd) {
        this.examEnd = examEnd;
    }

    public Integer getVacancyCount() {
        return vacancyCount;
    }

    public void setVacancyCount(Integer vacancyCount) {
        this.vacancyCount = vacancyCount;
    }

    public String getNotificationUrl() {
        return notificationUrl;
    }

    public void setNotificationUrl(String notificationUrl) {
        this.notificationUrl = notificationUrl;
    }

    public String getOverviewText() {
        return overviewText;
    }

    public void setOverviewText(String overviewText) {
        this.overviewText = overviewText;
    }

    public boolean isCurrent() {
        return current;
    }

    public void setCurrent(boolean current) {
        this.current = current;
    }

    public boolean isDemo() {
        return demo;
    }

    public void setDemo(boolean demo) {
        this.demo = demo;
    }

    public ContentStatus getContentStatus() {
        return contentStatus;
    }

    public void setContentStatus(ContentStatus contentStatus) {
        this.contentStatus = contentStatus;
    }

    public OffsetDateTime getLastVerifiedAt() {
        return lastVerifiedAt;
    }

    public void setLastVerifiedAt(OffsetDateTime lastVerifiedAt) {
        this.lastVerifiedAt = lastVerifiedAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public List<ImportantDate> getImportantDates() {
        return importantDates;
    }

    public List<DocumentRequirement> getDocumentRequirements() {
        return documentRequirements;
    }

    public List<ApplicationStep> getApplicationSteps() {
        return applicationSteps;
    }

    public List<ApplicationMistake> getApplicationMistakes() {
        return applicationMistakes;
    }

    public List<FeeRule> getFeeRules() {
        return feeRules;
    }
}
