package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.entity.BlueprintSource;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.LessonBlueprint;
import com.sarkaritaiyaari.backend.entity.TeachingLevel;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.LessonBlueprintService;
import org.springframework.http.HttpHeaders;
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
import java.util.Map;
import java.util.UUID;

/** Admin CRUD and review for teaching blueprints. */
@RestController
@RequestMapping("/api/admin/lesson-blueprints")
public class LessonBlueprintAdminController {

    private final LessonBlueprintService blueprints;
    private final AuthService authService;

    public LessonBlueprintAdminController(LessonBlueprintService blueprints, AuthService authService) {
        this.blueprints = blueprints;
        this.authService = authService;
    }

    @GetMapping
    public List<LessonBlueprint> list(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireReviewer(authorization);
        return blueprints.list();
    }

    @GetMapping("/{id}")
    public LessonBlueprint get(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                               @PathVariable UUID id) {
        authService.requireReviewer(authorization);
        return blueprints.get(id);
    }

    @PostMapping
    public LessonBlueprint create(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                  @RequestBody CreateRequest body) {
        authService.requireAdmin(authorization);
        return blueprints.create(
                body.topicId(),
                body.questionId(),
                body.language() == null ? "en" : body.language(),
                body.teachingLevel() == null ? TeachingLevel.STANDARD : body.teachingLevel(),
                body.source() == null ? BlueprintSource.IMPORTED : body.source(),
                body.payload());
    }

    @PutMapping("/{id}/publish")
    public LessonBlueprint publish(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                   @PathVariable UUID id) {
        User reviewer = authService.requireReviewer(authorization);
        return blueprints.setContentStatus(id, ContentStatus.PUBLISHED, null, reviewer.getEmail());
    }

    @PutMapping("/{id}/unpublish")
    public LessonBlueprint unpublish(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                     @PathVariable UUID id) {
        User reviewer = authService.requireReviewer(authorization);
        return blueprints.setContentStatus(id, ContentStatus.DRAFT, null, reviewer.getEmail());
    }

    @DeleteMapping("/{id}")
    public void delete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                       @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        blueprints.delete(id);
    }

    /** {@code payload} is the studio Lesson JSON, pasted or uploaded verbatim. */
    public record CreateRequest(
            UUID topicId,
            UUID questionId,
            String language,
            TeachingLevel teachingLevel,
            BlueprintSource source,
            Map<String, Object> payload) {
    }
}
