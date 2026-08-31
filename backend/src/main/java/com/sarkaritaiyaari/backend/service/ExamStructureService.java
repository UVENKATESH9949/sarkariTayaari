package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.ExamPaperRequest;
import com.sarkaritaiyaari.backend.dto.ExamPaperResponse;
import com.sarkaritaiyaari.backend.dto.ExamStageRequest;
import com.sarkaritaiyaari.backend.dto.ExamStageResponse;
import com.sarkaritaiyaari.backend.dto.ExamStructureResponse;
import com.sarkaritaiyaari.backend.dto.PaperSectionRequest;
import com.sarkaritaiyaari.backend.dto.PaperSectionResponse;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.ExamPaper;
import com.sarkaritaiyaari.backend.entity.ExamStage;
import com.sarkaritaiyaari.backend.entity.PaperSection;
import com.sarkaritaiyaari.backend.entity.PaperType;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.repository.ExamPaperRepository;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.ExamStageRepository;
import com.sarkaritaiyaari.backend.repository.PaperSectionRepository;
import com.sarkaritaiyaari.backend.repository.PaperTypeRepository;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Transactional
public class ExamStructureService {

    private final ExamRepository examRepository;
    private final ExamStageRepository stageRepository;
    private final ExamPaperRepository paperRepository;
    private final PaperSectionRepository sectionRepository;
    private final PaperTypeRepository paperTypeRepository;
    private final SubjectRepository subjectRepository;

    public ExamStructureService(
            ExamRepository examRepository,
            ExamStageRepository stageRepository,
            ExamPaperRepository paperRepository,
            PaperSectionRepository sectionRepository,
            PaperTypeRepository paperTypeRepository,
            SubjectRepository subjectRepository
    ) {
        this.examRepository = examRepository;
        this.stageRepository = stageRepository;
        this.paperRepository = paperRepository;
        this.sectionRepository = sectionRepository;
        this.paperTypeRepository = paperTypeRepository;
        this.subjectRepository = subjectRepository;
    }

    /* -------------------------------------------------- Pattern versioning (2108) */

    /**
     * Whether a stage version is in force on a given date.
     *
     * <p>The single definition of "which pattern applies now". Before TICKET-2108 there was
     * none: {@code effectiveFrom} and {@code versionLabel} existed but nothing read them, so
     * versioning was a label an admin could type and nothing more.
     *
     * <p>Both bounds are open-ended by design. A null {@code effectiveFrom} means "has always
     * applied", which is what every pre-existing row means — none of them were entered with a
     * date, and treating them as not-yet-effective would make every exam's pattern vanish the
     * moment this shipped. A null {@code effectiveTo} means "still current".
     *
     * <p>{@code effectiveTo} is inclusive: an admin entering "this pattern ran through 2023"
     * means the whole of that day, not up to the midnight before it.
     */
    static boolean isEffectiveOn(ExamStage stage, LocalDate date) {
        LocalDate from = stage.getEffectiveFrom();
        LocalDate to = stage.getEffectiveTo();
        if (from != null && date.isBefore(from)) return false;
        if (to != null && date.isAfter(to)) return false;
        return true;
    }

    /**
     * The stages of one exam that apply today, keeping only one version per stage name.
     *
     * <p>Needed because relaxing the uniqueness constraint makes two versions of "Tier 2"
     * legal, and everything downstream — mock test generation above all — assumes one. Left
     * unhandled, a mobile client would sync both and generate tests from a superseded
     * pattern.
     *
     * <p>When more than one version is somehow effective at once (overlapping windows an
     * admin entered by hand), the most recently-started one wins, and an un-dated row loses
     * to a dated one. That is a deterministic answer to a genuinely ambiguous input rather
     * than the arbitrary one a plain list order would give.
     */
    private static List<ExamStage> effectiveStages(List<ExamStage> stages, LocalDate date) {
        Map<String, ExamStage> winnerByName = new LinkedHashMap<>();
        for (ExamStage stage : stages) {
            if (!isEffectiveOn(stage, date)) continue;
            String key = stage.getName().toLowerCase(java.util.Locale.ROOT);
            ExamStage current = winnerByName.get(key);
            if (current == null || startsLaterThan(stage, current)) {
                winnerByName.put(key, stage);
            }
        }
        return List.copyOf(winnerByName.values());
    }

