package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.CreateQuestionMediaRequest;
import com.sarkaritaiyaari.backend.dto.QuestionMediaResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.QuestionMediaService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Attaches an already-uploaded (via {@code POST /api/images}) file to a question or group
 * (TASK-2301 Phase P3). Admin-only, like every other content-authoring endpoint — the file
 * itself is uploaded separately; this only records ownership.
 */
@RestController
@RequestMapping("/api/question-media")
public class QuestionMediaController {

    private final QuestionMediaService mediaService;
    private final AuthService authService;

    public QuestionMediaController(QuestionMediaService mediaService, AuthService authService) {
        this.mediaService = mediaService;
        this.authService = authService;
    }

    @PostMapping
    public ResponseEntity<QuestionMediaResponse> create(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                          @Valid @RequestBody CreateQuestionMediaRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(mediaService.create(request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        mediaService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
