package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.TopicService;
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
import java.util.UUID;

@RestController
@RequestMapping("/api/topics")
public class TopicController {

    private final TopicService topicService;
    private final AuthService authService;

    public TopicController(TopicService topicService, AuthService authService) {
        this.topicService = topicService;
        this.authService = authService;
    }

    @PostMapping
    public ResponseEntity<TopicResponse> create(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                 @Valid @RequestBody TopicRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(topicService.create(request));
    }

    @GetMapping("/{id}")
    public TopicResponse get(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        return topicService.get(id);
    }

    /** Deliberately public — this (optionally filtered by subjectId) is mobile's sync source. */
    @GetMapping
    public List<TopicResponse> list(@RequestParam(required = false) UUID subjectId) {
        return topicService.list(subjectId);
    }

    @PutMapping("/{id}")
    public TopicResponse update(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                 @PathVariable UUID id, @Valid @RequestBody TopicRequest request) {
        authService.requireAdmin(authorization);
        return topicService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        topicService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
