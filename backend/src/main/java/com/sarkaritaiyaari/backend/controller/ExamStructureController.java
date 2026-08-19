package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ExamPaperRequest;
import com.sarkaritaiyaari.backend.dto.ExamPaperResponse;
import com.sarkaritaiyaari.backend.dto.ExamStageRequest;
import com.sarkaritaiyaari.backend.dto.ExamStageResponse;
import com.sarkaritaiyaari.backend.dto.ExamStructureResponse;
import com.sarkaritaiyaari.backend.dto.PaperSectionRequest;
import com.sarkaritaiyaari.backend.dto.PaperSectionResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.ExamStructureService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
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
    private final AuthService authService;

    public ExamStructureController(ExamStructureService examStructureService, AuthService authService) {
        this.examStructureService = examStructureService;
        this.authService = authService;
    }

    /** The whole Stage → Paper → Section → Subjects tree for one exam — the admin structure editor. */
    @GetMapping("/api/exams/{examCode}/structure")
    public ExamStructureResponse getStructure(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                               @PathVariable String examCode) {
        authService.requireAdmin(authorization);
        return examStructureService.getStructure(examCode);
    }

    /**
     * Every active exam's structure in one response — what the mobile client syncs, so it
     * makes a single request instead of one per exam. Deliberately public.
     */
    @GetMapping("/api/exam-structures")
    public List<ExamStructureResponse> getAllStructures() {
        return examStructureService.getAllActiveStructures();
    }

    /* ---------------------------------------------------------------------- Stages */

    @PostMapping("/api/exam-stages")
    public ResponseEntity<ExamStageResponse> createStage(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                          @Valid @RequestBody ExamStageRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examStructureService.createStage(request));
    }

    @GetMapping("/api/exam-stages")
    public List<ExamStageResponse> listStages(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                               @RequestParam(required = false) String examCode) {
        authService.requireAdmin(authorization);
        return examStructureService.listStages(examCode);
    }

    @PutMapping("/api/exam-stages/{id}")
    public ExamStageResponse updateStage(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                          @PathVariable UUID id, @Valid @RequestBody ExamStageRequest request) {
        authService.requireAdmin(authorization);
        return examStructureService.updateStage(id, request);
    }

    @DeleteMapping("/api/exam-stages/{id}")
    public ResponseEntity<Void> deleteStage(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examStructureService.deleteStage(id);
        return ResponseEntity.noContent().build();
    }

    /* ---------------------------------------------------------------------- Papers */

    @PostMapping("/api/exam-papers")
    public ResponseEntity<ExamPaperResponse> createPaper(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                          @Valid @RequestBody ExamPaperRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examStructureService.createPaper(request));
    }

    @GetMapping("/api/exam-papers")
    public List<ExamPaperResponse> listPapers(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                               @RequestParam(required = false) UUID stageId) {
        authService.requireAdmin(authorization);
        return examStructureService.listPapers(stageId);
    }

    @PutMapping("/api/exam-papers/{id}")
    public ExamPaperResponse updatePaper(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                          @PathVariable UUID id, @Valid @RequestBody ExamPaperRequest request) {
        authService.requireAdmin(authorization);
        return examStructureService.updatePaper(id, request);
    }

    @DeleteMapping("/api/exam-papers/{id}")
    public ResponseEntity<Void> deletePaper(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examStructureService.deletePaper(id);
        return ResponseEntity.noContent().build();
    }

    /* -------------------------------------------------------------------- Sections */

    @PostMapping("/api/paper-sections")
    public ResponseEntity<PaperSectionResponse> createSection(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                               @Valid @RequestBody PaperSectionRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examStructureService.createSection(request));
    }

    @GetMapping("/api/paper-sections")
    public List<PaperSectionResponse> listSections(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                    @RequestParam(required = false) UUID paperId) {
        authService.requireAdmin(authorization);
        return examStructureService.listSections(paperId);
    }

    @PutMapping("/api/paper-sections/{id}")
    public PaperSectionResponse updateSection(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                               @PathVariable UUID id, @Valid @RequestBody PaperSectionRequest request) {
        authService.requireAdmin(authorization);
        return examStructureService.updateSection(id, request);
    }

    @DeleteMapping("/api/paper-sections/{id}")
    public ResponseEntity<Void> deleteSection(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examStructureService.deleteSection(id);
        return ResponseEntity.noContent().build();
    }
}
