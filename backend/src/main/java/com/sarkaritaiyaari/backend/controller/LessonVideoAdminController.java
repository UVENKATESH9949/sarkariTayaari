package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.LessonVideoDtos.AdminVideo;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.TeachingLevel;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.VideoQuality;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.LessonVideoService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.UUID;

/**
 * Admin management of lesson videos.
 *
 * <p>Transitions mirror the shape {@code ExamGuideAdminController} and {@code AiContentController}
 * already use: separate submit-for-review / publish / unpublish endpoints rather than one
 * set-status call, so each can have its own authorisation and its own validation. Authoring and
 * deletion are ADMIN; approving is REVIEWER, of which ADMIN is a superset.
 */
@RestController
@RequestMapping("/api/admin/lesson-videos")
public class LessonVideoAdminController {

    private final LessonVideoService videos;
    private final AuthService authService;

    public LessonVideoAdminController(LessonVideoService videos, AuthService authService) {
        this.videos = videos;
        this.authService = authService;
    }

    @GetMapping
    public List<AdminVideo> list(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireReviewer(authorization);
        return videos.listForAdmin();
    }

    /**
     * Uploads an already-rendered MP4 and links it to a topic or a question.
     *
     * <p>This is how a video produced by the AI Video Studio enters the product. The studio has no
     * API and renders through its own CLI, so an upload is the integration point, not a call.
     */
    @PostMapping
    public AdminVideo upload(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                             @RequestParam(required = false) UUID topicId,
                             @RequestParam(required = false) UUID questionId,
                             @RequestParam(required = false) UUID blueprintId,
                             @RequestParam(defaultValue = "en") String language,
                             @RequestParam(defaultValue = "STANDARD") TeachingLevel level,
                             @RequestParam(defaultValue = "STANDARD") VideoQuality quality,
                             @RequestParam(defaultValue = "false") boolean premium,
                             @RequestParam(required = false) Integer durationSeconds,
                             @RequestParam("file") MultipartFile file) {
        User admin = authService.requireAdmin(authorization);
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the uploaded video.", e);
        }
        return videos.upload(topicId, questionId, blueprintId, language, level, quality,
                premium, durationSeconds, bytes, file.getContentType(), admin.getEmail());
    }

    @PutMapping("/{videoId}/submit-for-review")
    public AdminVideo submitForReview(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                      @PathVariable UUID videoId) {
        User admin = authService.requireAdmin(authorization);
        return videos.setContentStatus(videoId, ContentStatus.REVIEW, null, admin.getEmail());
    }

    @PutMapping("/{videoId}/publish")
    public AdminVideo publish(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                              @PathVariable UUID videoId) {
        User reviewer = authService.requireReviewer(authorization);
        return videos.setContentStatus(videoId, ContentStatus.PUBLISHED, null, reviewer.getEmail());
    }

    @PutMapping("/{videoId}/unpublish")
    public AdminVideo unpublish(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                @PathVariable UUID videoId) {
        User reviewer = authService.requireReviewer(authorization);
        return videos.setContentStatus(videoId, ContentStatus.DRAFT, null, reviewer.getEmail());
    }

    @PutMapping("/{videoId}/reject")
    public AdminVideo reject(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                             @PathVariable UUID videoId,
                             @RequestBody RejectRequest body) {
        User reviewer = authService.requireReviewer(authorization);
        return videos.setContentStatus(videoId, ContentStatus.DRAFT, body.reason(), reviewer.getEmail());
    }

    @DeleteMapping("/{videoId}")
    public void delete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                       @PathVariable UUID videoId) {
        User admin = authService.requireAdmin(authorization);
        videos.delete(videoId, admin.getEmail());
    }

    public record RejectRequest(String reason) {
    }
}
