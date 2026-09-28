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

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One rendered delivery of a {@link LessonBlueprint}.
 *
 * <p>Two status columns, on purpose. {@code status} answers "does a playable file exist yet";
 * {@code contentStatus} answers "has a human approved it". A video can be READY and still DRAFT,
 * which is exactly what an admin needs in order to watch it before students can.
 *
 * <p>{@code storageKey} is a key, not a URL. Every other asset in this schema stores a public
 * Cloudinary secure_url on the row. That is wrong for video: a premium video behind a public,
 * guessable URL is not gated at all. A key is resolved to bytes by VideoStorage at serve time, so
 * the backend remains the thing that decides who may watch, and swapping local disk for object
 * storage later is one class rather than a schema change.
 *
 * <p>{@code contentVersion} is the device cache key, together with the id. A device holding v1
 * sees v2 and re-downloads. Without it, a corrected video would never reach anyone who already
 * had the old one.
 *
 * <p>The owner is denormalised here rather than reached through {@code blueprintId} because an
 * uploaded video may have no blueprint at all, and the hot read must not depend on a blueprint
 * row existing.
 */
@Entity
@Table(name = "lesson_videos")
public class LessonVideo {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "blueprint_id")
    private UUID blueprintId;

    @Column(name = "topic_id")
    private UUID topicId;

    @Column(name = "question_id")
    private UUID questionId;

    @Column(name = "language_code", nullable = false, length = 10)
    private String languageCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "teaching_level", nullable = false, length = 20)
    private TeachingLevel teachingLevel = TeachingLevel.STANDARD;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private VideoQuality quality = VideoQuality.STANDARD;

    @Column(name = "content_version", nullable = false)
    private int contentVersion = 1;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private VideoStatus status = VideoStatus.QUEUED;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private VideoSource source;

    @Column(name = "storage_key")
    private String storageKey;

    @Column(name = "mime_type", length = 100)
    private String mimeType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    private Integer width;

    private Integer height;

    @Column(name = "checksum_sha256", length = 64)
    private String checksumSha256;

    @Enumerated(EnumType.STRING)
    @Column(name = "content_status", nullable = false, length = 20)
    private ContentStatus contentStatus = ContentStatus.DRAFT;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "is_premium", nullable = false)
    private boolean premium = false;

    @Column(name = "error_message")
    private String errorMessage;

    /**
     * How many times promotion to the object store has been attempted, and when the last one ran.
     * Operator-facing: without them a stuck video cannot be told apart from one whose first
     * attempt has simply not happened yet, and "let the admin retry" becomes retrying blind.
     */
    @Column(name = "upload_attempts", nullable = false)
    private int uploadAttempts;

    @Column(name = "last_upload_attempt_at")
    private OffsetDateTime lastUploadAttemptAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @Column(name = "published_at")
    private OffsetDateTime publishedAt;

    @Column(name = "reviewed_by_email", length = 255)
    private String reviewedByEmail;

    @Column(name = "is_deleted", nullable = false)
    private boolean deleted = false;

    @Version
    @Column(nullable = false)
    private long version;

    /** True when this row is both approved and actually playable. */
    public boolean isPlayable() {
        return !deleted
                && status == VideoStatus.READY
                && contentStatus == ContentStatus.PUBLISHED
                && storageKey != null;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getBlueprintId() {
        return blueprintId;
    }

    public void setBlueprintId(UUID blueprintId) {
        this.blueprintId = blueprintId;
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

    public VideoQuality getQuality() {
        return quality;
    }

    public void setQuality(VideoQuality quality) {
        this.quality = quality;
    }

    public int getContentVersion() {
        return contentVersion;
    }

    public void setContentVersion(int contentVersion) {
        this.contentVersion = contentVersion;
    }

    public VideoStatus getStatus() {
        return status;
    }

    public void setStatus(VideoStatus status) {
        this.status = status;
    }

    public VideoSource getSource() {
        return source;
    }

    public void setSource(VideoSource source) {
        this.source = source;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public void setStorageKey(String storageKey) {
        this.storageKey = storageKey;
    }

    public String getMimeType() {
        return mimeType;
    }

    public void setMimeType(String mimeType) {
        this.mimeType = mimeType;
    }

    public Long getSizeBytes() {
        return sizeBytes;
    }

    public void setSizeBytes(Long sizeBytes) {
        this.sizeBytes = sizeBytes;
    }

    public Integer getDurationSeconds() {
        return durationSeconds;
    }

    public void setDurationSeconds(Integer durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public Integer getWidth() {
        return width;
    }

    public void setWidth(Integer width) {
        this.width = width;
    }

    public Integer getHeight() {
        return height;
    }

    public void setHeight(Integer height) {
        this.height = height;
    }

    public String getChecksumSha256() {
        return checksumSha256;
    }

    public void setChecksumSha256(String checksumSha256) {
        this.checksumSha256 = checksumSha256;
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

    public boolean isPremium() {
        return premium;
    }

    public void setPremium(boolean premium) {
        this.premium = premium;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public int getUploadAttempts() {
        return uploadAttempts;
    }

    public void setUploadAttempts(int uploadAttempts) {
        this.uploadAttempts = uploadAttempts;
    }

    public OffsetDateTime getLastUploadAttemptAt() {
        return lastUploadAttemptAt;
    }

    public void setLastUploadAttemptAt(OffsetDateTime lastUploadAttemptAt) {
        this.lastUploadAttemptAt = lastUploadAttemptAt;
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

    public OffsetDateTime getPublishedAt() {
        return publishedAt;
    }

    public void setPublishedAt(OffsetDateTime publishedAt) {
        this.publishedAt = publishedAt;
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
