package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ExamRequest;
import com.sarkaritaiyaari.backend.dto.ExamResponse;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.SyllabusRequest;
import com.sarkaritaiyaari.backend.service.ExamService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/exams")
public class ExamController {

    private final ExamService examService;

    public ExamController(ExamService examService) {
        this.examService = examService;
    }

    @PostMapping
    public ResponseEntity<ExamResponse> create(@Valid @RequestBody ExamRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(examService.create(request));
    }

    @GetMapping("/{code}")
    public ExamResponse get(@PathVariable String code) {
        return examService.get(code);
    }

    /** Active-only — this is the mobile-facing list (Home screen exam cards). */
    @GetMapping
    public List<ExamResponse> listActive() {
        return examService.listActive();
    }

    /** Everything, including inactive exams — for the admin management screen. */
    @GetMapping("/all")
    public List<ExamResponse> listAll() {
        return examService.listAll();
    }

    /** The subjects this exam's syllabus covers — one subject can belong to many exams. */
    @GetMapping("/{code}/subjects")
    public List<SubjectResponse> getSyllabus(@PathVariable String code) {
        return examService.getSyllabus(code);
    }

    /** Replaces the syllabus with exactly the subjects supplied. */
    @PutMapping("/{code}/subjects")
    public List<SubjectResponse> setSyllabus(@PathVariable String code, @Valid @RequestBody SyllabusRequest request) {
        return examService.setSyllabus(code, request.getSubjectIds());
    }

    @PutMapping("/{code}")
    public ExamResponse update(@PathVariable String code, @Valid @RequestBody ExamRequest request) {
        return examService.update(code, request);
    }

    @DeleteMapping("/{code}")
    public ResponseEntity<Void> delete(@PathVariable String code) {
        examService.delete(code);
        return ResponseEntity.noContent().build();
    }
}
