package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * WHAT should be taught, independent of how it is delivered.
 *
 * <p>The payload is the AI Video Studio's own Lesson JSON, stored verbatim:
 * {@code { id, title, exam, subject, topic, language, scenes[] }} where each scene is one of
 * title / concept / example / formula / summary. That schema is defined by a zod contract in the
 * studio repository and is read by both its renderer and its narration synthesis, so it is
 * already the real shape. Defining a second blueprint format here would guarantee the two drift,
 * and the studio's is the one that can actually be rendered.
 *
 * <p>Keeping this separate from {@link LessonVideo} is what lets the same teaching content later
 * become a text lesson, an interactive lesson, or a device-rendered lesson without re-deciding
 * what to teach. A video is one delivery of a blueprint, not the blueprint itself.
 *
 * <p>Owner is topic <em>or</em> question, never both - enforced by a CHECK constraint, following
 * {@code question_media} (V29) and {@code ai_content} (V41). Stored as bare UUIDs rather than JPA
 * relations: nothing here needs to navigate to a topic or question, the foreign keys still hold,
 * and this project has already been bitten once by detached-entity behaviour on a mapped relation
 * (see ADR-005).
 */
@Entity
@Table(name = "lesson_blueprints")
public class LessonBlueprint {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "topic_id")
    private UUID topicId;

    @Column(name = "question_id")
    private UUID questionId;

    @Column(name = "language_code", nullable = false, length = 10)
    private String languageCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "teaching_level", nullable = false, length = 20)
    private TeachingLevel teachingLevel = TeachingLevel.STANDARD;

    /** The studio's own lesson id, e.g. {@code "profit-and-loss"}. Not a foreign key. */
    @Column(name = "studio_lesson_id", length = 100)
    private String studioLessonId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private Map<String, Object> payload;

    @Column(name = "schema_version", nullable = false, length = 32)
    private String schemaVersion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BlueprintSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "content_status", nullable = false, length = 20)
    private ContentStatus contentStatus = ContentStatus.DRAFT;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    @Column(name = "reviewed_by_email", length = 255)
    private String reviewedByEmail;

    @Column(name = "is_deleted", nullable = false)
    private boolean deleted = false;

    @Version
    @Column(nullable = false)
    private long version;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getTopicId() {
        return topicId;
    }

    public void setTopicId(UUID topicId) {
        this.topicId = topicId;
    }

    public UUID getQuestionId() {
        return questionId;
    }

    public void setQuestionId(UUID questionId) {
        this.questionId = questionId;
    }

    public String getLanguageCode() {
        return languageCode;
    }

    public void setLanguageCode(String languageCode) {
        this.languageCode = languageCode;
    }

    public TeachingLevel getTeachingLevel() {
        return teachingLevel;
    }

    public void setTeachingLevel(TeachingLevel teachingLevel) {
        this.teachingLevel = teachingLevel;
    }

    public String getStudioLessonId() {
        return studioLessonId;
    }

    public void setStudioLessonId(String studioLessonId) {
        this.studioLessonId = studioLessonId;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, Object> payload) {
        this.payload = payload;
    }

    public String getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(String schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public BlueprintSource getSource() {
        return source;
    }

    public void setSource(BlueprintSource source) {
        this.source = source;
    }

    public ContentStatus getContentStatus() {
        return contentStatus;
    }

    public void setContentStatus(ContentStatus contentStatus) {
        this.contentStatus = contentStatus;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
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

    public OffsetDateTime getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(OffsetDateTime reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public String getReviewedByEmail() {
        return reviewedByEmail;
    }

    public void setReviewedByEmail(String reviewedByEmail) {
        this.reviewedByEmail = reviewedByEmail;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public void setDeleted(boolean deleted) {
        this.deleted = deleted;
    }

    public long getVersion() {
        return version;
    }

    public void setVersion(long version) {
        this.version = version;
    }
}
