package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One user's Ready/Missing/Not-Applicable state against one document requirement (Exam
 * Guide spec §11).
 *
 * <p>Synthetic string {@code id} ({@code "{userId}:{documentRequirementId}"}), not a JPA
 * {@code @IdClass} composite key — see ADR-005 (reports/architecture-decisions.md): a
 * composite key caused real 500s on {@code user_bookmarks} via {@code isNew()}
 * misbehaving for a derived identifier. Same convention as {@code UserBookmark} and
 * {@code UserTopicProgress}.
 */
@Entity
@Table(name = "user_document_status")
public class UserDocumentStatus {

    @Id
    private String id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_requirement_id", nullable = false)
    private DocumentRequirement documentRequirement;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserDocumentReadiness status = UserDocumentReadiness.MISSING;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    /** {@code "{userId}:{documentRequirementId}"} — matches how UserBookmark/UserTopicProgress build theirs. */
    public static String buildId(UUID userId, UUID documentRequirementId) {
        return userId + ":" + documentRequirementId;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public DocumentRequirement getDocumentRequirement() {
        return documentRequirement;
    }

    public void setDocumentRequirement(DocumentRequirement documentRequirement) {
        this.documentRequirement = documentRequirement;
    }

    public UserDocumentReadiness getStatus() {
        return status;
    }

    public void setStatus(UserDocumentReadiness status) {
        this.status = status;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
