package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.TopicIntelligenceDtos;
import com.sarkaritaiyaari.backend.entity.QuestionDuplicate;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.QuestionDuplicateQueryService;
import com.sarkaritaiyaari.backend.service.DuplicateDetectionService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * The duplicate review queue (Epic L / TICKET-2109). Admin-only throughout — these are
 * content-management operations over the whole bank, not anything a student reads.
 */
@RestController
@RequestMapping("/api/question-duplicates")
public class QuestionDuplicateController {

    /** Bounded so a first backfill on ~37,900 rows cannot produce an unbounded write burst. */
    private static final int MAX_BACKFILL_LIMIT = 5000;

    private final AuthService authService;
    private final DuplicateDetectionService detection;
    private final QuestionDuplicateQueryService query;

    public QuestionDuplicateController(AuthService authService,
                                        DuplicateDetectionService detection,
                                        QuestionDuplicateQueryService query) {
        this.authService = authService;
        this.detection = detection;
        this.query = query;
    }

    /** Pairs awaiting review, oldest detection first so nothing sits at the bottom forever. */
    @GetMapping
    public Page<TopicIntelligenceDtos.DuplicatePair> listUnresolved(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        authService.requireAdmin(authorization);
        return query.listUnresolved(page, size);
    }

    /**
     * Both numbers the queue screen needs: how many pairs await review, and how many fingerprint
     * groups a full scan would find. The second is what makes "Scan whole bank" an informed click
     * rather than a leap.
     */
    @GetMapping("/count")
    public Map<String, Long> countUnresolved(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return Map.of(
                "unresolved", query.countUnresolved(),
                "potentialGroups", detection.countPotentialDuplicates());
    }

    /**
     * A dry-run check for the Bulk Import screen: does this text already exist in the bank?
     *
     * <p>POST rather than GET because the question text is the parameter, and full question
     * text does not belong in a URL — it blows past practical query-string limits and lands
     * in every access log verbatim.
     */
    @PostMapping("/check")
    public Map<String, Object> check(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                      @RequestBody Map<String, String> body) {
        authService.requireAdmin(authorization);
        String text = body.get("questionText");
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("questionText is required");
        }
        var matches = detection.findExistingMatches(text);
        return Map.of("matchCount", matches.size(), "matches", matches);
    }

    /** Marks a pair reviewed. Body: {"resolution": "DUPLICATE" | "NOT_DUPLICATE"}. */
    @PutMapping("/{questionId}/{duplicateOfQuestionId}")
    public ResponseEntity<Void> resolve(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID questionId,
            @PathVariable UUID duplicateOfQuestionId,
            @Valid @RequestBody TopicIntelligenceDtos.DuplicateResolutionRequest request) {
        authService.requireAdmin(authorization);

        QuestionDuplicate.Resolution resolution;
        try {
            resolution = QuestionDuplicate.Resolution
                    .valueOf(request.getResolution().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            // Named values rather than the Java type name, which means nothing to whoever
            // is reading the error in the admin console.
            throw new IllegalArgumentException("resolution must be DUPLICATE or NOT_DUPLICATE");
        }
        detection.resolve(questionId, duplicateOfQuestionId, resolution);
        return ResponseEntity.noContent().build();
    }

    /**
     * Re-runs detection across the whole bank.
     *
     * <p>Needed because V13 backfilled fingerprints onto ~37,900 rows that had never been
     * compared with each other — including the ~35,700 templated load-test questions, where
     * genuine collisions are expected. Explicitly triggered, never automatic: it is a full
     * table scan, and doing it on every boot would be a surprise.
     */
    @PostMapping("/backfill")
    public Map<String, Integer> backfill(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                          @RequestParam(defaultValue = "1000") int limit) {
        authService.requireAdmin(authorization);
        int clamped = Math.min(Math.max(limit, 1), MAX_BACKFILL_LIMIT);
        return Map.of("edgesRecorded", detection.backfillDetection(clamped));
    }
}
