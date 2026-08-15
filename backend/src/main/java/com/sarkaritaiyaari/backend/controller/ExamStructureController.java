package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ExamPaperRequest;
import com.sarkaritaiyaari.backend.dto.ExamPaperResponse;
import com.sarkaritaiyaari.backend.dto.ExamStageRequest;
import com.sarkaritaiyaari.backend.dto.ExamStageResponse;
import com.sarkaritaiyaari.backend.dto.ExamStructureResponse;
import com.sarkaritaiyaari.backend.dto.PaperSectionRequest;
import com.sarkaritaiyaari.backend.dto.PaperSectionResponse;
import com.sarkaritaiyaari.backend.service.ExamStructureService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Stage / Paper / Section management, plus the single read that returns an exam's whole
 * structure. Kept in one controller because the three levels are only ever meaningful
 * as parts of the same tree.
 */
@RestController
public class ExamStructureController {

    private final ExamStructureService examStructureService;

    public ExamStructureController(ExamStructureService examStructureService) {
        this.examStructureService = examStructureService;
    }

    /** The whole Stage → Paper → Section → Subjects tree for one exam, in display order. */
    @GetMapping("/api/exams/{examCode}/structure")
    public ExamStructureResponse getStructure(@PathVariable String examCode) {
        return examStructureService.getStructure(examCode);
    }

    /**
     * Every active exam's structure in one response — what the mobile client syncs, so it
     * makes a single request instead of one per exam.
     */
    @GetMapping("/api/exam-structures")
    public List<ExamStructureResponse> getAllStructures() {
        return examStructureService.getAllActiveStructures();
    }

    /* ---------------------------------------------------------------------- Stages */

    @PostMapping("/api/exam-stages")
    public ResponseEntity<ExamStageResponse> createStage(@Valid @RequestBody ExamStageRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(examStructureService.createStage(request));
    }

    @GetMapping("/api/exam-stages")
    public List<ExamStageResponse> listStages(@RequestParam(required = false) String examCode) {
        return examStructureService.listStages(examCode);
    }

    @PutMapping("/api/exam-stages/{id}")
    public ExamStageResponse updateStage(@PathVariable UUID id, @Valid @RequestBody ExamStageRequest request) {
        return examStructureService.updateStage(id, request);
    }

    @DeleteMapping("/api/exam-stages/{id}")
    public ResponseEntity<Void> deleteStage(@PathVariable UUID id) {
        examStructureService.deleteStage(id);
        return ResponseEntity.noContent().build();
    }

    /* ---------------------------------------------------------------------- Papers */

    @PostMapping("/api/exam-papers")
    public ResponseEntity<ExamPaperResponse> createPaper(@Valid @RequestBody ExamPaperRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(examStructureService.createPaper(request));
    }

    @GetMapping("/api/exam-papers")
    public List<ExamPaperResponse> listPapers(@RequestParam(required = false) UUID stageId) {
        return examStructureService.listPapers(stageId);
    }

    @PutMapping("/api/exam-papers/{id}")
    public ExamPaperResponse updatePaper(@PathVariable UUID id, @Valid @RequestBody ExamPaperRequest request) {
        return examStructureService.updatePaper(id, request);
    }

    @DeleteMapping("/api/exam-papers/{id}")
    public ResponseEntity<Void> deletePaper(@PathVariable UUID id) {
        examStructureService.deletePaper(id);
        return ResponseEntity.noContent().build();
    }

    /* -------------------------------------------------------------------- Sections */

    @PostMapping("/api/paper-sections")
    public ResponseEntity<PaperSectionResponse> createSection(@Valid @RequestBody PaperSectionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(examStructureService.createSection(request));
    }

    @GetMapping("/api/paper-sections")
    public List<PaperSectionResponse> listSections(@RequestParam(required = false) UUID paperId) {
        return examStructureService.listSections(paperId);
    }

    @PutMapping("/api/paper-sections/{id}")
    public PaperSectionResponse updateSection(@PathVariable UUID id, @Valid @RequestBody PaperSectionRequest request) {
        return examStructureService.updateSection(id, request);
    }

    @DeleteMapping("/api/paper-sections/{id}")
    public ResponseEntity<Void> deleteSection(@PathVariable UUID id) {
        examStructureService.deleteSection(id);
        return ResponseEntity.noContent().build();
    }
}
