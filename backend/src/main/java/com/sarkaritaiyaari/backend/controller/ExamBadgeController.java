package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ExamBadgeResponse;
import com.sarkaritaiyaari.backend.entity.ExamBadge;
import com.sarkaritaiyaari.backend.repository.ExamBadgeRepository;
import com.sarkaritaiyaari.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Read-only. The badge vocabulary is seeded content that changes rarely, so there is no
 * CRUD screen for it yet — an admin picks from this list when editing an exam, and
 * adding a new badge is a migration. Write endpoints can follow the DifficultyLevel
 * shape if that ever becomes a real need.
 */
@RestController
@RequestMapping("/api/exam-badges")
public class ExamBadgeController {

    private final ExamBadgeRepository examBadgeRepository;
    private final AuthService authService;

    public ExamBadgeController(ExamBadgeRepository examBadgeRepository, AuthService authService) {
        this.examBadgeRepository = examBadgeRepository;
        this.authService = authService;
    }

    /** Active-only — the mobile-facing list. Deliberately public. */
    @GetMapping
    public List<ExamBadgeResponse> listActive() {
        return examBadgeRepository.findByActiveTrueOrderByDisplayOrderAsc().stream()
                .map(ExamBadgeController::toResponse)
                .toList();
    }

    /** Everything, including inactive badges — for the admin exam form's dropdown. */
    @GetMapping("/all")
    public List<ExamBadgeResponse> listAll(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return examBadgeRepository.findAllByOrderByDisplayOrderAsc().stream()
                .map(ExamBadgeController::toResponse)
                .toList();
    }

    private static ExamBadgeResponse toResponse(ExamBadge badge) {
        return new ExamBadgeResponse(badge.getCode(), badge.getLabel(), badge.getDisplayOrder(),
                badge.getColor(), badge.getColorBg(), badge.isActive());
    }
}
