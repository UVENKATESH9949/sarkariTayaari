package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.ai.content.AiContentMapper;
import com.sarkaritaiyaari.backend.ai.content.AiContentReviewService;
import com.sarkaritaiyaari.backend.dto.AiContentDtos.AiContentSyncEntry;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * TASK-2701 Phase 3 — the public half of {@code ai_content}. Deliberately a separate controller
 * from {@link com.sarkaritaiyaari.backend.controller.AiContentController} rather than a method on
 * it: that one lives under {@code /api/admin/ai-content} and every method requires an admin or
 * reviewer token; this single endpoint is the reference-content feed a signed-out device consumes
 * exactly like {@code /api/questions/sync} — no auth check at all, matching this backend's
 * existing convention for public content-sync surfaces (see {@code api/README.md}'s own stated
 * rule that this split is deliberate, not an oversight).
 *
 * No generation, no review action, and no non-PUBLISHED payload is ever reachable here — see
 * {@link AiContentMapper#toSyncEntry} for where that boundary is actually enforced.
 */
@RestController
@RequestMapping("/api/ai-content")
public class AiContentSyncController {

    private final AiContentReviewService reviewService;
    private final AiContentMapper mapper;

    public AiContentSyncController(AiContentReviewService reviewService, AiContentMapper mapper) {
        this.reviewService = reviewService;
        this.mapper = mapper;
    }

    @GetMapping("/sync")
    public List<AiContentSyncEntry> sync(@RequestParam(required = false) String since) {
        OffsetDateTime sinceTimestamp = AiContentReviewService.parseSince(since);
        return reviewService.findUpdatedSince(sinceTimestamp).stream().map(mapper::toSyncEntry).toList();
    }
}
