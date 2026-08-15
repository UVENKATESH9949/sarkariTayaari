package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.PaperTypeRequest;
import com.sarkaritaiyaari.backend.dto.PaperTypeResponse;
import com.sarkaritaiyaari.backend.service.PaperTypeService;
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
@RequestMapping("/api/paper-types")
public class PaperTypeController {

    private final PaperTypeService paperTypeService;

    public PaperTypeController(PaperTypeService paperTypeService) {
        this.paperTypeService = paperTypeService;
    }

    @PostMapping
    public ResponseEntity<PaperTypeResponse> create(@Valid @RequestBody PaperTypeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(paperTypeService.create(request));
    }

    @GetMapping
    public List<PaperTypeResponse> list() {
        return paperTypeService.list();
    }

    @PutMapping("/{code}")
    public PaperTypeResponse update(@PathVariable String code, @Valid @RequestBody PaperTypeRequest request) {
        return paperTypeService.update(code, request);
    }

    @DeleteMapping("/{code}")
    public ResponseEntity<Void> delete(@PathVariable String code) {
        paperTypeService.delete(code);
        return ResponseEntity.noContent().build();
    }
}
