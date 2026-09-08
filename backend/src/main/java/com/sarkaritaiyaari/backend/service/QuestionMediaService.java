package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.CreateQuestionMediaRequest;
import com.sarkaritaiyaari.backend.dto.QuestionMediaResponse;
import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.QuestionGroup;
import com.sarkaritaiyaari.backend.entity.QuestionMedia;
import com.sarkaritaiyaari.backend.repository.QuestionGroupRepository;
import com.sarkaritaiyaari.backend.repository.QuestionMediaRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Attaches an already-uploaded (via the existing {@code POST /api/images}, Cloudinary-backed)
 * file URL to exactly one question or group (TASK-2301 Phase P3). This service never uploads a
 * file itself — that stays {@code ImageUploadController}'s job — it only records the ownership
 * relationship.
 */
@Service
@Transactional
public class QuestionMediaService {

    private static final java.util.Set<String> VALID_MEDIA_TYPES = java.util.Set.of("IMAGE", "MAP");

    private final QuestionMediaRepository mediaRepository;
    private final QuestionRepository questionRepository;
    private final QuestionGroupRepository groupRepository;

    public QuestionMediaService(QuestionMediaRepository mediaRepository,
                                 QuestionRepository questionRepository,
                                 QuestionGroupRepository groupRepository) {
        this.mediaRepository = mediaRepository;
        this.questionRepository = questionRepository;
        this.groupRepository = groupRepository;
    }

    public QuestionMediaResponse create(CreateQuestionMediaRequest request) {
        boolean hasQuestion = request.getQuestionId() != null;
        boolean hasGroup = request.getQuestionGroupId() != null;
        if (hasQuestion == hasGroup) {
            throw new IllegalArgumentException("Exactly one of questionId or questionGroupId is required");
        }
        if (!VALID_MEDIA_TYPES.contains(request.getMediaType())) {
            throw new IllegalArgumentException("mediaType must be one of " + VALID_MEDIA_TYPES);
        }
        if (request.getUrl() == null || request.getUrl().isBlank()) {
            throw new IllegalArgumentException("url is required");
        }

        QuestionMedia media = new QuestionMedia();
        if (hasQuestion) {
            Question question = questionRepository.findById(request.getQuestionId())
                    .orElseThrow(() -> new IllegalArgumentException("Unknown questionId: " + request.getQuestionId()));
            media.setQuestion(question);
        } else {
            QuestionGroup group = groupRepository.findById(request.getQuestionGroupId())
                    .orElseThrow(() -> new IllegalArgumentException("Unknown questionGroupId: " + request.getQuestionGroupId()));
            media.setQuestionGroup(group);
        }
        media.setMediaType(request.getMediaType());
        media.setUrl(request.getUrl());
        media.setMimeType(request.getMimeType());
        media.setDisplayOrder(request.getDisplayOrder() == null ? 0 : request.getDisplayOrder());
        media.setUpdatedAt(OffsetDateTime.now());
        media.setDeleted(false);

        QuestionMedia saved = mediaRepository.save(media);
        // Bumps the owner's updatedAt so a synced device notices new media on its next delta
        // sync — media has no sync endpoint of its own, it rides along on its owner's row.
        if (hasQuestion) {
            Question question = saved.getQuestion();
            question.setUpdatedAt(OffsetDateTime.now());
            questionRepository.save(question);
        } else {
            QuestionGroup group = saved.getQuestionGroup();
            group.setUpdatedAt(OffsetDateTime.now());
            groupRepository.save(group);
        }

        return toResponse(saved);
    }

    /** Soft-delete, same tombstone convention as everything else here — the owner's updatedAt is bumped so the removal syncs. */
    public void delete(UUID id) {
        QuestionMedia media = mediaRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Question media not found: " + id));
        media.setDeleted(true);
        media.setUpdatedAt(OffsetDateTime.now());
        mediaRepository.save(media);

        if (media.getQuestion() != null) {
            Question question = media.getQuestion();
            question.setUpdatedAt(OffsetDateTime.now());
            questionRepository.save(question);
        } else if (media.getQuestionGroup() != null) {
            QuestionGroup group = media.getQuestionGroup();
            group.setUpdatedAt(OffsetDateTime.now());
            groupRepository.save(group);
        }
    }

    private QuestionMediaResponse toResponse(QuestionMedia media) {
        QuestionMediaResponse response = new QuestionMediaResponse();
        response.setId(media.getId());
        response.setMediaType(media.getMediaType());
        response.setUrl(media.getUrl());
        response.setMimeType(media.getMimeType());
        response.setDisplayOrder(media.getDisplayOrder());
        return response;
    }
}
