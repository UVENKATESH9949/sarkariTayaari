package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.BlueprintSource;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.LessonBlueprint;
import com.sarkaritaiyaari.backend.entity.TeachingLevel;
import com.sarkaritaiyaari.backend.repository.LessonBlueprintRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.video.LessonBlueprintValidation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Stores and reviews teaching blueprints.
 *
 * <p>A blueprint is the teaching content itself, independent of delivery. Today the only producer
 * is the AI Video Studio, whose lessons are hand-authored JSON files; importing one here makes it
 * reviewable and gives a rendered video something to point back at. Later the same row can drive
 * a text lesson or a device-rendered lesson without re-deciding what to teach.
 */
@Service
public class LessonBlueprintService {

    private static final Logger log = LoggerFactory.getLogger(LessonBlueprintService.class);

    private final LessonBlueprintRepository blueprints;
    private final TopicRepository topics;
    private final QuestionRepository questions;

    public LessonBlueprintService(LessonBlueprintRepository blueprints,
                                  TopicRepository topics,
                                  QuestionRepository questions) {
        this.blueprints = blueprints;
        this.topics = topics;
        this.questions = questions;
    }

    @Transactional
    public LessonBlueprint create(UUID topicId, UUID questionId, String languageCode,
                                  TeachingLevel level, BlueprintSource source,
                                  Map<String, Object> payload) {
        if ((topicId == null) == (questionId == null)) {
            throw new IllegalArgumentException(
                    "A blueprint must belong to exactly one of a topic or a question.");
        }
        if (topicId != null && !topics.existsById(topicId)) {
            throw new NoSuchElementException("Topic not found: " + topicId);
        }
        if (questionId != null && !questions.existsById(questionId)) {
            throw new NoSuchElementException("Question not found: " + questionId);
        }

        List<String> problems = LessonBlueprintValidation.problems(payload);
        if (!problems.isEmpty()) {
            throw new IllegalArgumentException(String.join(" ", problems));
        }

        LessonBlueprint blueprint = new LessonBlueprint();
        blueprint.setTopicId(topicId);
        blueprint.setQuestionId(questionId);
        blueprint.setLanguageCode(languageCode);
        blueprint.setTeachingLevel(level);
        blueprint.setSource(source);
        blueprint.setPayload(payload);
        blueprint.setSchemaVersion(LessonBlueprintValidation.SCHEMA_VERSION);
        blueprint.setStudioLessonId(LessonBlueprintValidation.studioLessonId(payload));
        blueprint.setContentStatus(ContentStatus.DRAFT);
        blueprint.setCreatedAt(OffsetDateTime.now());
        blueprint.setUpdatedAt(OffsetDateTime.now());

        LessonBlueprint saved = blueprints.save(blueprint);
        log.info("blueprint.create id={} studioLessonId={} scenes={}",
                saved.getId(), saved.getStudioLessonId(),
                LessonBlueprintValidation.sceneCount(payload));
        return saved;
    }

    @Transactional
    public LessonBlueprint setContentStatus(UUID id, ContentStatus target, String reason,
                                            String reviewerEmail) {
        LessonBlueprint blueprint = blueprints.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new NoSuchElementException("Blueprint not found: " + id));
        blueprint.setContentStatus(target);
        blueprint.setRejectionReason(target == ContentStatus.DRAFT ? reason : null);
        blueprint.setReviewedByEmail(reviewerEmail);
        blueprint.setReviewedAt(OffsetDateTime.now());
        blueprint.setUpdatedAt(OffsetDateTime.now());
        return blueprints.save(blueprint);
    }

    @Transactional(readOnly = true)
    public List<LessonBlueprint> list() {
        return blueprints.findAllByDeletedFalseOrderByCreatedAtDesc();
    }

    @Transactional(readOnly = true)
    public LessonBlueprint get(UUID id) {
        return blueprints.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new NoSuchElementException("Blueprint not found: " + id));
    }

    @Transactional
    public void delete(UUID id) {
        LessonBlueprint blueprint = blueprints.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new NoSuchElementException("Blueprint not found: " + id));
        blueprint.setDeleted(true);
        blueprint.setUpdatedAt(OffsetDateTime.now());
        blueprints.save(blueprint);
    }
}