    /** A dated start beats an undated one; between two dated starts, the later wins. */
    private static boolean startsLaterThan(ExamStage candidate, ExamStage incumbent) {
        LocalDate a = candidate.getEffectiveFrom();
        LocalDate b = incumbent.getEffectiveFrom();
        if (a == null) return false;
        if (b == null) return true;
        return a.isAfter(b);
    }

    /* ------------------------------------------------------------------ Structure */

    @Transactional(readOnly = true)
    public ExamStructureResponse getStructure(String examCode) {
        Exam exam = requireExam(examCode);
        List<ExamStage> stages = stageRepository.findStructureByExamCode(examCode);

        // The admin view keeps every version, each flagged with whether it is the one in
        // force. An admin managing pattern history has to be able to see the superseded
        // rows — filtering them here would make them uneditable and effectively invisible.
        LocalDate today = LocalDate.now();
        Set<UUID> activeIds = effectiveStages(stages, today).stream()
                .map(ExamStage::getId)
                .collect(Collectors.toSet());

        List<ExamStructureResponse.StageNode> stageNodes = stages.stream()
                .sorted(Comparator.comparingInt(ExamStage::getDisplayOrder))
                .map(stage -> toStageNode(stage, activeIds.contains(stage.getId())))
                .toList();

        return new ExamStructureResponse(exam.getCode(), exam.getName(), toSyllabus(exam), stageNodes);
    }

    /**
     * Every active exam's structure, including exams that have none yet — the client
     * needs to know an exam exists without a pattern, not just omit it silently.
     */
    @Transactional(readOnly = true)
    public List<ExamStructureResponse> getAllActiveStructures() {
        List<ExamStage> stages = stageRepository.findStructuresForActiveExams();

        Map<String, List<ExamStage>> stagesByExam = stages.stream()
                .collect(Collectors.groupingBy(s -> s.getExam().getCode()));

        // The mobile sync source, unlike getStructure above, sends only the version in force.
        // A device has no use for superseded patterns and every use for not accidentally
        // generating a mock test from one — see effectiveStages for why that is now possible.
        LocalDate today = LocalDate.now();

        return examRepository.findAllByOrderByDisplayOrderAsc().stream()
                .filter(Exam::isActive)
                .map(exam -> new ExamStructureResponse(
                        exam.getCode(),
                        exam.getName(),
                        toSyllabus(exam),
                        effectiveStages(
                                stagesByExam.getOrDefault(exam.getCode(), List.of()).stream()
                                        .sorted(Comparator.comparingInt(ExamStage::getDisplayOrder))
                                        .toList(),
                                today).stream()
                                .map(stage -> toStageNode(stage, true))
                                .toList()
                ))
                .toList();
    }

    private static List<PaperSectionResponse.SubjectRef> toSyllabus(Exam exam) {
        return exam.getSubjects().stream()
                .sorted(Comparator.comparingInt(Subject::getDisplayOrder).thenComparing(Subject::getName))
                .map(s -> new PaperSectionResponse.SubjectRef(s.getId(), s.getName()))
                .toList();
    }

    private static ExamStructureResponse.StageNode toStageNode(ExamStage stage, boolean active) {
        return new ExamStructureResponse.StageNode(
                stage.getId(),
                stage.getName(),
                stage.getDisplayOrder(),
                stage.getEffectiveFrom(),
                stage.getEffectiveTo(),
                stage.getVersionLabel(),
                active,
                stage.getPapers().stream()
                        .sorted(Comparator.comparingInt(ExamPaper::getDisplayOrder))
                        .map(ExamStructureService::toPaperNode)
                        .toList()
        );
    }

