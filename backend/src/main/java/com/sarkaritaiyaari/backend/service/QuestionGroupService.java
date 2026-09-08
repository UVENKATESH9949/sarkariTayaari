package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.CreateQuestionGroupRequest;
import com.sarkaritaiyaari.backend.dto.QuestionGroupResponse;
import com.sarkaritaiyaari.backend.dto.QuestionGroupTranslationRequest;
import com.sarkaritaiyaari.backend.dto.QuestionGroupTranslationResponse;
import com.sarkaritaiyaari.backend.dto.QuestionMediaResponse;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionGroupRequest;
import com.sarkaritaiyaari.backend.dto.UpsertQuestionGroupTranslationRequest;
import com.sarkaritaiyaari.backend.entity.QuestionGroup;
import com.sarkaritaiyaari.backend.entity.QuestionGroupTranslation;
import com.sarkaritaiyaari.backend.entity.QuestionGroupType;
import com.sarkaritaiyaari.backend.entity.QuestionMedia;
import com.sarkaritaiyaari.backend.repository.LanguageRepository;
import com.sarkaritaiyaari.backend.repository.QuestionGroupRepository;
import com.sarkaritaiyaari.backend.repository.QuestionGroupTranslationRepository;
import com.sarkaritaiyaari.backend.repository.QuestionMediaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.NoSuchElementException;
import java.util.UUID;

/** CRUD + sync for {@link QuestionGroup} (TASK-2301 Phase P3) — mirrors {@code QuestionService}'s own shape. */
@Service
@Transactional
public class QuestionGroupService {

    private static final OffsetDateTime EPOCH = Instant.EPOCH.atOffset(ZoneOffset.UTC);
    private static final int MAX_SYNC_PAGE_SIZE = 1000;

    private final QuestionGroupRepository groupRepository;
    private final QuestionGroupTranslationRepository translationRepository;
    private final QuestionMediaRepository mediaRepository;
    private final LanguageRepository languageRepository;

    public QuestionGroupService(QuestionGroupRepository groupRepository,
                                 QuestionGroupTranslationRepository translationRepository,
                                 QuestionMediaRepository mediaRepository,
                                 LanguageRepository languageRepository) {
        this.groupRepository = groupRepository;
        this.translationRepository = translationRepository;
        this.mediaRepository = mediaRepository;
        this.languageRepository = languageRepository;
    }

    private static void requireValidGroupType(String groupType) {
        try {
            QuestionGroupType.valueOf(groupType);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown group type: " + groupType);
        }
    }

