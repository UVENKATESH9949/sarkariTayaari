package com.sarkaritaiyaari.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationMistakeRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationStepRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.DocumentRequirementRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.EligibilityRuleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.FeeRuleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ImportantDateRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionExtractionResultResponse;
import com.sarkaritaiyaari.backend.entity.ExtractionReviewStatus;
import com.sarkaritaiyaari.backend.entity.IngestionExtractionResult;
import com.sarkaritaiyaari.backend.repository.IngestionExtractionResultRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * TASK-2401 Document 11/12 -- Accept/Reject for one candidate. Accept is a mechanical
 * deserialize-and-call: {@code payload} (merged with the reviewer's {@code overrides})
 * becomes the exact same {@code *Request} DTO the admin console already posts, handed to
 * the exact same {@code ExamGuideService} method an admin's own click already calls --
 * this is what makes the resulting row "indistinguishable from hand-typed," not a new
 * write path.
 *
 * <p>Every candidate in this MVP is a CREATE (Document 9's own note: matching an existing
 * row for an UPDATE is a reviewer action nobody has built yet), and only
 * {@code RECRUITMENT_CYCLE_CORE} creates its own cycle -- every other target type needs
 * an existing {@code recruitmentCycleId} supplied by the reviewer (Document 9's Q12:
 * automated cycle-matching isn't safe to guess at).
 */
@Service
public class ReviewQueueService {

    private final IngestionExtractionResultRepository resultRepository;
    private final ExamGuideService examGuideService;
    private final ObjectMapper objectMapper;

    public ReviewQueueService(IngestionExtractionResultRepository resultRepository,
                               ExamGuideService examGuideService,
                               ObjectMapper objectMapper) {
        this.resultRepository = resultRepository;
        this.examGuideService = examGuideService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public IngestionExtractionResultResponse get(UUID resultId) {
        return NoticeDiscoveryService.toExtractionResultResponse(requireResult(resultId));
    }

    @Transactional
    public IngestionExtractionResultResponse accept(UUID resultId, Map<String, Object> overrides, UUID recruitmentCycleId) {
        IngestionExtractionResult result = requireResult(resultId);
        requirePending(result);

        Map<String, Object> merged = new HashMap<>(result.getPayload());
        if (overrides != null) {
            merged.putAll(overrides);
        }

        UUID appliedCycleId = switch (result.getTargetType()) {
            case RECRUITMENT_CYCLE_CORE -> {
                RecruitmentCycleResponse cycle = examGuideService.createCycle(toDto(merged, RecruitmentCycleRequest.class));
                yield cycle.id();
            }
            case ELIGIBILITY_RULE -> {
                UUID cycleId = requireCycleId(recruitmentCycleId);
                examGuideService.upsertEligibility(cycleId, toDto(merged, EligibilityRuleRequest.class));
                yield cycleId;
            }
            case FEE_RULE -> {
                UUID cycleId = requireCycleId(recruitmentCycleId);
                examGuideService.createFeeRule(cycleId, toDto(merged, FeeRuleRequest.class));
                yield cycleId;
            }
            case APPLICATION_STEP -> {
                UUID cycleId = requireCycleId(recruitmentCycleId);
                examGuideService.createApplicationStep(cycleId, toDto(merged, ApplicationStepRequest.class));
                yield cycleId;
            }
            case IMPORTANT_DATE -> {
                UUID cycleId = requireCycleId(recruitmentCycleId);
                examGuideService.createImportantDate(cycleId, toDto(merged, ImportantDateRequest.class));
                yield cycleId;
            }
            case DOCUMENT_REQUIREMENT -> {
                UUID cycleId = requireCycleId(recruitmentCycleId);
                examGuideService.createDocumentRequirement(cycleId, toDto(merged, DocumentRequirementRequest.class));
                yield cycleId;
            }
            case APPLICATION_MISTAKE -> {
                UUID cycleId = requireCycleId(recruitmentCycleId);
                examGuideService.createApplicationMistake(cycleId, toDto(merged, ApplicationMistakeRequest.class));
                yield cycleId;
            }
        };

        result.setReviewStatus(ExtractionReviewStatus.ACCEPTED);
        result.setAppliedRecruitmentCycleId(appliedCycleId);
        result.setReviewedAt(OffsetDateTime.now());
        resultRepository.save(result);
        return NoticeDiscoveryService.toExtractionResultResponse(result);
    }

    @Transactional
    public IngestionExtractionResultResponse reject(UUID resultId, String reason) {
        IngestionExtractionResult result = requireResult(resultId);
        requirePending(result);

        result.setReviewStatus(ExtractionReviewStatus.REJECTED);
        result.setRejectionReason(reason);
        result.setReviewedAt(OffsetDateTime.now());
        resultRepository.save(result);
        return NoticeDiscoveryService.toExtractionResultResponse(result);
    }

    private IngestionExtractionResult requireResult(UUID resultId) {
        return resultRepository.findById(resultId)
                .orElseThrow(() -> new NoSuchElementException("Extraction result not found: " + resultId));
    }

    private static void requirePending(IngestionExtractionResult result) {
        if (result.getReviewStatus() != ExtractionReviewStatus.PENDING) {
            throw new IllegalStateException(
                    "This candidate has already been reviewed (" + result.getReviewStatus() + ")");
        }
    }

    private static UUID requireCycleId(UUID recruitmentCycleId) {
        if (recruitmentCycleId == null) {
            throw new IllegalArgumentException(
                    "recruitmentCycleId is required to accept this candidate (only RECRUITMENT_CYCLE_CORE creates its own cycle)");
        }
        return recruitmentCycleId;
    }

    private <T> T toDto(Map<String, Object> payload, Class<T> dtoType) {
        try {
            return objectMapper.convertValue(payload, dtoType);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "Candidate payload doesn't match " + dtoType.getSimpleName() + ": " + e.getMessage(), e);
        }
    }
}