    private static ExamStructureResponse.PaperNode toPaperNode(ExamPaper paper) {
        return new ExamStructureResponse.PaperNode(
                paper.getId(),
                paper.getName(),
                paper.getPaperType().getCode(),
                paper.getPaperType().isMockable(),
                paper.getDurationMinutes(),
                paper.getTotalMarks(),
                paper.getMarksCorrect(),
                paper.getMarksWrong(),
                paper.isQualifying(),
                paper.getQualifyingPercentage(),
                paper.getDisplayOrder(),
                paper.getSections().stream()
                        .sorted(Comparator.comparingInt(PaperSection::getDisplayOrder))
                        .map(section -> toSectionNode(section, paper))
                        .toList()
        );
    }

    private static ExamStructureResponse.SectionNode toSectionNode(PaperSection section, ExamPaper paper) {
        BigDecimal effectiveCorrect = section.getMarksCorrect() != null
                ? section.getMarksCorrect() : paper.getMarksCorrect();
        BigDecimal effectiveWrong = section.getMarksWrong() != null
                ? section.getMarksWrong() : paper.getMarksWrong();

        return new ExamStructureResponse.SectionNode(
                section.getId(),
                section.getName(),
                section.getQuestionCount(),
                section.getDurationMinutes(),
                section.getDurationMinutes() != null,
                section.getMarksCorrect(),
                section.getMarksWrong(),
                effectiveCorrect,
                effectiveWrong,
                section.getDisplayOrder(),
                toSubjectRefs(section)
        );
    }

    private static List<PaperSectionResponse.SubjectRef> toSubjectRefs(PaperSection section) {
        return section.getSubjects().stream()
                .sorted(Comparator.comparing(Subject::getName))
                .map(s -> new PaperSectionResponse.SubjectRef(s.getId(), s.getName()))
                .toList();
    }

    /* ---------------------------------------------------------------------- Stages */

    public ExamStageResponse createStage(ExamStageRequest request) {
        Exam exam = requireExam(request.getExamCode());
        // Version-aware (TICKET-2108). The old name-only check was the code-level twin of the
        // UNIQUE constraint V16 relaxes: leaving it would mean the migration changed nothing,
        // because the service would still refuse the second version.
        stageRepository.findByExamCodeNameAndVersion(exam.getCode(), request.getName(), request.getVersionLabel())
                .ifPresent(existing -> {
                    throw new IllegalArgumentException(
                            "This exam already has a stage called \"" + request.getName() + "\""
                                    + (request.getVersionLabel() == null || request.getVersionLabel().isBlank()
                                        ? " with no version label. Give one of them a version label to keep both."
                                        : " at version \"" + request.getVersionLabel() + "\"."));
                });
        ExamStage stage = new ExamStage();
        stage.setExam(exam);
        applyStage(stage, request);
        return toStageResponse(stageRepository.save(stage));
    }

    @Transactional(readOnly = true)
    public List<ExamStageResponse> listStages(String examCode) {
        List<ExamStage> stages = examCode != null
                ? stageRepository.findByExamCodeOrderByDisplayOrderAsc(examCode)
                : stageRepository.findAll();
        return stages.stream().map(ExamStructureService::toStageResponse).toList();
    }

