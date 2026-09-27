package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.LessonVideoDtos.VideoAvailability;
import com.sarkaritaiyaari.backend.entity.TeachingLevel;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.VideoQuality;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.LessonVideoService;
import com.sarkaritaiyaari.backend.video.StoredVideo;
import com.sarkaritaiyaari.backend.video.VideoPlayback;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Student-facing lesson video reads.
 *
 * <p>Every endpoint here requires a signed-in user. That is a departure from the rest of the
 * content-sync surface, which is deliberately public so a signed-out device can sync questions
 * (ADR-009) - but video is entitlement-gated and expensive to serve, and since V51 an account is
 * required to use the app at all, so there is no signed-out student to serve.
 *
 * <p>Video metadata is fetched per question or topic on demand and is deliberately NOT part of
 * reference sync. Putting it in the sync feed would make every device download metadata for every
 * video whether or not it ever watches one, which is the opposite of what this product wants on a
 * rural connection.
 */
@RestController
public class LessonVideoController {

    private final LessonVideoService videos;
    private final AuthService authService;

    public LessonVideoController(LessonVideoService videos, AuthService authService) {
        this.videos = videos;
        this.authService = authService;
    }

    @GetMapping("/api/topics/{topicId}/lesson-video")
    public VideoAvailability forTopic(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID topicId,
            @RequestParam(defaultValue = "en") String language,
            @RequestParam(defaultValue = "STANDARD") TeachingLevel level,
            @RequestParam(defaultValue = "STANDARD") VideoQuality quality) {
        User user = authService.requireUser(authorization);
        return videos.availabilityForTopic(topicId, language, level, quality, user);
    }

    @GetMapping("/api/questions/{questionId}/lesson-video")
    public VideoAvailability forQuestion(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID questionId,
            @RequestParam(defaultValue = "en") String language,
            @RequestParam(defaultValue = "STANDARD") TeachingLevel level,
            @RequestParam(defaultValue = "STANDARD") VideoQuality quality) {
        User user = authService.requireUser(authorization);
        return videos.availabilityForQuestion(questionId, language, level, quality, user);
    }

    /**
     * Hands a permitted caller the video.
     *
     * <p>One endpoint, two outcomes, because the two storage backends differ. With local storage
     * the bytes are served here, as a Resource rather than a byte array so Spring MVC supplies
     * byte-range handling - which is what lets a player seek and lets a partial download resume.
     * With an object store the caller is redirected to a signed, short-lived URL instead, because
     * proxying every 9MB lesson through this service would double egress for no benefit.
     *
     * <p>Both paths run after the same checks. A redirect is not a weaker door: the URL is only
     * minted once the caller has passed publication and entitlement.
     */
    @GetMapping("/api/lesson-videos/{videoId}/stream")
    public ResponseEntity<Resource> stream(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID videoId) {
        User user = authService.requireUser(authorization);

        return switch (videos.openForPlayback(videoId, user)) {
            case VideoPlayback.Redirect redirect -> ResponseEntity
                    .status(HttpStatus.FOUND)
                    .location(redirect.url())
                    // Never cached by a shared cache: the URL is issued per caller after an
                    // entitlement check, so a cached redirect would hand it to the next person.
                    .header(HttpHeaders.CACHE_CONTROL, "no-store")
                    .build();
            case VideoPlayback.Stream streamed -> {
                StoredVideo stored = streamed.video();
                yield ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(stored.mimeType()))
                        .contentLength(stored.sizeBytes())
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                        .header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400")
                        .body(stored.resource());
            }
        };
    }
}
