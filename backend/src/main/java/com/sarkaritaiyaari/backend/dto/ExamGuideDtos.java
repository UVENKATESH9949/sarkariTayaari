package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The mobile/public-facing Exam Guide read shape, and the one user-write it exposes
 * (document readiness).
 *
 * <p>One combined {@link ExamGuideResponse} per exam rather than the eight separate
 * endpoints the spec's §59 API sketch lists (`/dates`, `/eligibility`, `/documents`, ...)
 * — every one of those sections is shown on the same Exam Guide screen and needs to sync
 * together for offline use, exactly like {@code ExamStructureResponse} already combines
 * stage/paper/section into one tree instead of three round trips. The spec's own §59
 * closes with "do not blindly create duplicate endpoints if equivalent APIs already
 * exist" — this follows that instruction against the spec's own more granular sketch.
 */
public final class ExamGuideDtos {

    private ExamGuideDtos() {
    }

    /**
     * @param demo true if this cycle has never been backed by a real notification — the
     *             UI MUST render this as a visible badge, never silently.
     */
    public record ExamGuideResponse(
            String examCode,
            String examName,
            UUID recruitmentCycleId,
            String cycleName,
            String status,
            LocalDate notificationDate,
            LocalDate applicationStart,
            LocalDate applicationEnd,
            LocalDate examStart,
            LocalDate examEnd,
            Integer vacancyCount,
            String notificationUrl,
            /** Spec §1/§4 "What is this exam?" — a plain-language overview paragraph. */
            String overviewText,
            boolean demo,
            OffsetDateTime lastVerifiedAt,
            EligibilitySummary eligibility,
            List<ImportantDateSummary> importantDates,
            List<DocumentSummary> documents,
            List<ApplicationStepSummary> applicationSteps,
            List<String> applicationMistakes,
            List<FeeSummary> fees,
            /** Spec §25/§26 — exam-scoped, not cycle-scoped, but returned here per §59's
             * "one combined endpoint" convention rather than a new one. Known limitation,
             * stated rather than hidden: an exam with no current published cycle shows no
             * career info either, same gate as everything else on this screen. */
            List<CareerPostSummary> careerPosts,
            /**
             * Every source cited by anything above, resolved once here rather than repeated
             * inline on each fact — spec §32. Facts carry only {@code sourceId}; the client
             * looks it up in this list. Deliberately a flat list rather than nesting the full
             * source object into every date/document/fee row, since the same 1-3 sources
             * typically back most of a cycle's facts.
             */
            List<SourceSummary> sources) {
    }

    public record CareerPostSummary(
            UUID id,
            String postTitle,
            String payLevel,
            Integer salaryMinRupees,
            Integer salaryMaxRupees,
            String growthPath,
            String description,
            UUID sourceId) {
    }

    public record SourceSummary(
            UUID id,
            String sourceName,
            String sourceType,
            String url) {
    }

    public record EligibilitySummary(
            Integer minimumAge,
            Integer maximumAge,
            LocalDate ageCutoffDate,
            String qualification,
            String nationality,
            String genderRequirement,
            Map<String, Integer> categoryRelaxation,
            String specialRequirements,
            UUID sourceId) {
    }

    public record ImportantDateSummary(
            UUID id,
            String eventType,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean official,
            UUID sourceId) {
    }

    /** @param userStatus null when the caller isn't signed in — see ExamGuideController. */
    public record DocumentSummary(
            UUID id,
            String documentName,
            String required,
            String applicableFor,
            String format,
            Integer maxSizeKb,
            String dimensions,
            String instructions,
            String userStatus,
            UUID sourceId) {
    }

    public record ApplicationStepSummary(
            int stepNumber,
            String title,
            String description,
            String warning,
            String officialUrl) {
    }

    public record FeeSummary(
            String category,
            int amountRupees,
            boolean exempted,
            String notes,
            UUID sourceId) {
    }

    /**
     * Exam Guide spec §63 "Notification History" — every NON-current cycle for an exam,
     * deliberately lighter than {@code RecruitmentCycleResponse} (the admin shape): no
     * {@code current}/{@code demo} flags a past cycle can't meaningfully carry, and no
     * write-side fields. Cycles are never deleted when superseded (spec §37 "Expired
     * Information") — this is the read that lets a user actually see them.
     */
    public record RecruitmentCycleHistoryEntry(
            UUID recruitmentCycleId,
            String cycleName,
            String status,
            LocalDate notificationDate,
            LocalDate applicationStart,
            LocalDate applicationEnd,
            LocalDate examStart,
            LocalDate examEnd,
            Integer vacancyCount) {
    }

    /** One changed field between a cycle and the one before it — spec §30 "What's Changed This Year". */
    public record CycleChangeEntry(String field, String previousValue, String currentValue) {
    }

    /**
     * @param hasPrevious false when this is the exam's first published cycle — the caller
     *                    renders "nothing to compare yet", not an empty diff.
     */
    public record CycleComparisonResponse(
            boolean hasPrevious,
            String previousCycleName,
            List<CycleChangeEntry> changes) {
    }

    /**
     * Spec §22 "Personalized Preparation Roadmap" — an ordered study checklist for one exam,
     * derived entirely from Epic L's existing topic-intelligence and mastery data (no new
     * tables). {@code recommended} marks exactly one topic: the highest-priority one that
     * isn't mastered yet and whose prerequisites are. {@code masteryState} is
     * {@code TopicProgressState} name or null for an anonymous caller — the client already
     * knows how to render an absent mastery state as "not started".
     */
    public record PrepareTopicItem(
            UUID topicId,
            String topicName,
            String subjectName,
            java.math.BigDecimal finalPriority,
            String masteryState,
            boolean prerequisitesMet,
            boolean recommended) {
    }

    public record PreparePlanResponse(String examCode, List<PrepareTopicItem> topics) {
    }

    /** The one user-write this module exposes pre-Phase-3: marking one document ready/missing/n-a. */
    public record UserDocumentStatusRequest(
            @NotBlank String status) {
    }

    public record UserDocumentStatusResponse(
            UUID documentRequirementId,
            String status,
            OffsetDateTime updatedAt) {
    }
}
