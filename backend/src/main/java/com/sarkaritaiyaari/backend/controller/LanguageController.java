package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.LanguageRequest;
import com.sarkaritaiyaari.backend.dto.LanguageResponse;
import com.sarkaritaiyaari.backend.service.LanguageService;
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
@RequestMapping("/api/languages")
public class LanguageController {

    private final LanguageService languageService;

    public LanguageController(LanguageService languageService) {
        this.languageService = languageService;
    }

    @PostMapping
    public ResponseEntity<LanguageResponse> create(@Valid @RequestBody LanguageRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(languageService.create(request));
    }

    /** Active-only — this is the mobile-facing list. */
    @GetMapping
    public List<LanguageResponse> listActive() {
        return languageService.listActive();
    }

    /** Everything, including inactive languages — for the admin management screen. */
    @GetMapping("/all")
    public List<LanguageResponse> listAll() {
        return languageService.listAll();
    }

    @PutMapping("/{code}")
    public LanguageResponse update(@PathVariable String code, @Valid @RequestBody LanguageRequest request) {
        return languageService.update(code, request);
    }

    @DeleteMapping("/{code}")
    public ResponseEntity<Void> delete(@PathVariable String code) {
        languageService.delete(code);
        return ResponseEntity.noContent().build();
    }
}
