package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.CreateQuestionGroupRequest;
import com.sarkaritaiyaari.backend.dto.QuestionGroupResponse;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionGroupRequest;
import com.sarkaritaiyaari.backend.dto.UpsertQuestionGroupTranslationRequest;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.QuestionGroupService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

import java.util.UUID;

/** Shared passage/dataset groups (TASK-2301 Phase P3) — mirrors {@code QuestionController}'s own shape. */
@RestController
@RequestMapping("/api/question-groups")
public class QuestionGroupController {

    private final QuestionGroupService groupService;
    private final AuthService authService;

    public QuestionGroupController(QuestionGroupService groupService, AuthService authService) {
        this.groupService = groupService;
        this.authService = authService;
    }

    @PostMapping
    public ResponseEntity<QuestionGroupResponse> create(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                          @Valid @RequestBody CreateQuestionGroupRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(groupService.create(request));
    }

    @GetMapping("/{id}")
    public QuestionGroupResponse get(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        return groupService.get(id);
    }

    @GetMapping
    public Page<QuestionGroupResponse> list(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, Pageable pageable) {
        authService.requireAdmin(authorization);
        return groupService.list(pageable);
    }

    /**
     * Groups sync on their own paged endpoint, deliberately not embedded per question — see
     * the architecture proposal's own note: embedding would re-download a shared passage once
     * per child question on every sync page. Deliberately public, same reasoning as
     * {@code QuestionController.sync} — a signed-out student's app needs this too.
     */
    @GetMapping("/sync")
    public Page<QuestionGroupResponse> sync(@RequestParam(required = false) String since,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "500") int size) {
        return groupService.sync(since, page, size);
    }

    @PutMapping("/{id}")
    public QuestionGroupResponse update(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                         @PathVariable UUID id, @Valid @RequestBody UpdateQuestionGroupRequest request) {
        authService.requireAdmin(authorization);
        return groupService.update(id, request);
    }

    @PutMapping("/{id}/translations/{lang}")
    public QuestionGroupResponse upsertTranslation(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                     @PathVariable UUID id,
                                                     @PathVariable String lang,
                                                     @Valid @RequestBody UpsertQuestionGroupTranslationRequest request) {
        authService.requireAdmin(authorization);
        return groupService.upsertTranslation(id, lang, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        groupService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
