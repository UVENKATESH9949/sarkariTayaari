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
import java.util.Comparator;
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

    /* ------------------------------------------------------------------ Structure */

    @Transactional(readOnly = true)
    public ExamStructureResponse getStructure(String examCode) {
        Exam exam = requireExam(examCode);
        List<ExamStage> stages = stageRepository.findStructureByExamCode(examCode);

        List<ExamStructureResponse.StageNode> stageNodes = stages.stream()
                .sorted(Comparator.comparingInt(ExamStage::getDisplayOrder))
                .map(ExamStructureService::toStageNode)
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

        return examRepository.findAllByOrderByDisplayOrderAsc().stream()
                .filter(Exam::isActive)
                .map(exam -> new ExamStructureResponse(
                        exam.getCode(),
                        exam.getName(),
                        toSyllabus(exam),
                        stagesByExam.getOrDefault(exam.getCode(), List.of()).stream()
                                .sorted(Comparator.comparingInt(ExamStage::getDisplayOrder))
                                .map(ExamStructureService::toStageNode)
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

    private static ExamStructureResponse.StageNode toStageNode(ExamStage stage) {
        return new ExamStructureResponse.StageNode(
                stage.getId(),
                stage.getName(),
                stage.getDisplayOrder(),
                stage.getEffectiveFrom(),
                stage.getVersionLabel(),
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
        stageRepository.findByExamCodeAndNameIgnoreCase(exam.getCode(), request.getName())
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("Stage already exists for this exam: " + request.getName());
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
        stage.setExam(requireExam(request.getExamCode()));
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
        stage.setName(request.getName());
        stage.setDisplayOrder(request.getDisplayOrder());
        stage.setEffectiveFrom(request.getEffectiveFrom());
        stage.setVersionLabel(request.getVersionLabel());
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
                stage.getVersionLabel()
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
