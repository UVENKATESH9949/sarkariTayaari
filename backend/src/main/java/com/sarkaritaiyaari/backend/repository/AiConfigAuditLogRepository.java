package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.AiConfigAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface AiConfigAuditLogRepository extends JpaRepository<AiConfigAuditLog, UUID> {
    List<AiConfigAuditLog> findTop50ByOrderByChangedAtDesc();

    /**
     * A derived {@code deleteBy...} query, unlike the inherited CRUD methods
     * ({@code save}/{@code deleteById}/etc., each individually {@code @Transactional} on
     * {@code SimpleJpaRepository}), is not transactional by default and throws
     * {@code TransactionRequiredException} when called from a non-transactional caller
     * (here, a plain JUnit {@code @AfterEach}) — the same trap this project has already
     * hit once before with a derived {@code deleteByExamCode}. Test-only cleanup method.
     */
    @Transactional
    void deleteByChangedByEmail(String changedByEmail);
}
