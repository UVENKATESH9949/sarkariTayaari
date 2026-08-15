package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** The atomic timed sitting, and the unit a mock test is generated from. */
@Entity
@Table(name = "exam_papers", uniqueConstraints = @UniqueConstraint(columnNames = {"stage_id", "name"}))
public class ExamPaper {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stage_id", nullable = false)
    private ExamStage stage;

    @Column(nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paper_type", nullable = false)
    private PaperType paperType;

    @Column(name = "duration_minutes")
    private Integer durationMinutes;

    @Column(name = "total_marks")
    private BigDecimal totalMarks;

    @Column(name = "marks_correct")
    private BigDecimal marksCorrect;

    @Column(name = "marks_wrong")
    private BigDecimal marksWrong;

    /** CSAT and the UPSC language papers only need a pass mark, not a rank-contributing score. */
    @Column(name = "is_qualifying", nullable = false)
    private boolean qualifying;

    @Column(name = "qualifying_percentage")
    private BigDecimal qualifyingPercentage;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @OneToMany(mappedBy = "paper", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("displayOrder ASC")
    private List<PaperSection> sections = new ArrayList<>();

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public ExamStage getStage() {
        return stage;
    }

    public void setStage(ExamStage stage) {
        this.stage = stage;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public PaperType getPaperType() {
        return paperType;
    }

    public void setPaperType(PaperType paperType) {
        this.paperType = paperType;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(Integer durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    public BigDecimal getTotalMarks() {
        return totalMarks;
    }

    public void setTotalMarks(BigDecimal totalMarks) {
        this.totalMarks = totalMarks;
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

    public boolean isQualifying() {
        return qualifying;
    }

    public void setQualifying(boolean qualifying) {
        this.qualifying = qualifying;
    }

    public BigDecimal getQualifyingPercentage() {
        return qualifyingPercentage;
    }

    public void setQualifyingPercentage(BigDecimal qualifyingPercentage) {
        this.qualifyingPercentage = qualifyingPercentage;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public List<PaperSection> getSections() {
        return sections;
    }

    public void setSections(List<PaperSection> sections) {
        this.sections = sections;
    }
}
