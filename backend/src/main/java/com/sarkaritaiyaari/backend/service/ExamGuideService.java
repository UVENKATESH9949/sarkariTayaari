package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationMistakeRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationMistakeResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationStepRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationStepResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.CareerPostRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.CareerPostResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.DocumentRequirementRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.DocumentRequirementResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.EligibilityRuleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.EligibilityRuleResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ExamSourceRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ExamSourceResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.FeeRuleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.FeeRuleResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ImportantDateRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ImportantDateResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.ApplicationStepSummary;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.CareerPostSummary;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.CycleChangeEntry;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.CycleComparisonResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.DocumentSummary;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.EligibilitySummary;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.ExamGuideResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.FeeSummary;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.ImportantDateSummary;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.RecruitmentCycleHistoryEntry;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.SourceSummary;
import com.sarkaritaiyaari.backend.entity.ApplicationMistake;
import com.sarkaritaiyaari.backend.entity.ApplicationStep;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.DocumentRequirement;
import com.sarkaritaiyaari.backend.entity.ExamCareerPost;
import com.sarkaritaiyaari.backend.entity.DocumentRequirementLevel;
import com.sarkaritaiyaari.backend.entity.EligibilityRule;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.ExamSource;
import com.sarkaritaiyaari.backend.entity.ExamSourceType;
import com.sarkaritaiyaari.backend.entity.FeeRule;
import com.sarkaritaiyaari.backend.entity.ImportantDate;
import com.sarkaritaiyaari.backend.entity.ImportantDateEventType;
import com.sarkaritaiyaari.backend.entity.RecruitmentCycle;
import com.sarkaritaiyaari.backend.entity.RecruitmentCycleStatus;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserDocumentReadiness;
import com.sarkaritaiyaari.backend.entity.UserDocumentStatus;
import com.sarkaritaiyaari.backend.repository.ApplicationMistakeRepository;
import com.sarkaritaiyaari.backend.repository.ApplicationStepRepository;
import com.sarkaritaiyaari.backend.repository.DocumentRequirementRepository;
import com.sarkaritaiyaari.backend.repository.ExamCareerPostRepository;
import com.sarkaritaiyaari.backend.repository.EligibilityRuleRepository;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.ExamSourceRepository;
import com.sarkaritaiyaari.backend.repository.FeeRuleRepository;
import com.sarkaritaiyaari.backend.repository.ImportantDateRepository;
import com.sarkaritaiyaari.backend.repository.RecruitmentCycleRepository;
import com.sarkaritaiyaari.backend.repository.UserDocumentStatusRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Exam Guide Phase 1 (see the supplied "SARKARITAAYARI - EXAM GUIDE" spec). Owns the
 * recruitment-cycle-scoped content model — eligibility, dates, documents, application
 * steps/mistakes, fees — plus assembling the combined read shape mobile syncs.
 *
 * <p>Selection process, exam pattern and syllabus are deliberately NOT here: they already
 * exist ({@link com.sarkaritaiyaari.backend.service.ExamStructureService},
 * exam_subjects/topics) and this service reuses them rather than duplicating a second
 * content model for the same facts, per the spec's own §59/§70 instruction not to rebuild
 * what already exists.
 */
@Service
public class ExamGuideService {

    private final ExamRepository examRepository;
    private final RecruitmentCycleRepository cycleRepository;
    private final ExamSourceRepository sourceRepository;
    private final EligibilityRuleRepository eligibilityRepository;
    private final ImportantDateRepository importantDateRepository;
    private final DocumentRequirementRepository documentRequirementRepository;
    private final ApplicationStepRepository applicationStepRepository;
    private final ApplicationMistakeRepository applicationMistakeRepository;
    private final FeeRuleRepository feeRuleRepository;
    private final UserDocumentStatusRepository userDocumentStatusRepository;
    private final ExamCareerPostRepository careerPostRepository;

    public ExamGuideService(ExamRepository examRepository,
                             RecruitmentCycleRepository cycleRepository,
                             ExamSourceRepository sourceRepository,
                             EligibilityRuleRepository eligibilityRepository,
                             ImportantDateRepository importantDateRepository,
                             DocumentRequirementRepository documentRequirementRepository,
                             ApplicationStepRepository applicationStepRepository,
                             ApplicationMistakeRepository applicationMistakeRepository,
                             FeeRuleRepository feeRuleRepository,
                             UserDocumentStatusRepository userDocumentStatusRepository,
                             ExamCareerPostRepository careerPostRepository) {
        this.examRepository = examRepository;
        this.cycleRepository = cycleRepository;
        this.sourceRepository = sourceRepository;
        this.eligibilityRepository = eligibilityRepository;
        this.importantDateRepository = importantDateRepository;
        this.documentRequirementRepository = documentRequirementRepository;
        this.careerPostRepository = careerPostRepository;
        this.applicationStepRepository = applicationStepRepository;
        this.applicationMistakeRepository = applicationMistakeRepository;
        this.feeRuleRepository = feeRuleRepository;
        this.userDocumentStatusRepository = userDocumentStatusRepository;
    }

