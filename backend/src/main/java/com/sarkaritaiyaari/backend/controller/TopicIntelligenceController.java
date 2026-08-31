package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.TopicIntelligenceDtos;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.TopicIntelligenceService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Computed topic intelligence for one exam (Epic L / TICKET-2106, 2107).
 *
 * <p>Mounted under {@code /api/exams/{code}/...} rather than a top-level
 * {@code /api/topic-intelligence}: every one of these is meaningless without an exam, and
 * the path should say so.
 */
@RestController
@RequestMapping("/api/exams/{examCode}")
public class TopicIntelligenceController {

    private final AuthService authService;
    private final TopicIntelligenceService topicIntelligence;

    public TopicIntelligenceController(AuthService authService, TopicIntelligenceService topicIntelligence) {
        this.authService = authService;
        this.topicIntelligence = topicIntelligence;
    }

    /**
     * The ranked topic list with trend, weightage and priority.
     *
     * <p>Deliberately public — unauthenticated, like {@code GET /api/topics} and
     * {@code /api/exam-structures}. This is mobile's sync source for the Practice screen's
     * priority badges, and it exposes nothing student-specific: every field is derived from
     * the published question bank and the admin's own curation.
     */
    @GetMapping("/topic-intelligence")
    public TopicIntelligenceDtos.ExamTopicIntelligenceResponse get(@PathVariable String examCode) {
        return topicIntelligence.getForExam(examCode);
    }

    /**
     * Re-runs the computation for this exam.
     *
     * <p>Admin-triggered rather than scheduled. The inputs only change when an admin tags
     * PYQ years or edits the topic map, so a cron job would spend almost all its runs
     * recomputing identical numbers; and on Cloud Run an unprompted full scan at startup is
     * an unpleasant surprise. A real scheduler belongs here once PYQ ingestion is automated,
     * which §18.5 explicitly defers.
     */
    @PostMapping("/topic-intelligence/recompute")
    public TopicIntelligenceDtos.RecomputeResponse recompute(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable String examCode) {
        authService.requireAdmin(authorization);
        return topicIntelligence.recompute(examCode);
    }

    /**
     * Sets or clears the admin priority override for one topic (TICKET-2107).
     *
     * <p>A null {@code priority} clears the override and hands ranking back to the computed
     * value. The computed value itself is never touched by this endpoint — that separation is
     * the whole point of the ticket.
     */
    @PutMapping("/topics/{topicId}/priority-override")
    public TopicIntelligenceDtos.TopicIntelligence setOverride(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable String examCode,
            @PathVariable UUID topicId,
            @Valid @RequestBody TopicIntelligenceDtos.OverrideRequest request) {
        User admin = authService.requireAdmin(authorization);
        return topicIntelligence.setOverride(examCode, topicId, request, admin);
    }
}
