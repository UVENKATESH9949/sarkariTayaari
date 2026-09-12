package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.OffsetDateTime;

/**
 * One row per provider, created only once an admin saves that provider's configuration —
 * a provider with no row here falls back entirely to the static {@code app.ai.*}
 * configuration (see {@code AiConfigResolver}). {@code encryptedApiKey} is AES-256-GCM
 * ciphertext (see {@code AiCredentialCipher}) — never plaintext, and this entity never
 * exposes a decrypted value through a getter used by a response DTO.
 */
@Entity
@Table(name = "ai_provider_configs")
public class AiProviderConfig {

    @Id
    private String provider;

    private String model;

    @Column(name = "encrypted_api_key")
    private String encryptedApiKey;

    private String baseUrl;

    private OffsetDateTime updatedAt;

    private String updatedByEmail;

    @Version
    private Long version;

    private OffsetDateTime lastTestAt;

    private String lastTestStatus;

    private Long lastTestLatencyMs;

    private String lastTestMessage;

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getEncryptedApiKey() {
        return encryptedApiKey;
    }

    public void setEncryptedApiKey(String encryptedApiKey) {
        this.encryptedApiKey = encryptedApiKey;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
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

    public OffsetDateTime getLastTestAt() {
        return lastTestAt;
    }

    public void setLastTestAt(OffsetDateTime lastTestAt) {
        this.lastTestAt = lastTestAt;
    }

    public String getLastTestStatus() {
        return lastTestStatus;
    }

    public void setLastTestStatus(String lastTestStatus) {
        this.lastTestStatus = lastTestStatus;
    }

    public Long getLastTestLatencyMs() {
        return lastTestLatencyMs;
    }

    public void setLastTestLatencyMs(Long lastTestLatencyMs) {
        this.lastTestLatencyMs = lastTestLatencyMs;
    }

    public String getLastTestMessage() {
        return lastTestMessage;
    }

    public void setLastTestMessage(String lastTestMessage) {
        this.lastTestMessage = lastTestMessage;
    }
}
