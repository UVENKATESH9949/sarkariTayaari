package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A one-time code emailed to a student so they can sign in without a password (migration V51).
 *
 * <p>The code is never stored — only a BCrypt hash of it, the same treatment
 * {@link User#getPasswordHash()} gets and for the same reason: this project's dev and production
 * environments share one database, so a readable column here would be a list of live credentials.
 *
 * <p><b>There is deliberately no foreign key to {@link User}.</b> A code is issued before the
 * account exists on a first-time sign-up — that is the entire point of the flow — so the address is
 * carried as plain text, normalised the same way {@code users.email} is.
 */
@Entity
@Table(name = "email_otp_codes")
public class EmailOtpCode {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(name = "code_hash", nullable = false)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    /** Set on successful redemption. Kept rather than deleted so reuse can be refused explicitly. */
    @Column(name = "consumed_at")
    private OffsetDateTime consumedAt;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
    }

    /** True when this code can still be guessed against — not expired, not used, attempts left. */
    public boolean isRedeemable(OffsetDateTime now, int maxAttempts) {
        return consumedAt == null && attemptCount < maxAttempts && expiresAt.isAfter(now);
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getCodeHash() {
        return codeHash;
    }

    public void setCodeHash(String codeHash) {
        this.codeHash = codeHash;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public OffsetDateTime getConsumedAt() {
        return consumedAt;
    }

    public void setConsumedAt(OffsetDateTime consumedAt) {
        this.consumedAt = consumedAt;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public void setAttemptCount(int attemptCount) {
        this.attemptCount = attemptCount;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
