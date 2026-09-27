package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.LessonVideoDtos.AdminVideo;
import com.sarkaritaiyaari.backend.dto.LessonVideoDtos.VideoAvailability;
import com.sarkaritaiyaari.backend.entitlement.Capability;
import com.sarkaritaiyaari.backend.entitlement.EntitlementService;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.LessonVideo;
import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.TeachingLevel;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.VideoQuality;
import com.sarkaritaiyaari.backend.entity.VideoSource;
import com.sarkaritaiyaari.backend.entity.VideoStatus;
import com.sarkaritaiyaari.backend.repository.LessonVideoRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.video.StoredVideo;
import com.sarkaritaiyaari.backend.video.VideoPlayback;
import com.sarkaritaiyaari.backend.video.VideoStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads and writes lesson videos.
 *
 * <p>Question videos fall back to their topic, and that is the design rather than a shortcut.
 * The AI Video Studio produces topic lessons - every lesson it has rendered so far is scoped to a
 * topic like "Profit and Loss", and it has no concept of a question at all. Meanwhile the product
 * wants a video button on a question. Resolving a question to its own video first, then to its
 * topic lesson, means the feature is useful with the content that actually exists today and
 * silently improves the moment a question-specific video is uploaded. The response says which one
 * was found, so a client never claims a topic lesson was made for one specific question.
 *
 * <p>Nothing here is asynchronous. An admin upload produces a READY row immediately because the
 * file is already rendered elsewhere. On-demand generation would be the first thing in this
 * backend to need a real job runner.
 */
@Service
public class LessonVideoService {

    private static final Logger log = LoggerFactory.getLogger(LessonVideoService.class);

    private static final long MAX_VIDEO_BYTES = 20L * 1024 * 1024;

    private final LessonVideoRepository videos;
    private final QuestionRepository questions;
    private final TopicRepository topics;
    private final VideoStorage storage;
    private final EntitlementService entitlements;

    public LessonVideoService(LessonVideoRepository videos,
                              QuestionRepository questions,
                              TopicRepository topics,
                              VideoStorage storage,
                              EntitlementService entitlements) {
        this.videos = videos;
        this.questions = questions;
        this.topics = topics;
        this.storage = storage;
        this.entitlements = entitlements;
    }

    @Transactional(readOnly = true)
    public VideoAvailability availabilityForTopic(UUID topicId, String languageCode,
                                                  TeachingLevel level, VideoQuality quality,
                                                  User user) {
        if (!topics.existsById(topicId)) {
            throw new NoSuchElementException("Topic not found: " + topicId);
        }
        return videos.findPublishedForTopic(topicId, languageCode, level, quality)
                .stream().findFirst()
                .map(v -> describe(v, "TOPIC", user))
                .orElseGet(VideoAvailability::notAvailable);
    }

    @Transactional(readOnly = true)
    public VideoAvailability availabilityForQuestion(UUID questionId, String languageCode,
                                                     TeachingLevel level, VideoQuality quality,
                                                     User user) {
        Question question = questions.findById(questionId)
                .filter(q -> !q.isDeleted())
                .orElseThrow(() -> new NoSuchElementException("Question not found: " + questionId));

        Optional<LessonVideo> own =
                videos.findPublishedForQuestion(questionId, languageCode, level, quality)
                        .stream().findFirst();
        if (own.isPresent()) {
            return describe(own.get(), "QUESTION", user);
        }

        UUID topicId = question.getTopic() == null ? null : question.getTopic().getId();
        if (topicId == null) {
            return VideoAvailability.notAvailable();
        }
        return videos.findPublishedForTopic(topicId, languageCode, level, quality)
                .stream().findFirst()
                .map(v -> describe(v, "TOPIC", user))
                .orElseGet(VideoAvailability::notAvailable);
    }

