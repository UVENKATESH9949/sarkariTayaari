package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * An attached-but-not-yet-published video, held until an admin accepts it.
 *
 * <p>This is the staging half of the decided flow: attaching a file does not send it anywhere,
 * accepting it does. A reviewer streams from here to watch the video before deciding, which is the
 * only reason the flow is workable at all - accepting a video nobody could watch would not be a
 * review.
 *
 * <p>The row is deleted the moment the bytes reach the object store, so this table holds only what
 * is genuinely in flight rather than a second permanent copy of every video.
 *
 * <p>Its primary key IS the video id. One video has at most one staged file, and making that a
 * constraint rather than a convention is what stops a retry leaving an older copy behind to be
 * promoted later.
 */
@Entity
@Table(name = "lesson_video_uploads")
public class LessonVideoUpload {

    @Id
    @Column(name = "video_id", nullable = false, updatable = false)
    private UUID videoId;

    @Column(name = "bytes", nullable = false)
    private byte[] bytes;

    @Column(name = "mime_type", nullable = false)
    private String mimeType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "checksum_sha256", nullable = false)
    private String checksumSha256;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public UUID getVideoId() {
        return videoId;
    }

    public void setVideoId(UUID videoId) {
        this.videoId = videoId;
    }

    public byte[] getBytes() {
        return bytes;
    }

    public void setBytes(byte[] bytes) {
        this.bytes = bytes;
    }

    public String getMimeType() {
        return mimeType;
    }

    public void setMimeType(String mimeType) {
        this.mimeType = mimeType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public void setSizeBytes(long sizeBytes) {
        this.sizeBytes = sizeBytes;
    }

    public String getChecksumSha256() {
        return checksumSha256;
    }

    public void setChecksumSha256(String checksumSha256) {
        this.checksumSha256 = checksumSha256;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
