package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.OffsetDateTime;

/**
 * Singleton row (id always {@code "default"}) — the AI Admin Control Center's master
 * switch and active-provider choice. {@code enabled}/{@code activeProvider} are nullable:
 * null means "no admin has saved this yet," and {@code AiConfigResolver} falls back to the
 * static {@code app.ai.enabled}/{@code app.ai.provider} in that case.
 */
@Entity
@Table(name = "ai_settings")
public class AiSettings {

    @Id
    private String id;

    private Boolean enabled;

    private String activeProvider;

    private OffsetDateTime updatedAt;

    private String updatedByEmail;

    @Version
    private Long version;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public String getActiveProvider() {
        return activeProvider;
    }

    public void setActiveProvider(String activeProvider) {
        this.activeProvider = activeProvider;
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
