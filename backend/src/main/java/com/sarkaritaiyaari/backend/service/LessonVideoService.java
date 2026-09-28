package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.LessonVideoDtos.AdminVideo;
import com.sarkaritaiyaari.backend.dto.LessonVideoDtos.TopicVideoCatalog;
import com.sarkaritaiyaari.backend.dto.LessonVideoDtos.TopicVideoCatalogEntry;
import com.sarkaritaiyaari.backend.dto.LessonVideoDtos.VideoAvailability;
import com.sarkaritaiyaari.backend.entitlement.Capability;
import com.sarkaritaiyaari.backend.entitlement.EntitlementService;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.LessonVideo;
import com.sarkaritaiyaari.backend.entity.LessonVideoUpload;
import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.TeachingLevel;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.VideoQuality;
import com.sarkaritaiyaari.backend.entity.VideoSource;
import com.sarkaritaiyaari.backend.entity.VideoStatus;
import com.sarkaritaiyaari.backend.repository.LessonVideoRepository;
import com.sarkaritaiyaari.backend.repository.LessonVideoUploadRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.video.StoredVideo;
import com.sarkaritaiyaari.backend.video.VideoPlayback;
import com.sarkaritaiyaari.backend.video.VideoStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

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
 * <p><strong>Attaching a file and publishing it are two separate steps, and only the second one
 * touches the object store.</strong> An upload stages the bytes in this database
 * ({@link LessonVideoUpload}) and leaves the row PENDING_UPLOAD; accepting the video is what sends
 * it to Cloudinary. A reviewer can still watch it in between, streamed from staging, because
 * approving a video nobody could watch would not be a review. See {@link LessonVideoPublisher} for
 * why the upload itself runs outside a transaction.
 *
 * <p>Nothing here is asynchronous beyond that. On-demand generation would be the first thing in
 * this backend to need a real job runner.
 */
@Service
public class LessonVideoService {

    private static final Logger log = LoggerFactory.getLogger(LessonVideoService.class);

    private static final long MAX_VIDEO_BYTES = 20L * 1024 * 1024;

    private final LessonVideoRepository videos;
    private final LessonVideoUploadRepository staged;
    private final QuestionRepository questions;
    private final TopicRepository topics;
    private final VideoStorage storage;
    private final EntitlementService entitlements;
    private final LessonVideoPublisher publisher;
    private final TransactionTemplate tx;

