package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

/**
 * Cached {@code PROFILE_SUMMARY} narrative for one (user, exam) pair. Id is derived
 * (userId + ":" + examCode), not a composite key — see V45__profile_summary_cache.sql for why,
 * and for why the cache is keyed on a content hash rather than a timestamp.
 */
@Entity
@Table(name = "user_profile_summaries")
public class UserProfileSummary {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "exam_code", nullable = false)
    private String examCode;

    /** SHA-256 of the exact facts the cached narrative was generated from. */
    @Column(name = "context_hash", nullable = false)
    private String contextHash;

    @Column(name = "language_code", nullable = false)
    private String languageCode;

    @Column(name = "narrative", nullable = false)
    private String narrative;

    @Column(name = "generated_at", nullable = false)
    private OffsetDateTime generatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getExamCode() { return examCode; }
    public void setExamCode(String examCode) { this.examCode = examCode; }

    public String getContextHash() { return contextHash; }
    public void setContextHash(String contextHash) { this.contextHash = contextHash; }

    public String getLanguageCode() { return languageCode; }
    public void setLanguageCode(String languageCode) { this.languageCode = languageCode; }

    public String getNarrative() { return narrative; }
    public void setNarrative(String narrative) { this.narrative = narrative; }

    public OffsetDateTime getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(OffsetDateTime generatedAt) { this.generatedAt = generatedAt; }
}
