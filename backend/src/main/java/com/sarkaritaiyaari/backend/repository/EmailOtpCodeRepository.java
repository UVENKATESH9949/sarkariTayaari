package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.EmailOtpCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EmailOtpCodeRepository extends JpaRepository<EmailOtpCode, UUID> {

    /**
     * The newest code issued to this address, whatever its state.
     *
     * Newest-only on purpose: requesting a second code must invalidate the first, and the simplest
     * way to guarantee that is to only ever consider the latest row. Written as explicit JPQL
     * rather than a derived name, matching this codebase's stated preference for anything
     * non-trivial — and derived names here have bitten this project three times already by
     * resolving against an accessor instead of a field.
     */
    @Query("SELECT c FROM EmailOtpCode c WHERE c.email = :email ORDER BY c.createdAt DESC LIMIT 1")
    Optional<EmailOtpCode> findNewestForEmail(@Param("email") String email);

    /** Everything still live for this address — used to retire earlier codes when a new one is sent. */
    @Query("SELECT c FROM EmailOtpCode c WHERE c.email = :email AND c.consumedAt IS NULL AND c.expiresAt > :now")
    List<EmailOtpCode> findLiveForEmail(@Param("email") String email, @Param("now") OffsetDateTime now);

    /**
     * Housekeeping for codes that are long dead.
     *
     * {@code @Transactional} sits on the interface method deliberately: a custom modifying query
     * called from a non-transactional context throws {@code TransactionRequiredException}, a trap
     * this project has hit twice before (see AiConfigurationService's own note).
     */
    @Modifying
    @Transactional
    @Query("DELETE FROM EmailOtpCode c WHERE c.expiresAt < :cutoff")
    int deleteExpiredBefore(@Param("cutoff") OffsetDateTime cutoff);
}
