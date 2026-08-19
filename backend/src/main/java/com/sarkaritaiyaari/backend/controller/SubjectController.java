package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.SubjectService;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/subjects")
public class SubjectController {

    private final SubjectService subjectService;
    private final AuthService authService;

    public SubjectController(SubjectService subjectService, AuthService authService) {
        this.subjectService = subjectService;
        this.authService = authService;
    }

    @PostMapping
    public ResponseEntity<SubjectResponse> create(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                   @Valid @RequestBody SubjectRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(subjectService.create(request));
    }

    @GetMapping("/{id}")
    public SubjectResponse get(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        return subjectService.get(id);
    }

    /** Global list, shared by every exam. Deliberately public — this is mobile's sync source. */
    @GetMapping
    public List<SubjectResponse> list() {
        return subjectService.list();
    }

    @PutMapping("/{id}")
    public SubjectResponse update(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                   @PathVariable UUID id, @Valid @RequestBody SubjectRequest request) {
        authService.requireAdmin(authorization);
        return subjectService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        subjectService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
