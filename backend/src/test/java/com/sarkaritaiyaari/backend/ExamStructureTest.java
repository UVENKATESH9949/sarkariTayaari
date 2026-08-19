package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.ExamPaperRequest;
import com.sarkaritaiyaari.backend.dto.ExamPaperResponse;
import com.sarkaritaiyaari.backend.dto.ExamStageRequest;
import com.sarkaritaiyaari.backend.dto.ExamStageResponse;
import com.sarkaritaiyaari.backend.dto.ExamStructureResponse;
import com.sarkaritaiyaari.backend.dto.PaperSectionRequest;
import com.sarkaritaiyaari.backend.dto.PaperSectionResponse;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.repository.ExamStageRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ExamStructureTest extends AbstractIntegrationTest {

    @Autowired
    private ExamStageRepository stageRepository;

    private final List<UUID> createdStageIds = new ArrayList<>();

    /** Runs before the base-class cleanup; deleting a stage cascades to its papers and sections. */
    @AfterEach
    void cleanupStructure() {
        if (!createdStageIds.isEmpty()) {
            stageRepository.deleteAllById(createdStageIds);
            createdStageIds.clear();
        }
    }

    @Test
    void structure_returnsStagePaperSectionTreeInDisplayOrder() {
        ExamStageResponse stage = createStage("Structure Test Stage", 1);
        ExamPaperResponse paper = createPaper(stage.id(), "Structure Test Paper", "objective", 60,
                new BigDecimal("2"), new BigDecimal("0.5"));
        createSection(paper.id(), "Second Section", 10, null, null, null, 2);
        createSection(paper.id(), "First Section", 20, null, null, null, 1);

        ExamStructureResponse structure = getStructure();
        ExamStructureResponse.StageNode stageNode = findStage(structure, "Structure Test Stage");

        assertThat(stageNode.papers()).hasSize(1);
        ExamStructureResponse.PaperNode paperNode = stageNode.papers().get(0);
        assertThat(paperNode.mockable()).isTrue();
        assertThat(paperNode.durationMinutes()).isEqualTo(60);
        assertThat(paperNode.sections()).extracting(ExamStructureResponse.SectionNode::name)
                .containsExactly("First Section", "Second Section");
    }

    @Test
    void section_inheritsPaperMarking_whenNotOverridden() {
        ExamStageResponse stage = createStage("Inherit Marking Stage", 1);
        ExamPaperResponse paper = createPaper(stage.id(), "Inherit Marking Paper", "objective", 60,
                new BigDecimal("3"), new BigDecimal("1"));
        createSection(paper.id(), "Inheriting Section", 30, null, null, null, 1);

        ExamStructureResponse.SectionNode section = onlySection(findStage(getStructure(), "Inherit Marking Stage"));

        assertThat(section.marksCorrect()).isNull();
        assertThat(section.marksWrong()).isNull();
        assertThat(section.effectiveMarksCorrect()).isEqualByComparingTo("3");
        assertThat(section.effectiveMarksWrong()).isEqualByComparingTo("1");
    }

    @Test
    void section_overridesPaperMarking_whenSet() {
        ExamStageResponse stage = createStage("Override Marking Stage", 1);
        ExamPaperResponse paper = createPaper(stage.id(), "Override Marking Paper", "objective", 60,
                new BigDecimal("3"), new BigDecimal("1"));
        createSection(paper.id(), "Overriding Section", 45, null,
                new BigDecimal("2"), new BigDecimal("0.5"), 1);

        ExamStructureResponse.SectionNode section = onlySection(findStage(getStructure(), "Override Marking Stage"));

        assertThat(section.effectiveMarksCorrect()).isEqualByComparingTo("2");
        assertThat(section.effectiveMarksWrong()).isEqualByComparingTo("0.5");
    }

    @Test
    void sectionallyTimed_reflectsWhetherSectionHasItsOwnDuration() {
        ExamStageResponse stage = createStage("Sectional Timing Stage", 1);
        ExamPaperResponse paper = createPaper(stage.id(), "Sectional Timing Paper", "objective", 60,
                new BigDecimal("1"), new BigDecimal("0.25"));
        createSection(paper.id(), "Timed Section", 30, 20, null, null, 1);
        createSection(paper.id(), "Untimed Section", 35, null, null, null, 2);

        List<ExamStructureResponse.SectionNode> sections =
                findStage(getStructure(), "Sectional Timing Stage").papers().get(0).sections();

        assertThat(sections.get(0).sectionallyTimed()).isTrue();
        assertThat(sections.get(0).durationMinutes()).isEqualTo(20);
        assertThat(sections.get(1).sectionallyTimed()).isFalse();
        assertThat(sections.get(1).durationMinutes()).isNull();
    }

    @Test
    void deletingStage_cascadesToPapersAndSections() {
        ExamStageResponse stage = createStage("Cascade Stage", 1);
        ExamPaperResponse paper = createPaper(stage.id(), "Cascade Paper", "objective", 60,
                new BigDecimal("2"), new BigDecimal("0.5"));
        createSection(paper.id(), "Cascade Section", 10, null, null, null, 1);

        ResponseEntity<Void> deleted = restTemplate.exchange(
                "/api/exam-stages/" + stage.id(), HttpMethod.DELETE, adminAuth(), Void.class);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        createdStageIds.remove(stage.id());

        ResponseEntity<ExamPaperResponse[]> papers = restTemplate.exchange(
                "/api/exam-papers?stageId=" + stage.id(), HttpMethod.GET, adminAuth(), ExamPaperResponse[].class);
        assertThat(papers.getBody()).isEmpty();

        ResponseEntity<PaperSectionResponse[]> sections = restTemplate.exchange(
                "/api/paper-sections?paperId=" + paper.id(), HttpMethod.GET, adminAuth(), PaperSectionResponse[].class);
        assertThat(sections.getBody()).isEmpty();
    }

    @Test
    void duplicateStageNameForSameExam_returns400() {
        createStage("Duplicate Stage Name", 1);

        ExamStageRequest duplicate = new ExamStageRequest();
        duplicate.setExamCode(TEST_EXAM_CODE);
        duplicate.setName("Duplicate Stage Name");

        ResponseEntity<Map> response = restTemplate.exchange("/api/exam-stages", HttpMethod.POST, adminAuth(duplicate), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void unknownPaperType_returns400() {
        ExamStageResponse stage = createStage("Unknown Paper Type Stage", 1);

        ExamPaperRequest request = new ExamPaperRequest();
        request.setStageId(stage.id());
        request.setName("Bad Type Paper");
        request.setPaperType("not-a-real-type");

        ResponseEntity<Map> response = restTemplate.exchange("/api/exam-papers", HttpMethod.POST, adminAuth(request), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void sectionWithoutSubjects_returns400() {
        ExamStageResponse stage = createStage("No Subjects Stage", 1);
        ExamPaperResponse paper = createPaper(stage.id(), "No Subjects Paper", "objective", 60,
                new BigDecimal("2"), new BigDecimal("0.5"));

        PaperSectionRequest request = new PaperSectionRequest();
        request.setPaperId(paper.id());
        request.setName("Sectionless");
        request.setQuestionCount(10);
        request.setSubjectIds(List.of());

        ResponseEntity<Map> response = restTemplate.exchange("/api/paper-sections", HttpMethod.POST, adminAuth(request), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    /* ------------------------------------------------------------------- helpers */

    private ExamStructureResponse getStructure() {
        ResponseEntity<ExamStructureResponse> response = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/structure", HttpMethod.GET, adminAuth(), ExamStructureResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private static ExamStructureResponse.StageNode findStage(ExamStructureResponse structure, String name) {
        return structure.stages().stream()
                .filter(s -> s.name().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Stage not found in structure: " + name));
    }

    private static ExamStructureResponse.SectionNode onlySection(ExamStructureResponse.StageNode stage) {
        assertThat(stage.papers()).hasSize(1);
        assertThat(stage.papers().get(0).sections()).hasSize(1);
        return stage.papers().get(0).sections().get(0);
    }

    private ExamStageResponse createStage(String name, int displayOrder) {
        ExamStageRequest request = new ExamStageRequest();
        request.setExamCode(TEST_EXAM_CODE);
        request.setName(name);
        request.setDisplayOrder(displayOrder);

        ResponseEntity<ExamStageResponse> response = restTemplate.exchange(
                "/api/exam-stages", HttpMethod.POST, adminAuth(request), ExamStageResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdStageIds.add(response.getBody().id());
        return response.getBody();
    }

    private ExamPaperResponse createPaper(UUID stageId, String name, String paperType, Integer duration,
                                          BigDecimal marksCorrect, BigDecimal marksWrong) {
        ExamPaperRequest request = new ExamPaperRequest();
        request.setStageId(stageId);
        request.setName(name);
        request.setPaperType(paperType);
        request.setDurationMinutes(duration);
        request.setMarksCorrect(marksCorrect);
        request.setMarksWrong(marksWrong);
        request.setDisplayOrder(1);

        ResponseEntity<ExamPaperResponse> response = restTemplate.exchange(
                "/api/exam-papers", HttpMethod.POST, adminAuth(request), ExamPaperResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getBody();
    }

    private PaperSectionResponse createSection(UUID paperId, String name, int questionCount, Integer duration,
                                               BigDecimal marksCorrect, BigDecimal marksWrong, int displayOrder) {
        Subject subject = subjectRepository.findByNameIgnoreCase(TEST_SUBJECT_NAME).orElseThrow();

        PaperSectionRequest request = new PaperSectionRequest();
        request.setPaperId(paperId);
        request.setName(name);
        request.setQuestionCount(questionCount);
        request.setDurationMinutes(duration);
        request.setMarksCorrect(marksCorrect);
        request.setMarksWrong(marksWrong);
        request.setDisplayOrder(displayOrder);
        request.setSubjectIds(List.of(subject.getId()));

        ResponseEntity<PaperSectionResponse> response = restTemplate.exchange(
                "/api/paper-sections", HttpMethod.POST, adminAuth(request), PaperSectionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getBody();
    }
}
