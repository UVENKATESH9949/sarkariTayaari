package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.CreateQuestionOccurrenceRequest;
import com.sarkaritaiyaari.backend.dto.QuestionOccurrenceResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.QuestionOccurrenceService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * TASK-2501 Phase 1 -- admin-only. A question can now legitimately have more than one exam
 * appearance; this is the surface that adds/removes one.
 */
@RestController
@RequestMapping("/api/questions/{questionId}/occurrences")
public class QuestionOccurrenceController {

    private final AuthService authService;
    private final QuestionOccurrenceService occurrenceService;

    public QuestionOccurrenceController(AuthService authService, QuestionOccurrenceService occurrenceService) {
        this.authService = authService;
        this.occurrenceService = occurrenceService;
    }

    @PostMapping
    public ResponseEntity<QuestionOccurrenceResponse> add(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID questionId,
            @RequestBody CreateQuestionOccurrenceRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(occurrenceService.add(questionId, request));
    }

    @GetMapping
    public List<QuestionOccurrenceResponse> list(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID questionId) {
        authService.requireAdmin(authorization);
        return occurrenceService.list(questionId);
    }

    @DeleteMapping("/{occurrenceId}")
    public ResponseEntity<Void> delete(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID questionId,
            @PathVariable UUID occurrenceId) {
        authService.requireAdmin(authorization);
        occurrenceService.delete(questionId, occurrenceId);
        return ResponseEntity.noContent().build();
    }
}
