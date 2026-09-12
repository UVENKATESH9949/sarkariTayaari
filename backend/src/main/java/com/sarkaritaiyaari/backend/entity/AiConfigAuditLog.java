package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Append-only. Never records a secret value — only that one changed, by whom, when.
 * {@code changedBy}/{@code changedByEmail} are captured at write time from the
 * authenticated admin, not resolved later — the record stays readable even if that admin
 * account is later renamed or removed.
 */
@Entity
@Table(name = "ai_config_audit_log")
public class AiConfigAuditLog {

    @Id
    private UUID id;

    private OffsetDateTime changedAt;

    private UUID changedBy;

    private String changedByEmail;

    private String action;

    private String provider;

    private String summary;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public OffsetDateTime getChangedAt() {
        return changedAt;
    }

    public void setChangedAt(OffsetDateTime changedAt) {
        this.changedAt = changedAt;
    }

    public UUID getChangedBy() {
        return changedBy;
    }

    public void setChangedBy(UUID changedBy) {
        this.changedBy = changedBy;
    }

    public String getChangedByEmail() {
        return changedByEmail;
    }

    public void setChangedByEmail(String changedByEmail) {
        this.changedByEmail = changedByEmail;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }
}
