package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/** A block within a paper, carrying its question count and optionally its own timer and marking. */
@Entity
@Table(name = "paper_sections", uniqueConstraints = @UniqueConstraint(columnNames = {"paper_id", "name"}))
public class PaperSection {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paper_id", nullable = false)
    private ExamPaper paper;

    @Column(nullable = false)
    private String name;

    @Column(name = "question_count", nullable = false)
    private int questionCount;

    /** null = shares the paper's overall time (SSC); set = separately timed and enforced (IBPS). */
    @Column(name = "duration_minutes")
    private Integer durationMinutes;

    /** null = inherit the paper's marking; set = override for this section only. */
    @Column(name = "marks_correct")
    private BigDecimal marksCorrect;

    @Column(name = "marks_wrong")
    private BigDecimal marksWrong;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    /**
     * Many-to-many: UPSC's single "General Studies" section spans several subjects,
     * while an SSC section maps to exactly one.
     */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "section_subjects",
            joinColumns = @JoinColumn(name = "section_id"),
            inverseJoinColumns = @JoinColumn(name = "subject_id")
    )
    private Set<Subject> subjects = new LinkedHashSet<>();

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public ExamPaper getPaper() {
        return paper;
    }

    public void setPaper(ExamPaper paper) {
        this.paper = paper;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getQuestionCount() {
        return questionCount;
    }

    public void setQuestionCount(int questionCount) {
        this.questionCount = questionCount;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(Integer durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    public BigDecimal getMarksCorrect() {
        return marksCorrect;
    }

    public void setMarksCorrect(BigDecimal marksCorrect) {
        this.marksCorrect = marksCorrect;
    }

    public BigDecimal getMarksWrong() {
        return marksWrong;
    }

    public void setMarksWrong(BigDecimal marksWrong) {
        this.marksWrong = marksWrong;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public Set<Subject> getSubjects() {
        return subjects;
    }

    public void setSubjects(Set<Subject> subjects) {
        this.subjects = subjects;
    }
}
