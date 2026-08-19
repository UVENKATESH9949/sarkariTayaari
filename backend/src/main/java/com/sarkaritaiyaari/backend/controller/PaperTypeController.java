package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.PaperTypeRequest;
import com.sarkaritaiyaari.backend.dto.PaperTypeResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.PaperTypeService;
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

@RestController
@RequestMapping("/api/paper-types")
public class PaperTypeController {

    private final PaperTypeService paperTypeService;
    private final AuthService authService;

    public PaperTypeController(PaperTypeService paperTypeService, AuthService authService) {
        this.paperTypeService = paperTypeService;
        this.authService = authService;
    }

    @PostMapping
    public ResponseEntity<PaperTypeResponse> create(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                     @Valid @RequestBody PaperTypeRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(paperTypeService.create(request));
    }

    /** Deliberately public — this is mobile's sync source; there's no active-only split here. */
    @GetMapping
    public List<PaperTypeResponse> list() {
        return paperTypeService.list();
    }

    @PutMapping("/{code}")
    public PaperTypeResponse update(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                     @PathVariable String code, @Valid @RequestBody PaperTypeRequest request) {
        authService.requireAdmin(authorization);
        return paperTypeService.update(code, request);
    }

    @DeleteMapping("/{code}")
    public ResponseEntity<Void> delete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable String code) {
        authService.requireAdmin(authorization);
        paperTypeService.delete(code);
        return ResponseEntity.noContent().build();
    }
}
