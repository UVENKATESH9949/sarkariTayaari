package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Admin-console request/response shapes for the Exam Guide content model (Exam Guide
 * spec §34/§35). Grouped in one file — as {@code TopicIntelligenceDtos} and
 * {@code TopicProgressDtos} already are in this codebase — because these ten shapes are
 * all facets of managing one recruitment cycle's content and are never used in isolation
 * from each other in the admin console.
 */
public final class ExamGuideAdminDtos {

    private ExamGuideAdminDtos() {
    }

    public record RecruitmentCycleRequest(
            @NotBlank String examCode,
            @NotBlank String cycleName,
            @NotBlank String status,
            LocalDate notificationDate,
            LocalDate applicationStart,
            LocalDate applicationEnd,
            LocalDate examStart,
            LocalDate examEnd,
            Integer vacancyCount,
            String notificationUrl,
            /** Spec §1/§4 "What is this exam?" — a plain-language overview paragraph. */
            String overviewText,
            boolean current,
            boolean demo,
            OffsetDateTime lastVerifiedAt,
            /**
             * "DRAFT" | "PUBLISHED" (spec §36). Nullable rather than {@code @NotBlank}: a
             * request from before this field existed (or an admin caller that doesn't care)
             * should keep the cycle's current status rather than 400 or silently reset it
             * to draft — see {@code ExamGuideService.applyCycleFields}.
             */
            String contentStatus) {
    }

    /** Spec §25/§26 — exam-scoped, not cycle-scoped (see the V19 migration comment). */
    public record CareerPostRequest(
            @NotBlank String examCode,
            @NotBlank String postTitle,
            String payLevel,
            Integer salaryMinRupees,
            Integer salaryMaxRupees,
            String growthPath,
            String description,
            java.util.UUID sourceId,
            int displayOrder) {
    }

    public record CareerPostResponse(
            java.util.UUID id,
            String examCode,
            String postTitle,
            String payLevel,
            Integer salaryMinRupees,
            Integer salaryMaxRupees,
            String growthPath,
            String description,
            java.util.UUID sourceId,
            int displayOrder) {
    }

    public record RecruitmentCycleResponse(
            UUID id,
            String examCode,
            String examName,
            String cycleName,
            String status,
            LocalDate notificationDate,
            LocalDate applicationStart,
            LocalDate applicationEnd,
            LocalDate examStart,
            LocalDate examEnd,
            Integer vacancyCount,
            String notificationUrl,
            String overviewText,
            boolean current,
            boolean demo,
            OffsetDateTime lastVerifiedAt,
            String contentStatus) {
    }

    public record ExamSourceRequest(
            @NotBlank String sourceName,
            @NotBlank String sourceType,
            String url,
            LocalDate publicationDate,
            OffsetDateTime lastVerifiedAt) {
    }

    public record ExamSourceResponse(
            UUID id,
            String sourceName,
            String sourceType,
            String url,
            LocalDate publicationDate,
            OffsetDateTime lastVerifiedAt) {
    }

    public record EligibilityRuleRequest(
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

    public record EligibilityRuleResponse(
            UUID recruitmentCycleId,
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

    public record ImportantDateRequest(
            @NotBlank String eventType,
            @NotBlank String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean official,
            int displayOrder,
            UUID sourceId) {
    }

    public record ImportantDateResponse(
            UUID id,
            UUID recruitmentCycleId,
            String eventType,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean official,
            int displayOrder,
            UUID sourceId) {
    }

    public record DocumentRequirementRequest(
            @NotBlank String documentName,
            @NotBlank String required,
            String applicableFor,
            String format,
            Integer maxSizeKb,
            String dimensions,
            String instructions,
            int displayOrder,
            UUID sourceId) {
    }

    public record DocumentRequirementResponse(
            UUID id,
            UUID recruitmentCycleId,
            String documentName,
            String required,
            String applicableFor,
            String format,
            Integer maxSizeKb,
            String dimensions,
            String instructions,
            int displayOrder,
            UUID sourceId) {
    }

    public record ApplicationStepRequest(
            @NotNull Integer stepNumber,
            @NotBlank String title,
            String description,
            String warning,
            String officialUrl) {
    }

    public record ApplicationStepResponse(
            UUID id,
            UUID recruitmentCycleId,
            int stepNumber,
            String title,
            String description,
            String warning,
            String officialUrl) {
    }

    public record ApplicationMistakeRequest(
            @NotBlank String mistake,
            int displayOrder) {
    }

    public record ApplicationMistakeResponse(
            UUID id,
            UUID recruitmentCycleId,
            String mistake,
            int displayOrder) {
    }

    public record FeeRuleRequest(
            @NotBlank String category,
            int amountRupees,
            boolean exempted,
            String notes,
            int displayOrder,
            UUID sourceId) {
    }

    public record FeeRuleResponse(
            UUID id,
            UUID recruitmentCycleId,
            String category,
            int amountRupees,
            boolean exempted,
            String notes,
            int displayOrder,
            UUID sourceId) {
    }
}
