package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.DifficultyLevelRequest;
import com.sarkaritaiyaari.backend.dto.DifficultyLevelResponse;
import com.sarkaritaiyaari.backend.service.DifficultyLevelService;
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
@RequestMapping("/api/difficulty-levels")
public class DifficultyLevelController {

    private final DifficultyLevelService difficultyLevelService;

    public DifficultyLevelController(DifficultyLevelService difficultyLevelService) {
        this.difficultyLevelService = difficultyLevelService;
    }

    @PostMapping
    public ResponseEntity<DifficultyLevelResponse> create(@Valid @RequestBody DifficultyLevelRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(difficultyLevelService.create(request));
    }

    /** Active-only — the mobile-facing list. */
    @GetMapping
    public List<DifficultyLevelResponse> listActive() {
        return difficultyLevelService.listActive();
    }

    /** Everything, including inactive levels — for the admin management screen. */
    @GetMapping("/all")
    public List<DifficultyLevelResponse> listAll() {
        return difficultyLevelService.listAll();
    }

    @PutMapping("/{code}")
    public DifficultyLevelResponse update(@PathVariable String code, @Valid @RequestBody DifficultyLevelRequest request) {
        return difficultyLevelService.update(code, request);
    }

    @DeleteMapping("/{code}")
    public ResponseEntity<Void> delete(@PathVariable String code) {
        difficultyLevelService.delete(code);
        return ResponseEntity.noContent().build();
    }
}
