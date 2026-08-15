package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.BulkDeleteRequest;
import com.sarkaritaiyaari.backend.dto.BulkDeleteResponse;
import com.sarkaritaiyaari.backend.dto.BulkImportRequest;
import com.sarkaritaiyaari.backend.dto.BulkImportResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.UpsertTranslationRequest;
import com.sarkaritaiyaari.backend.service.QuestionService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/questions")
public class QuestionController {

    private final QuestionService questionService;

    public QuestionController(QuestionService questionService) {
        this.questionService = questionService;
    }

    @PostMapping
    public ResponseEntity<QuestionResponse> create(@Valid @RequestBody CreateQuestionRequest request) {
        QuestionResponse created = questionService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/{id}")
    public QuestionResponse get(@PathVariable UUID id) {
        return questionService.get(id);
    }

    @GetMapping
    public Page<QuestionResponse> list(Pageable pageable,
                                        @RequestParam(required = false) String examCode,
                                        @RequestParam(required = false) UUID subjectId,
                                        @RequestParam(required = false) UUID topicId,
                                        @RequestParam(required = false) String difficulty) {
        return questionService.list(pageable, examCode, subjectId, topicId, difficulty);
    }

    /** Always syncs the entire question bank (paginated by updatedAt) — clients filter by exam locally. */
    @GetMapping("/sync")
    public Page<QuestionResponse> sync(@RequestParam(required = false) String since,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "500") int size) {
        return questionService.sync(since, page, size);
    }

    @PutMapping("/{id}")
    public QuestionResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateQuestionRequest request) {
        return questionService.update(id, request);
    }

    @PutMapping("/{id}/translations/{lang}")
    public QuestionResponse upsertTranslation(@PathVariable UUID id,
                                               @PathVariable String lang,
                                               @Valid @RequestBody UpsertTranslationRequest request) {
        return questionService.upsertTranslation(id, lang, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        questionService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/bulk-import")
    public ResponseEntity<BulkImportResponse> bulkImport(@Valid @RequestBody BulkImportRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(questionService.bulkImport(request.getQuestions()));
    }

    @PostMapping("/bulk-delete")
    public BulkDeleteResponse bulkDelete(@Valid @RequestBody BulkDeleteRequest request) {
        int count = questionService.bulkDelete(request.getIds());
        return new BulkDeleteResponse(count);
    }
}
