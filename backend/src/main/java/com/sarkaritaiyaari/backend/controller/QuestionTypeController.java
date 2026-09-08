package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.QuestionTypeResponse;
import com.sarkaritaiyaari.backend.service.QuestionTypeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Deliberately public, like {@code /api/difficulty-levels} — a signed-out client needs this
 * to know which question types it can render before deciding what to ask for on sync.
 */
@RestController
@RequestMapping("/api/question-types")
public class QuestionTypeController {

    private final QuestionTypeService questionTypeService;

    public QuestionTypeController(QuestionTypeService questionTypeService) {
        this.questionTypeService = questionTypeService;
    }

    @GetMapping
    public List<QuestionTypeResponse> listAll() {
        return questionTypeService.listAll();
    }
}