    public LessonVideoService(LessonVideoRepository videos,
                              LessonVideoUploadRepository staged,
                              QuestionRepository questions,
                              TopicRepository topics,
                              VideoStorage storage,
                              EntitlementService entitlements,
                              LessonVideoPublisher publisher,
                              PlatformTransactionManager transactionManager) {
        this.videos = videos;
        this.staged = staged;
        this.questions = questions;
        this.topics = topics;
        this.storage = storage;
        this.entitlements = entitlements;
        this.publisher = publisher;
        this.tx = new TransactionTemplate(transactionManager);
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
        if (video.getStorageKey() == null) {
            // Not in the object store yet, because it has not been accepted. A reviewer still has
            // to be able to watch it - that is what they are deciding about - so it is served from
            // staging. A student never reaches this line: the publication check above already
            // turned them away.
            if (isStaff(user)) {
                return stagedPlayback(videoId);
            }
            throw new NoSuchElementException("Video has no playable file: " + videoId);
        }
        if (video.getStatus() != VideoStatus.READY) {
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

        String checksum = sha256(bytes);
        String resolvedMime = mimeType == null ? "video/mp4" : mimeType;

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
        video.setMimeType(resolvedMime);
        video.setSizeBytes((long) bytes.length);
        video.setDurationSeconds(durationSeconds);
        video.setChecksumSha256(checksum);
        video.setContentStatus(ContentStatus.DRAFT);
        // Nothing is sent to the object store here. Publishing is what does that, so an attached
        // but unreviewed video never reaches Cloudinary at all.
        video.setStatus(VideoStatus.PENDING_UPLOAD);
        video.setCreatedAt(OffsetDateTime.now());
        video.setUpdatedAt(OffsetDateTime.now());
        LessonVideo saved = videos.save(video);

        LessonVideoUpload file = new LessonVideoUpload();
        file.setVideoId(saved.getId());
        file.setBytes(bytes);
        file.setMimeType(resolvedMime);
        file.setSizeBytes(bytes.length);
        file.setChecksumSha256(checksum);
        file.setCreatedAt(OffsetDateTime.now());
        staged.save(file);

        log.info("video.upload staged id={} version={} bytes={} by={}",
                saved.getId(), nextVersion, bytes.length, uploadedByEmail);
        return AdminVideo.from(saved, true);
    }

    /**
     * Accepts a video: uploads it to the object store, then marks it published.
     *
     * <p>In that order, and not in one transaction. The upload is the slow, fallible part, so it
     * runs first and on its own; only once the bytes are genuinely stored does the row become
     * PUBLISHED. The reverse order would be the failure mode worth avoiding most - a row saying
     * PUBLISHED with no file behind it, which a student meets as a play button that does nothing.
     *
     * <p>Not {@code @Transactional}: see {@link LessonVideoPublisher}.
     */
    public AdminVideo publish(UUID videoId, String reviewerEmail) {
        LessonVideoPublisher.Outcome outcome = publisher.promote(videoId, reviewerEmail);
        if (outcome == LessonVideoPublisher.Outcome.FAILED) {
            // Deliberately not a 500. Nothing is broken: the video is intact, the failure is
            // recorded on the row, and the admin's next move is to press Retry.
            throw new IllegalArgumentException(
                    "The video could not be uploaded to storage, so it was not published. "
                            + "The file is still attached - use Retry upload to try again.");
        }
        return tx.execute(status ->
                applyContentStatus(videoId, ContentStatus.PUBLISHED, null, reviewerEmail));
    }

    /**
     * Re-runs a failed upload using the bytes still held in staging.
     *
     * <p>Safe to press repeatedly. A video already in the store is reported as such without being
     * re-uploaded, and an upload that does run overwrites its own object rather than creating a
     * second one - so a retry after an upload that had secretly succeeded cannot leave a duplicate
     * behind.
     */
    public AdminVideo retryUpload(UUID videoId, String actorEmail) {
        LessonVideoPublisher.Outcome outcome = publisher.promote(videoId, actorEmail);
        if (outcome == LessonVideoPublisher.Outcome.FAILED) {
            throw new IllegalArgumentException(
                    "The upload failed again. The file is still attached; see the error on the "
                            + "video for what storage reported.");
        }
        return describeForAdmin(videoId);
    }

    /**
     * Moves a video between review states without touching storage.
     *
     * <p>Publishing does not come through here - {@link #publish} does, because publishing has to
     * upload first. The PUBLISHED guard below stays anyway: it is what stops any other caller
     * marking a video live when no file is behind it.
     */
    @Transactional
    public AdminVideo setContentStatus(UUID videoId, ContentStatus target, String reason,
                                       String reviewerEmail) {
        return applyContentStatus(videoId, target, reason, reviewerEmail);
    }

    private AdminVideo applyContentStatus(UUID videoId, ContentStatus target, String reason,
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
        return AdminVideo.from(videos.save(video), staged.existsById(videoId));
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
        // The row is soft-deleted, so the staging table's ON DELETE CASCADE never fires. Dropping
        // the bytes explicitly is what stops an archived video going on holding megabytes here.
        staged.deleteById(videoId);
        log.info("video.delete id={} by={}", videoId, byEmail);
    }

    @Transactional(readOnly = true)
    public List<AdminVideo> listForAdmin() {
        List<LessonVideo> rows = videos.findAllByDeletedFalseOrderByCreatedAtDesc();
        // One query for the whole page rather than an existsById per row. The staging table holds
        // file bytes, so this deliberately reads only the ids - a findAll here would pull every
        // pending video's megabytes into memory to answer a yes/no question.
        Set<UUID> withFiles = staged.findAllStagedVideoIds(
                rows.stream().map(LessonVideo::getId).toList());
        return rows.stream()
                .map(v -> AdminVideo.from(v, withFiles.contains(v.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public AdminVideo describeForAdmin(UUID videoId) {
        LessonVideo video = videos.findByIdAndDeletedFalse(videoId)
                .orElseThrow(() -> new NoSuchElementException("Video not found: " + videoId));
        return AdminVideo.from(video, staged.existsById(videoId));
    }

    /**
     * Every published topic video, for the AI Videos browse screen.
     *
     * <p>One call answers a whole screen. The alternative - asking per topic - is 61 requests for
     * SSC CGL, which is the wrong shape for a product that assumes a slow connection. Topics with
     * no video are simply absent; the client already holds the syllabus and renders its own empty
     * state from what is missing here.
     */
    @Transactional(readOnly = true)
    public TopicVideoCatalog topicCatalog(UUID subjectId, String languageCode, TeachingLevel level,
                                          VideoQuality quality, User user) {
        List<LessonVideo> rows =
                videos.findPublishedTopicCatalog(subjectId, languageCode, level, quality);

        // One batched lookup for every topic in the result, not one per row. The alternative is
        // an N+1 over a list that grows with the video library.
        Map<UUID, UUID> subjectByTopic = topics
                .findAllById(rows.stream().map(LessonVideo::getTopicId).distinct().toList())
                .stream()
                .filter(t -> t.getSubject() != null)
                .collect(Collectors.toMap(Topic::getId, t -> t.getSubject().getId()));

        List<TopicVideoCatalogEntry> items =
                rows.stream()
                        .map(v -> new TopicVideoCatalogEntry(
                                v.getTopicId(),
                                subjectByTopic.get(v.getTopicId()),
                                v.getId(),
                                v.getContentVersion(),
                                v.getDurationSeconds(),
                                v.getSizeBytes(),
                                v.getLanguageCode(),
                                v.getTeachingLevel(),
                                v.getQuality(),
                                v.getChecksumSha256(),
                                v.isPremium(),
                                !v.isPremium() || entitlements.has(user, Capability.AI_VIDEO),
                                "/api/lesson-videos/" + v.getId() + "/stream"))
                        .toList();
        return new TopicVideoCatalog(items);
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

    /**
     * Serves an attached-but-unpublished file straight from the staging table.
     *
     * <p>Proxying bytes through this backend is exactly what the object store exists to avoid, and
     * it is fine here: only staff reach it, only for videos awaiting review, and the file is
     * capped at 20MB. The alternative - uploading to the store before anyone has approved the
     * video - is the thing this flow was changed to stop doing.
     */
    private VideoPlayback stagedPlayback(UUID videoId) {
        LessonVideoUpload file = staged.findById(videoId).orElseThrow(
                () -> new NoSuchElementException("Video has no playable file: " + videoId));
        return new VideoPlayback.Stream(new StoredVideo(
                new ByteArrayResource(file.getBytes()), file.getSizeBytes(), file.getMimeType()));
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