    /* =================================================================== Recruitment cycles */

    @Transactional
    public RecruitmentCycleResponse createCycle(RecruitmentCycleRequest request) {
        Exam exam = requireExam(request.examCode());
        cycleRepository.findByExamCodeAndCycleNameIgnoreCase(request.examCode(), request.cycleName())
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("Cycle already exists for this exam: " + request.cycleName());
                });

        RecruitmentCycle cycle = new RecruitmentCycle();
        // Pre-assigned rather than left to Hibernate's UUID generator: promoting this
        // cycle to current (below) has to exclude its own id from the "clear every other
        // current cycle" bulk update, and that requires knowing the id before the insert.
        cycle.setId(UUID.randomUUID());
        cycle.setExam(exam);
        cycle.setCycleName(request.cycleName());
        applyCycleFields(cycle, request);
        OffsetDateTime now = OffsetDateTime.now();
        cycle.setCreatedAt(now);
        cycle.setUpdatedAt(now);

        if (request.current()) {
            cycleRepository.clearCurrentForExam(request.examCode(), cycle.getId());
        }
        return toResponse(cycleRepository.save(cycle));
    }

    @Transactional
    public RecruitmentCycleResponse updateCycle(UUID id, RecruitmentCycleRequest request) {
        RecruitmentCycle cycle = requireCycle(id);
        if (!cycle.getExam().getCode().equals(request.examCode())) {
            throw new IllegalArgumentException("A cycle cannot be moved to a different exam.");
        }
        if (!cycle.getCycleName().equalsIgnoreCase(request.cycleName())) {
            cycleRepository.findByExamCodeAndCycleNameIgnoreCase(request.examCode(), request.cycleName())
                    .ifPresent(existing -> {
                        throw new IllegalArgumentException("Cycle already exists for this exam: " + request.cycleName());
                    });
        }
        cycle.setCycleName(request.cycleName());
        applyCycleFields(cycle, request);
        cycle.setUpdatedAt(OffsetDateTime.now());

        if (request.current()) {
            cycleRepository.clearCurrentForExam(request.examCode(), id);
        }
        return toResponse(cycleRepository.save(cycle));
    }

    private void applyCycleFields(RecruitmentCycle cycle, RecruitmentCycleRequest request) {
        cycle.setStatus(parseStatus(request.status()));
        cycle.setNotificationDate(request.notificationDate());
        cycle.setApplicationStart(request.applicationStart());
        cycle.setApplicationEnd(request.applicationEnd());
        cycle.setExamStart(request.examStart());
        cycle.setExamEnd(request.examEnd());
        cycle.setVacancyCount(request.vacancyCount());
        cycle.setNotificationUrl(request.notificationUrl());
        cycle.setOverviewText(request.overviewText());
        cycle.setCurrent(request.current());
        cycle.setDemo(request.demo());
        cycle.setLastVerifiedAt(request.lastVerifiedAt());
        // Null means "the caller doesn't care" (an older request shape, or a save that
        // isn't about publication) — kept as-is rather than reset to the entity's DRAFT
        // default, which would silently unpublish a live cycle on every unrelated edit.
        if (request.contentStatus() != null) {
            cycle.setContentStatus(ContentStatus.valueOf(request.contentStatus().trim().toUpperCase(Locale.ROOT)));
        }
    }

    /** Spec §36 — a one-click publish/unpublish, separate from the full-form update above. */
    @Transactional
    public RecruitmentCycleResponse setCycleContentStatus(UUID id, ContentStatus status) {
        RecruitmentCycle cycle = requireCycle(id);
        cycle.setContentStatus(status);
        cycle.setUpdatedAt(OffsetDateTime.now());
        return toResponse(cycleRepository.save(cycle));
    }

    @Transactional(readOnly = true)
    public List<RecruitmentCycleResponse> listCyclesForExam(String examCode) {
        requireExam(examCode);
        return cycleRepository.findByExamCodeOrderByCreatedAtDesc(examCode).stream()
                .map(ExamGuideService::toResponse)
                .toList();
    }

    @Transactional
    public void deleteCycle(UUID id) {
        cycleRepository.delete(requireCycle(id));
    }

    /* =================================================================== Sources */

    @Transactional
    public ExamSourceResponse createSource(ExamSourceRequest request) {
        ExamSource source = new ExamSource();
        applySourceFields(source, request);
        source.setCreatedAt(OffsetDateTime.now());
        return toResponse(sourceRepository.save(source));
    }

    @Transactional
    public ExamSourceResponse updateSource(UUID id, ExamSourceRequest request) {
        ExamSource source = sourceRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Source not found: " + id));
        applySourceFields(source, request);
        return toResponse(sourceRepository.save(source));
    }

    private void applySourceFields(ExamSource source, ExamSourceRequest request) {
        source.setSourceName(request.sourceName());
        source.setSourceType(ExamSourceType.valueOf(request.sourceType().trim().toUpperCase(Locale.ROOT)));
        source.setUrl(request.url());
        source.setPublicationDate(request.publicationDate());
        source.setLastVerifiedAt(request.lastVerifiedAt());
    }

    @Transactional(readOnly = true)
    public List<ExamSourceResponse> listSources() {
        return sourceRepository.findAll().stream()
                .sorted(Comparator.comparing(ExamSource::getSourceName, String.CASE_INSENSITIVE_ORDER))
                .map(ExamGuideService::toResponse)
                .toList();
    }

    @Transactional
    public void deleteSource(UUID id) {
        if (!sourceRepository.existsById(id)) {
            throw new NoSuchElementException("Source not found: " + id);
        }
        sourceRepository.deleteById(id);
    }

    /* =================================================================== Eligibility (1:1 per cycle) */

    @Transactional
    public EligibilityRuleResponse upsertEligibility(UUID cycleId, EligibilityRuleRequest request) {
        RecruitmentCycle cycle = requireCycle(cycleId);
        EligibilityRule rule = eligibilityRepository.findById(cycleId).orElseGet(() -> {
            EligibilityRule created = new EligibilityRule();
            created.setRecruitmentCycle(cycle);
            return created;
        });
        rule.setMinimumAge(request.minimumAge());
        rule.setMaximumAge(request.maximumAge());
        rule.setAgeCutoffDate(request.ageCutoffDate());
        rule.setQualification(request.qualification());
        rule.setNationality(request.nationality());
        rule.setGenderRequirement(request.genderRequirement());
        rule.setCategoryRelaxation(request.categoryRelaxation());
        rule.setSpecialRequirements(request.specialRequirements());
        rule.setSourceId(request.sourceId());
        return toResponse(eligibilityRepository.save(rule));
    }

    @Transactional(readOnly = true)
    public Optional<EligibilityRuleResponse> getEligibility(UUID cycleId) {
        return eligibilityRepository.findById(cycleId).map(ExamGuideService::toResponse);
    }

    /* =================================================================== Important dates */

    @Transactional
    public ImportantDateResponse createImportantDate(UUID cycleId, ImportantDateRequest request) {
        RecruitmentCycle cycle = requireCycle(cycleId);
        ImportantDate date = new ImportantDate();
        date.setRecruitmentCycle(cycle);
        applyImportantDateFields(date, request);
        return toResponse(importantDateRepository.save(date));
    }

    @Transactional
    public ImportantDateResponse updateImportantDate(UUID id, ImportantDateRequest request) {
        ImportantDate date = importantDateRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Important date not found: " + id));
        applyImportantDateFields(date, request);
        return toResponse(importantDateRepository.save(date));
    }

    private void applyImportantDateFields(ImportantDate date, ImportantDateRequest request) {
        date.setEventType(ImportantDateEventType.valueOf(request.eventType().trim().toUpperCase(Locale.ROOT)));
        date.setTitle(request.title());
        date.setStartDate(request.startDate());
        date.setEndDate(request.endDate());
        date.setOfficial(request.official());
        date.setDisplayOrder(request.displayOrder());
        date.setSourceId(request.sourceId());
    }

    @Transactional(readOnly = true)
    public List<ImportantDateResponse> listImportantDates(UUID cycleId) {
        requireCycle(cycleId);
        return importantDateRepository.findByRecruitmentCycleIdOrderByDisplayOrderAsc(cycleId).stream()
                .map(ExamGuideService::toResponse)
                .toList();
    }

    @Transactional
    public void deleteImportantDate(UUID id) {
        if (!importantDateRepository.existsById(id)) {
            throw new NoSuchElementException("Important date not found: " + id);
        }
        importantDateRepository.deleteById(id);
    }

    /* =================================================================== Document requirements */

    @Transactional
    public DocumentRequirementResponse createDocumentRequirement(UUID cycleId, DocumentRequirementRequest request) {
        RecruitmentCycle cycle = requireCycle(cycleId);
        DocumentRequirement doc = new DocumentRequirement();
        doc.setRecruitmentCycle(cycle);
        applyDocumentFields(doc, request);
        return toResponse(documentRequirementRepository.save(doc));
    }

    @Transactional
    public DocumentRequirementResponse updateDocumentRequirement(UUID id, DocumentRequirementRequest request) {
        DocumentRequirement doc = documentRequirementRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Document requirement not found: " + id));
        applyDocumentFields(doc, request);
        return toResponse(documentRequirementRepository.save(doc));
    }

    private void applyDocumentFields(DocumentRequirement doc, DocumentRequirementRequest request) {
        doc.setDocumentName(request.documentName());
        doc.setRequired(DocumentRequirementLevel.valueOf(request.required().trim().toUpperCase(Locale.ROOT)));
        doc.setApplicableFor(request.applicableFor());
        doc.setFormat(request.format());
        doc.setMaxSizeKb(request.maxSizeKb());
        doc.setDimensions(request.dimensions());
        doc.setInstructions(request.instructions());
        doc.setDisplayOrder(request.displayOrder());
        doc.setSourceId(request.sourceId());
    }

    @Transactional(readOnly = true)
    public List<DocumentRequirementResponse> listDocumentRequirements(UUID cycleId) {
        requireCycle(cycleId);
        return documentRequirementRepository.findByRecruitmentCycleIdOrderByDisplayOrderAsc(cycleId).stream()
                .map(ExamGuideService::toResponse)
                .toList();
    }

    @Transactional
    public void deleteDocumentRequirement(UUID id) {
        if (!documentRequirementRepository.existsById(id)) {
            throw new NoSuchElementException("Document requirement not found: " + id);
        }
        documentRequirementRepository.deleteById(id);
    }

    /* =================================================================== Application steps */

    @Transactional
    public ApplicationStepResponse createApplicationStep(UUID cycleId, ApplicationStepRequest request) {
        RecruitmentCycle cycle = requireCycle(cycleId);
        applicationStepRepository.findByRecruitmentCycleIdOrderByStepNumberAsc(cycleId).stream()
                .filter(s -> s.getStepNumber() == request.stepNumber())
                .findFirst()
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("Step " + request.stepNumber() + " already exists for this cycle.");
                });
        ApplicationStep step = new ApplicationStep();
        step.setRecruitmentCycle(cycle);
        applyStepFields(step, request);
        return toResponse(applicationStepRepository.save(step));
    }

    @Transactional
    public ApplicationStepResponse updateApplicationStep(UUID id, ApplicationStepRequest request) {
        ApplicationStep step = applicationStepRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Application step not found: " + id));
        applyStepFields(step, request);
        return toResponse(applicationStepRepository.save(step));
    }

    private void applyStepFields(ApplicationStep step, ApplicationStepRequest request) {
        step.setStepNumber(request.stepNumber());
        step.setTitle(request.title());
        step.setDescription(request.description());
        step.setWarning(request.warning());
        step.setOfficialUrl(request.officialUrl());
    }

    @Transactional(readOnly = true)
    public List<ApplicationStepResponse> listApplicationSteps(UUID cycleId) {
        requireCycle(cycleId);
        return applicationStepRepository.findByRecruitmentCycleIdOrderByStepNumberAsc(cycleId).stream()
                .map(ExamGuideService::toResponse)
                .toList();
    }

    @Transactional
    public void deleteApplicationStep(UUID id) {
        if (!applicationStepRepository.existsById(id)) {
            throw new NoSuchElementException("Application step not found: " + id);
        }
        applicationStepRepository.deleteById(id);
    }

    /* =================================================================== Application mistakes */

    @Transactional
    public ApplicationMistakeResponse createApplicationMistake(UUID cycleId, ApplicationMistakeRequest request) {
        RecruitmentCycle cycle = requireCycle(cycleId);
        ApplicationMistake mistake = new ApplicationMistake();
        mistake.setRecruitmentCycle(cycle);
        mistake.setMistake(request.mistake());
        mistake.setDisplayOrder(request.displayOrder());
        return toResponse(applicationMistakeRepository.save(mistake));
    }

    @Transactional
    public ApplicationMistakeResponse updateApplicationMistake(UUID id, ApplicationMistakeRequest request) {
        ApplicationMistake mistake = applicationMistakeRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Application mistake not found: " + id));
        mistake.setMistake(request.mistake());
        mistake.setDisplayOrder(request.displayOrder());
        return toResponse(applicationMistakeRepository.save(mistake));
    }

    @Transactional(readOnly = true)
    public List<ApplicationMistakeResponse> listApplicationMistakes(UUID cycleId) {
        requireCycle(cycleId);
        return applicationMistakeRepository.findByRecruitmentCycleIdOrderByDisplayOrderAsc(cycleId).stream()
                .map(ExamGuideService::toResponse)
                .toList();
    }

    @Transactional
    public void deleteApplicationMistake(UUID id) {
        if (!applicationMistakeRepository.existsById(id)) {
            throw new NoSuchElementException("Application mistake not found: " + id);
        }
        applicationMistakeRepository.deleteById(id);
    }

    /* =================================================================== Fee rules */

    @Transactional
    public FeeRuleResponse createFeeRule(UUID cycleId, FeeRuleRequest request) {
        RecruitmentCycle cycle = requireCycle(cycleId);
        feeRuleRepository.findByRecruitmentCycleIdOrderByDisplayOrderAsc(cycleId).stream()
                .filter(f -> f.getCategory().equalsIgnoreCase(request.category()))
                .findFirst()
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("A fee rule already exists for category: " + request.category());
                });
        FeeRule fee = new FeeRule();
        fee.setRecruitmentCycle(cycle);
        applyFeeFields(fee, request);
        return toResponse(feeRuleRepository.save(fee));
    }

    @Transactional
    public FeeRuleResponse updateFeeRule(UUID id, FeeRuleRequest request) {
        FeeRule fee = feeRuleRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Fee rule not found: " + id));
        applyFeeFields(fee, request);
        return toResponse(feeRuleRepository.save(fee));
    }

    private void applyFeeFields(FeeRule fee, FeeRuleRequest request) {
        fee.setCategory(request.category());
        fee.setAmountRupees(request.amountRupees());
        fee.setExempted(request.exempted());
        fee.setNotes(request.notes());
        fee.setDisplayOrder(request.displayOrder());
        fee.setSourceId(request.sourceId());
    }

    @Transactional(readOnly = true)
    public List<FeeRuleResponse> listFeeRules(UUID cycleId) {
        requireCycle(cycleId);
        return feeRuleRepository.findByRecruitmentCycleIdOrderByDisplayOrderAsc(cycleId).stream()
                .map(ExamGuideService::toResponse)
                .toList();
    }

    @Transactional
    public void deleteFeeRule(UUID id) {
        if (!feeRuleRepository.existsById(id)) {
            throw new NoSuchElementException("Fee rule not found: " + id);
        }
        feeRuleRepository.deleteById(id);
    }

    /* =================================================================== Career posts (§25/§26) */

    @Transactional
    public CareerPostResponse createCareerPost(CareerPostRequest request) {
        Exam exam = requireExam(request.examCode());
        ExamCareerPost post = new ExamCareerPost();
        post.setExam(exam);
        applyCareerPostFields(post, request);
        return toResponse(careerPostRepository.save(post));
    }

    @Transactional
    public CareerPostResponse updateCareerPost(UUID id, CareerPostRequest request) {
        ExamCareerPost post = careerPostRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Career post not found: " + id));
        if (!post.getExam().getCode().equals(request.examCode())) {
            throw new IllegalArgumentException("A career post cannot be moved to a different exam.");
        }
        applyCareerPostFields(post, request);
        return toResponse(careerPostRepository.save(post));
    }

    private void applyCareerPostFields(ExamCareerPost post, CareerPostRequest request) {
        post.setPostTitle(request.postTitle());
        post.setPayLevel(request.payLevel());
        post.setSalaryMinRupees(request.salaryMinRupees());
        post.setSalaryMaxRupees(request.salaryMaxRupees());
        post.setGrowthPath(request.growthPath());
        post.setDescription(request.description());
        post.setSourceId(request.sourceId());
        post.setDisplayOrder(request.displayOrder());
    }

    @Transactional(readOnly = true)
    public List<CareerPostResponse> listCareerPosts(String examCode) {
        requireExam(examCode);
        return careerPostRepository.findByExamCodeOrderByDisplayOrderAsc(examCode).stream()
                .map(ExamGuideService::toResponse)
                .toList();
    }

    @Transactional
    public void deleteCareerPost(UUID id) {
        if (!careerPostRepository.existsById(id)) {
            throw new NoSuchElementException("Career post not found: " + id);
        }
        careerPostRepository.deleteById(id);
    }

    private static CareerPostResponse toResponse(ExamCareerPost post) {
        return new CareerPostResponse(post.getId(), post.getExam().getCode(), post.getPostTitle(),
                post.getPayLevel(), post.getSalaryMinRupees(), post.getSalaryMaxRupees(), post.getGrowthPath(),
                post.getDescription(), post.getSourceId(), post.getDisplayOrder());
    }

    /* =================================================================== User document status */

    @Transactional
    public void setDocumentStatus(User user, UUID documentRequirementId, String rawStatus) {
        DocumentRequirement doc = documentRequirementRepository.findById(documentRequirementId)
                .orElseThrow(() -> new NoSuchElementException("Document requirement not found: " + documentRequirementId));
        UserDocumentReadiness status = UserDocumentReadiness.valueOf(rawStatus.trim().toUpperCase(Locale.ROOT));

        String id = UserDocumentStatus.buildId(user.getId(), documentRequirementId);
        UserDocumentStatus row = userDocumentStatusRepository.findById(id).orElseGet(() -> {
            UserDocumentStatus created = new UserDocumentStatus();
            created.setId(id);
            created.setUserId(user.getId());
            created.setDocumentRequirement(doc);
            return created;
        });
        row.setStatus(status);
        row.setUpdatedAt(OffsetDateTime.now());
        userDocumentStatusRepository.save(row);
    }

    /**
     * Exam Guide spec §63. Public, like the guide itself — a past cycle's dates and
     * vacancy count are historical fact, not sensitive. Ordered newest-first by
     * creation, matching the admin cycle list this reuses the same repository query for.
     */
    @Transactional(readOnly = true)
    public List<RecruitmentCycleHistoryEntry> getCycleHistory(String examCode) {
        requireExam(examCode);
        return cycleRepository.findByExamCodeOrderByCreatedAtDesc(examCode).stream()
                .filter(c -> !c.isCurrent() && c.getContentStatus() == ContentStatus.PUBLISHED)
                .map(c -> new RecruitmentCycleHistoryEntry(
                        c.getId(), c.getCycleName(), c.getStatus().name(), c.getNotificationDate(),
                        c.getApplicationStart(), c.getApplicationEnd(), c.getExamStart(), c.getExamEnd(),
                        c.getVacancyCount()))
                .toList();
    }

    /**
     * Spec §30 "What's Changed This Year" — a field-level diff of dates, vacancy count,
     * eligibility age range, and fee-by-category, against the exam's most recent OTHER
     * published cycle older than this one. Deliberately field-level rather than a generic
     * object diff: most fields (ids, source citations, display order) would just be noise
     * to a student reading "what changed", and the spec's own examples are dates/fees/
     * eligibility, not structural changes.
     */
    @Transactional(readOnly = true)
    public CycleComparisonResponse getChangesFromPrevious(
            String examCode, UUID cycleId) {
        requireExam(examCode);
        RecruitmentCycle current = requireCycle(cycleId);
        if (!current.getExam().getCode().equals(examCode)) {
            throw new IllegalArgumentException("Cycle " + cycleId + " does not belong to exam " + examCode);
        }

        // "Previous" is determined by real-world chronology (application/notification/exam
        // date), NOT createdAt/insertion order -- verified against the seeded demo data,
        // where the past cycle is inserted into the database AFTER its current successor
        // (seedPastCycle runs after the current cycle is saved), which an createdAt-based
        // comparison got backwards. A cycle with no date at all can't be ordered and is
        // excluded rather than guessed at.
        LocalDate currentKey = chronologyKey(current);
        Optional<RecruitmentCycle> previousOpt = currentKey == null
                ? Optional.empty()
                : cycleRepository.findByExamCodeOrderByCreatedAtDesc(examCode).stream()
                        .filter(c -> c.getContentStatus() == ContentStatus.PUBLISHED)
                        .filter(c -> !c.getId().equals(cycleId))
                        .filter(c -> chronologyKey(c) != null && chronologyKey(c).isBefore(currentKey))
                        .max(Comparator.comparing(ExamGuideService::chronologyKey));

        if (previousOpt.isEmpty()) {
            return new CycleComparisonResponse(false, null, List.of());
        }
        RecruitmentCycle previous = previousOpt.get();

        List<CycleChangeEntry> changes = new java.util.ArrayList<>();
        addIfChanged(changes, "Notification date", previous.getNotificationDate(), current.getNotificationDate());
        addIfChanged(changes, "Application opens", previous.getApplicationStart(), current.getApplicationStart());
        addIfChanged(changes, "Application closes", previous.getApplicationEnd(), current.getApplicationEnd());
        addIfChanged(changes, "Exam start", previous.getExamStart(), current.getExamStart());
        addIfChanged(changes, "Exam end", previous.getExamEnd(), current.getExamEnd());
        addIfChanged(changes, "Vacancies", previous.getVacancyCount(), current.getVacancyCount());

        Optional<EligibilityRule> prevEligibility = eligibilityRepository.findById(previous.getId());
        Optional<EligibilityRule> currEligibility = eligibilityRepository.findById(current.getId());
        addIfChanged(changes, "Minimum age",
                prevEligibility.map(EligibilityRule::getMinimumAge).orElse(null),
                currEligibility.map(EligibilityRule::getMinimumAge).orElse(null));
        addIfChanged(changes, "Maximum age",
                prevEligibility.map(EligibilityRule::getMaximumAge).orElse(null),
                currEligibility.map(EligibilityRule::getMaximumAge).orElse(null));

        Map<String, FeeRule> prevFees = feeRuleRepository.findByRecruitmentCycleIdOrderByDisplayOrderAsc(previous.getId())
                .stream().collect(java.util.stream.Collectors.toMap(f -> f.getCategory().toUpperCase(Locale.ROOT), f -> f));
        Map<String, FeeRule> currFees = feeRuleRepository.findByRecruitmentCycleIdOrderByDisplayOrderAsc(current.getId())
                .stream().collect(java.util.stream.Collectors.toMap(f -> f.getCategory().toUpperCase(Locale.ROOT), f -> f));
        Set<String> allCategories = new java.util.TreeSet<>();
        allCategories.addAll(prevFees.keySet());
        allCategories.addAll(currFees.keySet());
        for (String category : allCategories) {
            FeeRule prevFee = prevFees.get(category);
            FeeRule currFee = currFees.get(category);
            String prevValue = prevFee == null ? null : feeDisplay(prevFee);
            String currValue = currFee == null ? null : feeDisplay(currFee);
            addIfChanged(changes, "Fee (" + category + ")", prevValue, currValue);
        }

        return new CycleComparisonResponse(
                true, previous.getCycleName(), changes);
    }

    /** The real-world date that best represents when a cycle "started" — see the caller's
     * comment on why this, not createdAt, is what "previous" is ordered by. */
    private static LocalDate chronologyKey(RecruitmentCycle c) {
        if (c.getApplicationStart() != null) return c.getApplicationStart();
        if (c.getNotificationDate() != null) return c.getNotificationDate();
        return c.getExamStart();
    }

    private static String feeDisplay(FeeRule fee) {
        return fee.isExempted() ? "Exempted" : "₹" + fee.getAmountRupees();
    }

    private static void addIfChanged(
            List<CycleChangeEntry> changes,
            String field, Object previousValue, Object currentValue) {
        if (java.util.Objects.equals(previousValue, currentValue)) {
            return;
        }
        changes.add(new CycleChangeEntry(
                field,
                previousValue == null ? null : previousValue.toString(),
                currentValue == null ? null : currentValue.toString()));
    }

    /* =================================================================== Mobile/public read */

    /**
     * @param user null when the caller is anonymous — every document's {@code userStatus}
     *             is then null rather than the endpoint requiring sign-in, since the guide
     *             itself (dates, eligibility, fees) is genuinely public content.
     */
    @Transactional(readOnly = true)
    public ExamGuideResponse getGuideForExam(String examCode, User user) {
        RecruitmentCycle cycle = cycleRepository
                .findByExamCodeAndCurrentTrueAndContentStatus(examCode, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new NoSuchElementException("No current recruitment cycle configured for " + examCode));
        return assembleGuide(cycle, user);
    }

    /**
     * Every active exam's current-cycle guide in one response — the mobile sync shape,
     * mirroring {@code ExamStructureService.getAllActiveStructures}. Exams with no
     * current cycle configured are simply absent, not an error — most exams have none
     * yet, and that is a normal, not exceptional, state for this feature's rollout.
     */
    @Transactional(readOnly = true)
    public List<ExamGuideResponse> getAllGuidesForActiveExams(User user) {
        return cycleRepository.findCurrentCyclesForActiveExams().stream()
                .map(cycle -> assembleGuide(cycle, user))
                .toList();
    }

    private ExamGuideResponse assembleGuide(RecruitmentCycle cycle, User user) {
        UUID cycleId = cycle.getId();
        // Collected as facts are built, then resolved once at the end — see the note on
        // ExamGuideResponse.sources for why this isn't nested per-fact instead.
        Set<UUID> citedSourceIds = new LinkedHashSet<>();

        EligibilitySummary eligibility = eligibilityRepository.findById(cycleId)
                .map(rule -> {
                    if (rule.getSourceId() != null) citedSourceIds.add(rule.getSourceId());
                    return new EligibilitySummary(
                            rule.getMinimumAge(), rule.getMaximumAge(), rule.getAgeCutoffDate(),
                            rule.getQualification(), rule.getNationality(), rule.getGenderRequirement(),
                            rule.getCategoryRelaxation(), rule.getSpecialRequirements(), rule.getSourceId());
                })
                .orElse(null);

        Map<UUID, UserDocumentReadiness> userStatuses = user == null
                ? Map.of()
                : userDocumentStatusRepository.findByUserId(user.getId()).stream()
                        .collect(java.util.stream.Collectors.toMap(
                                s -> s.getDocumentRequirement().getId(), UserDocumentStatus::getStatus));

        List<DocumentSummary> documents = documentRequirementRepository
                .findByRecruitmentCycleIdOrderByDisplayOrderAsc(cycleId).stream()
                .map(doc -> {
                    if (doc.getSourceId() != null) citedSourceIds.add(doc.getSourceId());
                    return new DocumentSummary(
                            doc.getId(), doc.getDocumentName(), doc.getRequired().name(), doc.getApplicableFor(),
                            doc.getFormat(), doc.getMaxSizeKb(), doc.getDimensions(), doc.getInstructions(),
                            Optional.ofNullable(userStatuses.get(doc.getId())).map(Enum::name).orElse(null),
                            doc.getSourceId());
                })
                .toList();

        List<ImportantDateSummary> dates = importantDateRepository
                .findByRecruitmentCycleIdOrderByDisplayOrderAsc(cycleId).stream()
                .map(d -> {
                    if (d.getSourceId() != null) citedSourceIds.add(d.getSourceId());
                    return new ImportantDateSummary(d.getId(), d.getEventType().name(), d.getTitle(),
                            d.getStartDate(), d.getEndDate(), d.isOfficial(), d.getSourceId());
                })
                .toList();

        List<ApplicationStepSummary> steps = applicationStepRepository
                .findByRecruitmentCycleIdOrderByStepNumberAsc(cycleId).stream()
                .map(s -> new ApplicationStepSummary(s.getStepNumber(), s.getTitle(), s.getDescription(),
                        s.getWarning(), s.getOfficialUrl()))
                .toList();

        List<String> mistakes = applicationMistakeRepository
                .findByRecruitmentCycleIdOrderByDisplayOrderAsc(cycleId).stream()
                .map(ApplicationMistake::getMistake)
                .toList();

        List<FeeSummary> fees = feeRuleRepository
                .findByRecruitmentCycleIdOrderByDisplayOrderAsc(cycleId).stream()
                .map(f -> {
                    if (f.getSourceId() != null) citedSourceIds.add(f.getSourceId());
                    return new FeeSummary(f.getCategory(), f.getAmountRupees(), f.isExempted(), f.getNotes(),
                            f.getSourceId());
                })
                .toList();

        List<CareerPostSummary> careerPosts = careerPostRepository
                .findByExamCodeOrderByDisplayOrderAsc(cycle.getExam().getCode()).stream()
                .map(post -> {
                    if (post.getSourceId() != null) citedSourceIds.add(post.getSourceId());
                    return new CareerPostSummary(post.getId(), post.getPostTitle(), post.getPayLevel(),
                            post.getSalaryMinRupees(), post.getSalaryMaxRupees(), post.getGrowthPath(),
                            post.getDescription(), post.getSourceId());
                })
                .toList();

        List<SourceSummary> sources = citedSourceIds.isEmpty()
                ? List.of()
                : sourceRepository.findAllById(citedSourceIds).stream()
                        .map(s -> new SourceSummary(s.getId(), s.getSourceName(), s.getSourceType().name(), s.getUrl()))
                        .toList();

        return new ExamGuideResponse(
                cycle.getExam().getCode(), cycle.getExam().getName(), cycleId, cycle.getCycleName(),
                cycle.getStatus().name(), cycle.getNotificationDate(), cycle.getApplicationStart(),
                cycle.getApplicationEnd(), cycle.getExamStart(), cycle.getExamEnd(), cycle.getVacancyCount(),
                cycle.getNotificationUrl(), cycle.getOverviewText(), cycle.isDemo(), cycle.getLastVerifiedAt(),
                eligibility, dates, documents, steps, mistakes, fees, careerPosts, sources);
    }

    /* =================================================================== Internals */

    private Exam requireExam(String code) {
        return examRepository.findById(code)
                .orElseThrow(() -> new NoSuchElementException("Exam not found: " + code));
    }

    private RecruitmentCycle requireCycle(UUID id) {
        return cycleRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Recruitment cycle not found: " + id));
    }

    private static RecruitmentCycleStatus parseStatus(String raw) {
        return RecruitmentCycleStatus.valueOf(raw.trim().toUpperCase(Locale.ROOT));
    }

    private static RecruitmentCycleResponse toResponse(RecruitmentCycle cycle) {
        return new RecruitmentCycleResponse(
                cycle.getId(), cycle.getExam().getCode(), cycle.getExam().getName(), cycle.getCycleName(),
                cycle.getStatus().name(), cycle.getNotificationDate(), cycle.getApplicationStart(),
                cycle.getApplicationEnd(), cycle.getExamStart(), cycle.getExamEnd(), cycle.getVacancyCount(),
                cycle.getNotificationUrl(), cycle.getOverviewText(), cycle.isCurrent(), cycle.isDemo(),
                cycle.getLastVerifiedAt(), cycle.getContentStatus().name());
    }

    private static ExamSourceResponse toResponse(ExamSource source) {
        return new ExamSourceResponse(source.getId(), source.getSourceName(), source.getSourceType().name(),
                source.getUrl(), source.getPublicationDate(), source.getLastVerifiedAt());
    }

    private static EligibilityRuleResponse toResponse(EligibilityRule rule) {
        return new EligibilityRuleResponse(rule.getRecruitmentCycleId(), rule.getMinimumAge(), rule.getMaximumAge(),
                rule.getAgeCutoffDate(), rule.getQualification(), rule.getNationality(), rule.getGenderRequirement(),
                rule.getCategoryRelaxation(), rule.getSpecialRequirements(), rule.getSourceId());
    }

    private static ImportantDateResponse toResponse(ImportantDate date) {
        return new ImportantDateResponse(date.getId(), date.getRecruitmentCycle().getId(), date.getEventType().name(),
                date.getTitle(), date.getStartDate(), date.getEndDate(), date.isOfficial(), date.getDisplayOrder(),
                date.getSourceId());
    }

    private static DocumentRequirementResponse toResponse(DocumentRequirement doc) {
        return new DocumentRequirementResponse(doc.getId(), doc.getRecruitmentCycle().getId(), doc.getDocumentName(),
                doc.getRequired().name(), doc.getApplicableFor(), doc.getFormat(), doc.getMaxSizeKb(),
                doc.getDimensions(), doc.getInstructions(), doc.getDisplayOrder(), doc.getSourceId());
    }

    private static ApplicationStepResponse toResponse(ApplicationStep step) {
        return new ApplicationStepResponse(step.getId(), step.getRecruitmentCycle().getId(), step.getStepNumber(),
                step.getTitle(), step.getDescription(), step.getWarning(), step.getOfficialUrl());
    }

    private static ApplicationMistakeResponse toResponse(ApplicationMistake mistake) {
        return new ApplicationMistakeResponse(mistake.getId(), mistake.getRecruitmentCycle().getId(),
                mistake.getMistake(), mistake.getDisplayOrder());
    }

    private static FeeRuleResponse toResponse(FeeRule fee) {
        return new FeeRuleResponse(fee.getId(), fee.getRecruitmentCycle().getId(), fee.getCategory(),
                fee.getAmountRupees(), fee.isExempted(), fee.getNotes(), fee.getDisplayOrder(), fee.getSourceId());
    }
}
