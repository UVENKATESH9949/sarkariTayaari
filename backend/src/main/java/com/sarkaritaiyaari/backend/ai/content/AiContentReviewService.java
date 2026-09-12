package com.sarkaritaiyaari.backend.ai.content;

import com.sarkaritaiyaari.backend.entity.AiContent;
import com.sarkaritaiyaari.backend.entity.AiContentTask;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.repository.AiContentRepository;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * TASK-2701 Phase 2 -- the DRAFT -> REVIEW -> PUBLISHED workflow, reusing {@link ContentStatus}
 * and the {@code REVIEWER} role rather than inventing a parallel one (see V41's own comment and
 * {@code ExamGuideAdminController}'s equivalent transitions for recruitment cycles).
 *
 * Unlike {@code ExamGuideService.setCycleContentStatus} (which accepts any status from any
 * status), transitions here are validated. AI-generated exam content is a sharper risk than a
 * recruitment cycle's own metadata — the added rigor is proportionate, and this is new code with
 * no existing caller to stay compatible with.
 */
@Service
public class AiContentReviewService {

    private final AiContentRepository aiContentRepository;

    public AiContentReviewService(AiContentRepository aiContentRepository) {
        this.aiContentRepository = aiContentRepository;
    }

    @Transactional(readOnly = true)
    public AiContent require(UUID id) {
        return aiContentRepository.findById(id)
                .filter(c -> !c.isDeleted())
                .orElseThrow(() -> new NoSuchElementException("AI content not found: " + id));
    }

    @Transactional(readOnly = true)
    public List<AiContent> list(AiContentTask taskId, ContentStatus status) {
        if (taskId != null) {
            return aiContentRepository.findByTaskIdAndContentStatus(taskId, status);
        }
        return aiContentRepository.findByContentStatus(status);
    }

    /**
     * TASK-2701 Phase 3 — the public read behind {@code GET /api/ai-content/sync}. Unlike
     * {@link #list}, this is never {@code requireReviewer}-gated: it is the reference-content
     * feed a signed-out device consumes exactly like questions/exam-structure sync. Every
     * non-deleted row since the watermark is returned regardless of status, so a row leaving
     * PUBLISHED still reaches an already-synced device as a tombstone (the controller/mapper
     * layer strips the payload and admin-only fields for anything not currently PUBLISHED).
     */
    @Transactional(readOnly = true)
    public List<AiContent> findUpdatedSince(OffsetDateTime since) {
        return aiContentRepository.findByUpdatedAtAfter(since);
    }

    /** Same "0 or blank means a full sync" convention as {@code QuestionService.parseSince}. */
    public static OffsetDateTime parseSince(String since) {
        if (since == null || since.isBlank() || since.equals("0")) {
            return OffsetDateTime.parse("1970-01-01T00:00:00Z");
        }
        try {
            return OffsetDateTime.parse(since);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(
                    "Invalid 'since' timestamp: " + since + ". Use ISO-8601 (e.g. 2026-01-01T00:00:00Z) or 0 for a full sync.");
        }
    }

    @Transactional
    public AiContent submitForReview(UUID id, long expectedVersion) {
        AiContent content = require(id);
        checkVersion(content, expectedVersion);
        if (content.getContentStatus() != ContentStatus.DRAFT) {
            throw new IllegalArgumentException("Only DRAFT content can be submitted for review (current: "
                    + content.getContentStatus() + ")");
        }
        content.setContentStatus(ContentStatus.REVIEW);
        return save(content);
    }

    /** Mirrors ExamGuide's own "an admin can still publish straight from DRAFT" fast path. */
    @Transactional
    public AiContent publish(UUID id, long expectedVersion, String reviewerEmail) {
        AiContent content = require(id);
        checkVersion(content, expectedVersion);
        if (content.getContentStatus() == ContentStatus.PUBLISHED) {
            throw new IllegalArgumentException("Content is already published");
        }
        content.setContentStatus(ContentStatus.PUBLISHED);
        content.setRejectionReason(null);
        content.setReviewedAt(OffsetDateTime.now());
        content.setReviewedByEmail(reviewerEmail);
        return save(content);
    }

    @Transactional
    public AiContent reject(UUID id, String reason, long expectedVersion, String reviewerEmail) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("A rejection reason is required");
        }
        AiContent content = require(id);
        checkVersion(content, expectedVersion);
        if (content.getContentStatus() != ContentStatus.REVIEW) {
            throw new IllegalArgumentException("Only content awaiting review can be rejected (current: "
                    + content.getContentStatus() + ")");
        }
        content.setContentStatus(ContentStatus.DRAFT);
        content.setRejectionReason(reason.trim());
        content.setReviewedAt(OffsetDateTime.now());
        content.setReviewedByEmail(reviewerEmail);
        return save(content);
    }

    @Transactional
    public AiContent unpublish(UUID id, long expectedVersion, String reviewerEmail) {
        AiContent content = require(id);
        checkVersion(content, expectedVersion);
        if (content.getContentStatus() != ContentStatus.PUBLISHED) {
            throw new IllegalArgumentException("Only published content can be unpublished (current: "
                    + content.getContentStatus() + ")");
        }
        content.setContentStatus(ContentStatus.DRAFT);
        content.setReviewedAt(OffsetDateTime.now());
        content.setReviewedByEmail(reviewerEmail);
        return save(content);
    }

    private void checkVersion(AiContent content, long expectedVersion) {
        if (content.getVersion() != expectedVersion) {
            throw new ObjectOptimisticLockingFailureException(AiContent.class, content.getId());
        }
    }

    private AiContent save(AiContent content) {
        content.setUpdatedAt(OffsetDateTime.now());
        try {
            return aiContentRepository.save(content);
        } catch (OptimisticLockingFailureException e) {
            throw new ObjectOptimisticLockingFailureException(AiContent.class, content.getId());
        }
    }
}
