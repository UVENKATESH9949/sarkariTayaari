package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.AiUsageRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface AiUsageRecordRepository extends JpaRepository<AiUsageRecord, UUID> {

    /**
     * Aggregated in SQL, never by loading rows into memory — this table is the one in this schema
     * designed to grow without bound (one row per AI call), and this codebase has already fixed
     * the "load everything then count in Java" pattern as a real performance bug more than once.
     */
    @Query("""
            SELECT e.feature AS feature,
                   e.model AS model,
                   COUNT(e) AS calls,
                   COALESCE(SUM(e.inputTokens), 0) AS inputTokens,
                   COALESCE(SUM(e.outputTokens), 0) AS outputTokens,
                   SUM(CASE WHEN e.status = 'success' THEN 0 ELSE 1 END) AS failures
            FROM AiUsageRecord e
            WHERE e.occurredAt >= :since
            GROUP BY e.feature, e.model
            ORDER BY COUNT(e) DESC
            """)
    List<AiUsageSummaryRow> summarizeSince(@Param("since") OffsetDateTime since);

    /** Spring Data projection — see {@link #summarizeSince}. */
    interface AiUsageSummaryRow {
        String getFeature();
        String getModel();
        long getCalls();
        long getInputTokens();
        long getOutputTokens();
        long getFailures();
    }
}
