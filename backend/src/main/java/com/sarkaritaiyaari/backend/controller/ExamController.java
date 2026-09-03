package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ExamDiscoveryDtos.PagedExamCards;
import com.sarkaritaiyaari.backend.dto.ExamRequest;
import com.sarkaritaiyaari.backend.dto.ExamResponse;
import com.sarkaritaiyaari.backend.dto.ExamTopicResponse;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.SyllabusRequest;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.ExamDiscoveryService;
import com.sarkaritaiyaari.backend.service.ExamDiscoveryService.SortOption;
import com.sarkaritaiyaari.backend.service.ExamService;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/exams")
public class ExamController {

    private final ExamService examService;
    private final ExamDiscoveryService examDiscoveryService;
    private final AuthService authService;

    public ExamController(ExamService examService, ExamDiscoveryService examDiscoveryService,
                           AuthService authService) {
        this.examService = examService;
        this.examDiscoveryService = examDiscoveryService;
        this.authService = authService;
    }

    /**
     * The Exams module's own listing (spec §5-15) — every active exam as a card, with
     * pagination/sort/filter, distinct from {@link #listActive} (Home's plain list) and
     * {@link #listAll} (admin). Deliberately public: the same "active exams are public"
     * rule {@link #listActive} already follows.
     */
    @GetMapping("/discover")
    public PagedExamCards discover(@RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "20") int size,
                                    @RequestParam(required = false) String sort,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(required = false) String category) {
        SortOption sortOption = sort == null ? null : SortOption.valueOf(sort.trim().toUpperCase(Locale.ROOT));
        return examDiscoveryService.discover(page, size, sortOption, status, category);
    }

    @PostMapping
    public ResponseEntity<ExamResponse> create(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                @Valid @RequestBody ExamRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examService.create(request));
    }

    @GetMapping("/{code}")
    public ExamResponse get(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable String code) {
        authService.requireAdmin(authorization);
        return examService.get(code);
    }

    /** Active-only — this is the mobile-facing list (Home screen exam cards). Deliberately public. */
    @GetMapping
    public List<ExamResponse> listActive() {
        return examService.listActive();
    }

    /** Everything, including inactive exams — for the admin management screen. */
    @GetMapping("/all")
    public List<ExamResponse> listAll(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return examService.listAll();
    }

    /** The subjects this exam's syllabus covers — one subject can belong to many exams. */
    @GetMapping("/{code}/subjects")
    public List<SubjectResponse> getSyllabus(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                              @PathVariable String code) {
        authService.requireAdmin(authorization);
        return examService.getSyllabus(code);
    }

    /** Replaces the syllabus with exactly the subjects supplied. */
    @PutMapping("/{code}/subjects")
    public List<SubjectResponse> setSyllabus(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                              @PathVariable String code, @Valid @RequestBody SyllabusRequest request) {
        authService.requireAdmin(authorization);
        return examService.setSyllabus(code, request.getSubjectIds());
    }

    /**
     * The topics this exam covers, with the admin's curated weightage. Finer-grained than
     * {@code /subjects} — see preparation-os-requirements.md §18.2 for why subject
     * granularity wasn't enough. Admin-only for now: no mobile screen consumes it yet, and
     * exposing an unfinished curation surface publicly would be premature.
     */
    @GetMapping("/{code}/topics")
    public List<ExamTopicResponse> getTopics(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                             @PathVariable String code) {
        authService.requireAdmin(authorization);
        return examService.getTopics(code);
    }

    /** Replaces the topic map with exactly the topics supplied. */
    @PutMapping("/{code}/topics")
    public List<ExamTopicResponse> setTopics(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                             @PathVariable String code, @Valid @RequestBody ExamTopicsRequest request) {
        authService.requireAdmin(authorization);
        return examService.setTopics(code, request);
    }

    @PutMapping("/{code}")
    public ExamResponse update(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                @PathVariable String code, @Valid @RequestBody ExamRequest request) {
        authService.requireAdmin(authorization);
        return examService.update(code, request);
    }

    @DeleteMapping("/{code}")
    public ResponseEntity<Void> delete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable String code) {
        authService.requireAdmin(authorization);
        examService.delete(code);
        return ResponseEntity.noContent().build();
    }
}