    /**
     * Resolves a video to bytes, enforcing both approval and entitlement.
     *
     * <p>This is the only path to the file. Hiding a button in the app is not enforcement; this
     * is. Staff may open an unpublished video so it can be reviewed before release.
     */
    @Transactional(readOnly = true)
    public VideoPlayback openForPlayback(UUID videoId, User user) {
        LessonVideo video = videos.findByIdAndDeletedFalse(videoId)
                .orElseThrow(() -> new NoSuchElementException("Video not found: " + videoId));

        if (video.getContentStatus() != ContentStatus.PUBLISHED) {
            if (!isStaff(user)) {
                // Deliberately 404 rather than 403: an unpublished video should not become
                // discoverable by probing ids.
                throw new NoSuchElementException("Video not found: " + videoId);
            }
            log.info("video.playback staff preview id={} status={}", videoId, video.getContentStatus());
        }
        if (video.getStatus() != VideoStatus.READY || video.getStorageKey() == null) {
            throw new NoSuchElementException("Video has no playable file: " + videoId);
        }
        if (video.isPremium() && !entitlements.has(user, Capability.AI_VIDEO)) {
            throw new ForbiddenException("This video lesson needs a premium subscription.");
        }

        // Ask the store how it wants to deliver. An object store hands back a URL rather than
        // being proxied through this backend; the local store serves the bytes itself.
        return storage.deliveryUrl(video.getStorageKey())
                .<VideoPlayback>map(VideoPlayback.Redirect::new)
                .or(() -> storage.open(video.getStorageKey()).map(VideoPlayback.Stream::new))
                .orElseThrow(() -> new NoSuchElementException(
                        "Video file is missing from storage: " + videoId));
    }

    @Transactional
    public AdminVideo upload(UUID topicId, UUID questionId, UUID blueprintId,
                             String languageCode, TeachingLevel level, VideoQuality quality,
                             boolean premium, Integer durationSeconds,
                             byte[] bytes, String mimeType, String uploadedByEmail) {
        requireExactlyOneOwner(topicId, questionId);
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("No video file was uploaded.");
        }
        if (bytes.length > MAX_VIDEO_BYTES) {
            throw new IllegalArgumentException("Video is larger than the 20MB upload limit.");
        }
        if (!isMp4(bytes)) {
            throw new IllegalArgumentException("Uploaded file is not an MP4 video.");
        }
        if (topicId != null && !topics.existsById(topicId)) {
            throw new NoSuchElementException("Topic not found: " + topicId);
        }
        if (questionId != null && !questions.existsById(questionId)) {
            throw new NoSuchElementException("Question not found: " + questionId);
        }

        // A replacement for the same owner is a new content_version, never an overwrite: a device
        // holding the old file has no way to notice a silent swap.
        int nextVersion = videos
                .findAnyForOwner(topicId, questionId, languageCode, level).stream()
                .mapToInt(LessonVideo::getContentVersion)
                .max()
                .orElse(0) + 1;

        LessonVideo video = new LessonVideo();
        video.setTopicId(topicId);
        video.setQuestionId(questionId);
        video.setBlueprintId(blueprintId);
        video.setLanguageCode(languageCode);
        video.setTeachingLevel(level);
        video.setQuality(quality);
        video.setContentVersion(nextVersion);
        video.setSource(VideoSource.ADMIN_UPLOAD);
        video.setPremium(premium);
        video.setMimeType(mimeType == null ? "video/mp4" : mimeType);
        video.setSizeBytes((long) bytes.length);
        video.setDurationSeconds(durationSeconds);
        video.setChecksumSha256(sha256(bytes));
        video.setContentStatus(ContentStatus.DRAFT);
        video.setStatus(VideoStatus.PROCESSING);
        video.setCreatedAt(OffsetDateTime.now());
        video.setUpdatedAt(OffsetDateTime.now());
        LessonVideo saved = videos.save(video);

        String key = "lesson-videos/" + saved.getId() + "/v" + nextVersion + ".mp4";
        storage.store(key, bytes, video.getMimeType());
        saved.setStorageKey(key);
        saved.setStatus(VideoStatus.READY);
        saved.setUpdatedAt(OffsetDateTime.now());
        saved = videos.save(saved);