    public QuestionGroupResponse create(CreateQuestionGroupRequest request) {
        requireValidGroupType(request.getGroupType());
        QuestionGroup group = new QuestionGroup();
        group.setGroupType(request.getGroupType());
        group.setUpdatedAt(OffsetDateTime.now());
        group.setDeleted(false);
        QuestionGroup saved = groupRepository.save(group);

        if (request.getTranslations() != null) {
            for (QuestionGroupTranslationRequest t : request.getTranslations()) {
                translationRepository.save(buildTranslation(saved, t));
            }
        }
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public QuestionGroupResponse get(UUID id) {
        return toResponse(getEntity(id));
    }

    @Transactional(readOnly = true)
    public Page<QuestionGroupResponse> list(Pageable pageable) {
        return groupRepository.findAll(pageable).map(this::toResponse);
    }

    /** Same delta-sync shape as {@code QuestionService.sync} — groups sync on their own paged endpoint, written before question pages, so a question's group_id resolves locally by the time that question's page arrives. */
    @Transactional(readOnly = true)
    public Page<QuestionGroupResponse> sync(String since, int page, int size) {
        OffsetDateTime sinceTimestamp = parseSince(since);
        int clampedSize = Math.min(Math.max(size, 1), MAX_SYNC_PAGE_SIZE);
        return groupRepository
                .findByUpdatedAtAfter(sinceTimestamp, PageRequest.of(page, clampedSize, Sort.by("updatedAt").ascending()))
                .map(this::toResponse);
    }

    private OffsetDateTime parseSince(String since) {
        if (since == null || since.isBlank() || since.equals("0")) {
            return EPOCH;
        }
        try {
            return OffsetDateTime.parse(since);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(
                    "Invalid 'since' timestamp: " + since + ". Use ISO-8601 (e.g. 2026-01-01T00:00:00Z) or 0 for a full sync.");
        }
    }

    public QuestionGroupResponse update(UUID id, UpdateQuestionGroupRequest request) {
        requireValidGroupType(request.getGroupType());
        QuestionGroup group = getEntity(id);
        group.setGroupType(request.getGroupType());
        group.setUpdatedAt(OffsetDateTime.now());
        return toResponse(groupRepository.save(group));
    }

    public QuestionGroupResponse upsertTranslation(UUID groupId, String languageCode, UpsertQuestionGroupTranslationRequest request) {
        QuestionGroup group = getEntity(groupId);
        requireLanguageExists(languageCode);

        QuestionGroupTranslation translation = translationRepository
                .findByQuestionGroupIdAndLanguageCode(groupId, languageCode)
                .orElseGet(() -> {
                    QuestionGroupTranslation t = new QuestionGroupTranslation();
                    t.setQuestionGroup(group);
                    t.setLanguage(languageRepository.getReferenceById(languageCode));
                    return t;
                });
        translation.setPassageText(request.getPassageText());
        translationRepository.save(translation);

        group.setUpdatedAt(OffsetDateTime.now());
        return toResponse(groupRepository.save(group));
    }

    /**
     * Soft-delete only — the same tombstone mechanism {@code questions.is_deleted} already
     * uses, so a device that has synced this group's passage learns to drop it. Deliberately
     * does **not** cascade to member questions: a group being retired doesn't mean its
     * questions stop being valid standalone content, and an admin who wants that has to say so
     * explicitly per question.
     */
    public void delete(UUID id) {
        QuestionGroup group = getEntity(id);
        group.setDeleted(true);
        group.setUpdatedAt(OffsetDateTime.now());
        groupRepository.save(group);
    }

    private QuestionGroupTranslation buildTranslation(QuestionGroup group, QuestionGroupTranslationRequest request) {
        requireLanguageExists(request.getLanguageCode());
        QuestionGroupTranslation translation = new QuestionGroupTranslation();
        translation.setQuestionGroup(group);
        translation.setLanguage(languageRepository.getReferenceById(request.getLanguageCode()));
        translation.setPassageText(request.getPassageText());
        return translation;
    }

    private void requireLanguageExists(String languageCode) {
        if (!languageRepository.existsById(languageCode)) {
            throw new IllegalArgumentException("Unknown language code: " + languageCode);
        }
    }

    private QuestionGroup getEntity(UUID id) {
        return groupRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Question group not found: " + id));
    }

    private QuestionGroupResponse toResponse(QuestionGroup group) {
        QuestionGroupResponse response = new QuestionGroupResponse();
        response.setId(group.getId());
        response.setGroupType(group.getGroupType());
        response.setUpdatedAt(group.getUpdatedAt());
        response.setDeleted(group.isDeleted());
        response.setTranslations(translationRepository.findByQuestionGroupId(group.getId()).stream()
                .sorted(Comparator.comparing(t -> t.getLanguage().getCode()))
                .map(t -> new QuestionGroupTranslationResponse(t.getLanguage().getCode(), t.getPassageText()))
                .toList());
        response.setMedia(mediaRepository.findByQuestionGroupIdAndDeletedFalseOrderByDisplayOrderAsc(group.getId()).stream()
                .map(this::toMediaResponse)
                .toList());
        return response;
    }

    private QuestionMediaResponse toMediaResponse(QuestionMedia media) {
        QuestionMediaResponse response = new QuestionMediaResponse();
        response.setId(media.getId());
        response.setMediaType(media.getMediaType());
        response.setUrl(media.getUrl());
        response.setMimeType(media.getMimeType());
        response.setDisplayOrder(media.getDisplayOrder());
        return response;
    }
}
