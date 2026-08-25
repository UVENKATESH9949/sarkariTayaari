package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * Membership table for the temporary ~500-question pool served instead of the full
 * question bank while the app is in this development/testing phase (see
 * V9__temporary_question_pool.sql and app.question-pool.temporary-enabled). Only ever
 * referenced via its {@code question_id} in JPQL/Criteria subqueries — no repository or
 * mutating code exists for it yet, since nothing currently manages membership beyond the
 * one-time seed migration.
 */
@Entity
@Table(name = "temporary_question_pool")
public class TemporaryQuestionPool {

    @Id
    @Column(name = "question_id")
    private UUID questionId;

    public UUID getQuestionId() {
        return questionId;
    }

    public void setQuestionId(UUID questionId) {
        this.questionId = questionId;
    }
}