        log.info("video.upload id={} version={} bytes={} by={}",
                saved.getId(), nextVersion, bytes.length, uploadedByEmail);
        return AdminVideo.from(saved);
    }

    @Transactional
    public AdminVideo setContentStatus(UUID videoId, ContentStatus target, String reason,
                                       String reviewerEmail) {
        LessonVideo video = videos.findByIdAndDeletedFalse(videoId)
                .orElseThrow(() -> new NoSuchElementException("Video not found: " + videoId));

        boolean hasFile = video.getStatus() == VideoStatus.READY && video.getStorageKey() != null;
        if (target == ContentStatus.PUBLISHED && !hasFile) {
            throw new IllegalArgumentException("Only a READY video with a stored file can be published.");
        }
        if (target == ContentStatus.DRAFT
                && video.getContentStatus() == ContentStatus.REVIEW
                && (reason == null || reason.isBlank())) {
            throw new IllegalArgumentException("A reason is required when sending a video back to draft.");
        }

        video.setContentStatus(target);
        video.setRejectionReason(target == ContentStatus.DRAFT ? reason : null);
        video.setReviewedByEmail(reviewerEmail);
        video.setPublishedAt(target == ContentStatus.PUBLISHED ? OffsetDateTime.now() : null);
        video.setUpdatedAt(OffsetDateTime.now());
        log.info("video.status id={} target={} by={}", videoId, target, reviewerEmail);
        return AdminVideo.from(videos.save(video));
    }

    @Transactional
    public void delete(UUID videoId, String byEmail) {
        LessonVideo video = videos.findByIdAndDeletedFalse(videoId)
                .orElseThrow(() -> new NoSuchElementException("Video not found: " + videoId));
        video.setDeleted(true);
        video.setContentStatus(ContentStatus.DRAFT);
        video.setStatus(VideoStatus.ARCHIVED);
        video.setUpdatedAt(OffsetDateTime.now());
        videos.save(video);
        if (video.getStorageKey() != null) {
            storage.delete(video.getStorageKey());
        }
        log.info("video.delete id={} by={}", videoId, byEmail);
    }

    @Transactional(readOnly = true)
    public List<AdminVideo> listForAdmin() {
        return videos.findAllByDeletedFalseOrderByCreatedAtDesc().stream()
                .map(AdminVideo::from)
                .toList();
    }

    private VideoAvailability describe(LessonVideo v, String resolvedVia, User user) {
        boolean entitled = !v.isPremium() || entitlements.has(user, Capability.AI_VIDEO);
        return new VideoAvailability(
                true,
                v.getId(),
                v.getStatus(),
                resolvedVia,
                v.getContentVersion(),
                v.getDurationSeconds(),
                v.getSizeBytes(),
                v.getQuality(),
                v.getLanguageCode(),
                v.getTeachingLevel(),
                v.getChecksumSha256(),
                v.isPremium(),
                entitled,
                "/api/lesson-videos/" + v.getId() + "/stream");
    }

    private boolean isStaff(User user) {
        return user != null && (user.getRole() == Role.ADMIN || user.getRole() == Role.REVIEWER);
    }

    private static void requireExactlyOneOwner(UUID topicId, UUID questionId) {
        if ((topicId == null) == (questionId == null)) {
            throw new IllegalArgumentException(
                    "A video must belong to exactly one of a topic or a question.");
        }
    }

    /**
     * Magic-byte check, mirroring the defence the document ingestion path already uses for PDFs.
     * An MP4 carries an ftyp box marker at offset 4 (0x66 0x74 0x79 0x70). Trusting the declared
     * content type instead would let any file be stored and later served as video.
     */
    private static boolean isMp4(byte[] bytes) {
        if (bytes.length < 12) {
            return false;
        }
        return bytes[4] == 0x66 && bytes[5] == 0x74 && bytes[6] == 0x79 && bytes[7] == 0x70;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