    public ExamStageResponse updateStage(UUID id, ExamStageRequest request) {
        ExamStage stage = requireStage(id);
        Exam exam = requireExam(request.getExamCode());
        // Same guard as create, minus this row itself — renaming a stage to collide with a
        // sibling version would otherwise only fail at the DB, as an unmapped 500.
        stageRepository.findByExamCodeNameAndVersion(exam.getCode(), request.getName(), request.getVersionLabel())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new IllegalArgumentException(
                            "Another stage on this exam already uses that name and version label.");
                });
        stage.setExam(exam);
        applyStage(stage, request);
        return toStageResponse(stageRepository.save(stage));
    }

    public void deleteStage(UUID id) {
        if (!stageRepository.existsById(id)) {
            throw new NoSuchElementException("Stage not found: " + id);
        }
        stageRepository.deleteById(id);
    }

    /* ---------------------------------------------------------------------- Papers */

    public ExamPaperResponse createPaper(ExamPaperRequest request) {
        ExamStage stage = requireStage(request.getStageId());
        paperRepository.findByStageIdAndNameIgnoreCase(stage.getId(), request.getName())
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("Paper already exists in this stage: " + request.getName());
                });
        ExamPaper paper = new ExamPaper();
        paper.setStage(stage);
        applyPaper(paper, request);
        return toPaperResponse(paperRepository.save(paper));
    }

    @Transactional(readOnly = true)
    public List<ExamPaperResponse> listPapers(UUID stageId) {
        List<ExamPaper> papers = stageId != null
                ? paperRepository.findByStageIdOrderByDisplayOrderAsc(stageId)
                : paperRepository.findAll();
        return papers.stream().map(ExamStructureService::toPaperResponse).toList();
    }

    public ExamPaperResponse updatePaper(UUID id, ExamPaperRequest request) {
        ExamPaper paper = requirePaper(id);
        paper.setStage(requireStage(request.getStageId()));
        applyPaper(paper, request);
        return toPaperResponse(paperRepository.save(paper));
    }

    public void deletePaper(UUID id) {
        if (!paperRepository.existsById(id)) {
            throw new NoSuchElementException("Paper not found: " + id);
        }
        paperRepository.deleteById(id);
    }

    /* -------------------------------------------------------------------- Sections */

    public PaperSectionResponse createSection(PaperSectionRequest request) {
        ExamPaper paper = requirePaper(request.getPaperId());
        sectionRepository.findByPaperIdAndNameIgnoreCase(paper.getId(), request.getName())
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("Section already exists in this paper: " + request.getName());
                });
        PaperSection section = new PaperSection();
        section.setPaper(paper);
        applySection(section, request);
        return toSectionResponse(sectionRepository.save(section));
    }

    @Transactional(readOnly = true)
    public List<PaperSectionResponse> listSections(UUID paperId) {
        List<PaperSection> sections = paperId != null
                ? sectionRepository.findByPaperIdOrderByDisplayOrderAsc(paperId)
                : sectionRepository.findAll();
        return sections.stream().map(ExamStructureService::toSectionResponse).toList();
    }

    public PaperSectionResponse updateSection(UUID id, PaperSectionRequest request) {
        PaperSection section = requireSection(id);
        section.setPaper(requirePaper(request.getPaperId()));
        applySection(section, request);
        return toSectionResponse(sectionRepository.save(section));
    }

    public void deleteSection(UUID id) {
        if (!sectionRepository.existsById(id)) {
            throw new NoSuchElementException("Section not found: " + id);
        }
        sectionRepository.deleteById(id);
    }

    /* ------------------------------------------------------------------- Internals */

    private Exam requireExam(String code) {
        return examRepository.findById(code)
                .orElseThrow(() -> new NoSuchElementException("Exam not found: " + code));
    }

    private ExamStage requireStage(UUID id) {
        return stageRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Unknown stageId: " + id));
    }

    private ExamPaper requirePaper(UUID id) {
        return paperRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Unknown paperId: " + id));
    }

    private PaperSection requireSection(UUID id) {
        return sectionRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Section not found: " + id));
    }

    private static void applyStage(ExamStage stage, ExamStageRequest request) {
        LocalDate from = request.getEffectiveFrom();
        LocalDate to = request.getEffectiveTo();
        // Checked here because no field-level annotation can compare two fields. V16 has the
        // same CHECK, but reaching it means an unmapped 500 instead of a readable message.
        if (from != null && to != null && from.isAfter(to)) {
            throw new IllegalArgumentException("\"Effective from\" cannot be after \"effective to\".");
        }
        stage.setName(request.getName());
        stage.setDisplayOrder(request.getDisplayOrder());
        stage.setEffectiveFrom(from);
        stage.setEffectiveTo(to);
        stage.setVersionLabel(blankToNull(request.getVersionLabel()));
    }

    /**
     * An empty version label from a cleared form field is "un-versioned", not the empty
     * string. This matters more than it looks: the unique index keys on
     * {@code coalesce(version_label, '')}, so storing "" for one row and null for another
     * would make two rows that are semantically identical pass the constraint.
     */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void applyPaper(ExamPaper paper, ExamPaperRequest request) {
        PaperType type = paperTypeRepository.findById(request.getPaperType())
                .orElseThrow(() -> new IllegalArgumentException("Unknown paper type: " + request.getPaperType()));
        paper.setName(request.getName());
        paper.setPaperType(type);
        paper.setDurationMinutes(request.getDurationMinutes());
        paper.setTotalMarks(request.getTotalMarks());
        paper.setMarksCorrect(request.getMarksCorrect());
        paper.setMarksWrong(request.getMarksWrong());
        paper.setQualifying(request.isQualifying());
        paper.setQualifyingPercentage(request.getQualifyingPercentage());
        paper.setDisplayOrder(request.getDisplayOrder());
    }

    private void applySection(PaperSection section, PaperSectionRequest request) {
        Set<Subject> subjects = new LinkedHashSet<>();
        for (UUID subjectId : request.getSubjectIds()) {
            subjects.add(subjectRepository.findById(subjectId)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown subjectId: " + subjectId)));
        }
        section.setName(request.getName());
        section.setQuestionCount(request.getQuestionCount());
        section.setDurationMinutes(request.getDurationMinutes());
        section.setMarksCorrect(request.getMarksCorrect());
        section.setMarksWrong(request.getMarksWrong());
        section.setDisplayOrder(request.getDisplayOrder());
        section.setSubjects(subjects);

        // A section can only draw from subjects the exam covers, so adding one to a
        // section implies it belongs to the syllabus. Doing it here keeps the syllabus
        // a superset of the sections rather than letting the two drift apart.
        Exam exam = section.getPaper().getStage().getExam();
        if (exam.getSubjects().addAll(subjects)) {
            examRepository.save(exam);
        }
    }

    private static ExamStageResponse toStageResponse(ExamStage stage) {
        return new ExamStageResponse(
                stage.getId(),
                stage.getExam().getCode(),
                stage.getName(),
                stage.getDisplayOrder(),
                stage.getEffectiveFrom(),
                stage.getEffectiveTo(),
                stage.getVersionLabel(),
                isEffectiveOn(stage, LocalDate.now())
        );
    }

    private static ExamPaperResponse toPaperResponse(ExamPaper paper) {
        return new ExamPaperResponse(
                paper.getId(),
                paper.getStage().getId(),
                paper.getName(),
                paper.getPaperType().getCode(),
                paper.getPaperType().isMockable(),
                paper.getDurationMinutes(),
                paper.getTotalMarks(),
                paper.getMarksCorrect(),
                paper.getMarksWrong(),
                paper.isQualifying(),
                paper.getQualifyingPercentage(),
                paper.getDisplayOrder()
        );
    }

    private static PaperSectionResponse toSectionResponse(PaperSection section) {
        return new PaperSectionResponse(
                section.getId(),
                section.getPaper().getId(),
                section.getName(),
                section.getQuestionCount(),
                section.getDurationMinutes(),
                section.getMarksCorrect(),
                section.getMarksWrong(),
                section.getDisplayOrder(),
                toSubjectRefs(section)
        );
    }
}
