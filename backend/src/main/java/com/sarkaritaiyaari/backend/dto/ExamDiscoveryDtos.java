package com.sarkaritaiyaari.backend.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * The "Exams" discovery module's own response shapes — deliberately separate from the
 * plain {@link ExamResponse} used by Home's simple list and the admin management screen,
 * since a discovery card needs current-cycle fields no caller of those two ever needed.
 */
public final class ExamDiscoveryDtos {

    private ExamDiscoveryDtos() {
    }

    /**
     * One exam's card in the discovery listing — scalar fields only, no collections, so
     * this query never risks the {@code MultipleBagFetchException} class of bug this
     * codebase has hit twice before fetch-joining a `@OneToMany`. Deliberately omits
     * qualification/age/fee (spec's own "don't force every field into every card" rule) —
     * those stay one tap away in the full Exam Guide.
     */
    public record ExamCardResponse(
            String examCode,
            String examName,
            String imageUrl,
            String category,
            String difficulty,
            String badge,
            UUID recruitmentCycleId,
            String cycleName,
            /** The admin-set {@code RecruitmentCycleStatus} name, or null if this exam has
             * no current published cycle at all. */
            String status,
            /** True only when status is an "open" one and the deadline is inside the
             * configured urgency window — see {@code ExamCardService}'s threshold constant. */
            boolean closingSoon,
            Integer daysUntilDeadline,
            LocalDate notificationDate,
            LocalDate applicationStart,
            LocalDate applicationEnd,
            LocalDate examStart,
            LocalDate examEnd,
            Integer vacancyCount,
            boolean demo,
            OffsetDateTime lastVerifiedAt,
            /** "APPLY_NOW" | "PREPARE_NOW" | "VIEW_EXAM" | "VIEW_RESULT_INFO" — spec §52's
             * "one primary action per state" rule, computed once here rather than in every
             * client that renders a card. */
            String primaryAction) {
    }

    /** A small hand-rolled page wrapper — not Spring's raw {@code Page<T>}, which this
     * backend's own logs already flag as unstable to serialize as-is. */
    public record PagedExamCards(
            List<ExamCardResponse> content,
            int page,
            int size,
            long totalElements,
            boolean hasMore) {
    }
}
