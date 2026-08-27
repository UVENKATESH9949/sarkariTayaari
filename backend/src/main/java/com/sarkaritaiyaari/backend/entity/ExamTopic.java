package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Which topics matter for a given exam, and optionally how much of the paper each is
 * worth. Closes the gap recorded in preparation-os-requirements.md §18.2: `exam_subjects`
 * only maps an exam to a *subject*, so topic relevance was reachable only transitively and
 * no per-exam topic attribute could be stored at all.
 *
 * A real entity rather than a plain join table because `weightagePercent` is a genuine
 * attribute of the relationship. The id is the synthetic "examCode:topicId" string rather
 * than a composite key — see ADR-005 and V12's comment for why (@IdClass broke
 * user_bookmarks with real 500s).
 *
 * `weightagePercent` here is the *admin's* curated figure. It is deliberately not the same
 * field as the weightage Epic L/TICKET-2106 will compute from previous-year questions; a
 * human override and a derived value have to stay distinguishable.
 */
@Entity
@Table(name = "exam_topics")
public class ExamTopic {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_code", nullable = false)
    private Exam exam;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    @Column(name = "weightage_percent")
    private BigDecimal weightagePercent;

    /** The id every row must use — keeps the synthetic key derivable rather than arbitrary. */
    public static String idFor(String examCode, UUID topicId) {
        return examCode + ":" + topicId;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Exam getExam() {
        return exam;
    }

    public void setExam(Exam exam) {
        this.exam = exam;
    }

    public Topic getTopic() {
        return topic;
    }

    public void setTopic(Topic topic) {
        this.topic = topic;
    }

    public BigDecimal getWeightagePercent() {
        return weightagePercent;
    }

    public void setWeightagePercent(BigDecimal weightagePercent) {
        this.weightagePercent = weightagePercent;
    }
}
