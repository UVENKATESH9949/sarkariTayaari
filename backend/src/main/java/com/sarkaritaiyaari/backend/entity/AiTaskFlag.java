package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.OffsetDateTime;

/**
 * TASK-2701 Phase 4 -- one row per {@link AiTaskId}, admin-toggled. See V42's own migration
 * comment for why {@code task_id} is a plain column rather than an enum-typed one at the
 * database level.
 */
@Entity
@Table(name = "ai_task_flags")
public class AiTaskFlag {

    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "task_id")
    private AiTaskId taskId;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "updated_by_email")
    private String updatedByEmail;

    @Version
    private Long version;

    public AiTaskId getTaskId() {
        return taskId;
    }

    public void setTaskId(AiTaskId taskId) {
        this.taskId = taskId;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public String getUpdatedByEmail() {
        return updatedByEmail;
    }

    public void setUpdatedByEmail(String updatedByEmail) {
        this.updatedByEmail = updatedByEmail;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }
}
