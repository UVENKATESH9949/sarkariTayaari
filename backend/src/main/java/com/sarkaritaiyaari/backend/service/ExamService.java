package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.ExamRequest;
import com.sarkaritaiyaari.backend.dto.ExamResponse;
import com.sarkaritaiyaari.backend.dto.ExamTopicResponse;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.ExamTopic;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.repository.DifficultyLevelRepository;
import com.sarkaritaiyaari.backend.repository.ExamBadgeRepository;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional
public class ExamService {

    private final ExamRepository examRepository;
    private final SubjectRepository subjectRepository;
    private final DifficultyLevelRepository difficultyLevelRepository;
    private final ExamBadgeRepository examBadgeRepository;
    private final ExamTopicRepository examTopicRepository;
    private final TopicRepository topicRepository;

    public ExamService(ExamRepository examRepository, SubjectRepository subjectRepository,
                       DifficultyLevelRepository difficultyLevelRepository, ExamBadgeRepository examBadgeRepository,
                       ExamTopicRepository examTopicRepository, TopicRepository topicRepository) {
        this.examRepository = examRepository;
        this.subjectRepository = subjectRepository;
        this.difficultyLevelRepository = difficultyLevelRepository;
        this.examBadgeRepository = examBadgeRepository;
        this.examTopicRepository = examTopicRepository;
        this.topicRepository = topicRepository;
    }

    /* -------------------------------------------------------------------- Syllabus */

    /** The subjects this exam covers. Independent of whether its paper pattern exists yet. */
    @Transactional(readOnly = true)
    public List<SubjectResponse> getSyllabus(String examCode) {
        return getEntity(examCode).getSubjects().stream()
                .sorted(Comparator.comparingInt(Subject::getDisplayOrder).thenComparing(Subject::getName))
                .map(SubjectService::toResponse)
                .toList();
    }

    /** Replaces the syllabus wholesale — the admin sends the complete list it wants. */
    public List<SubjectResponse> setSyllabus(String examCode, List<UUID> subjectIds) {
        Exam exam = getEntity(examCode);
        Set<Subject> subjects = new LinkedHashSet<>();
        for (UUID id : subjectIds) {
            subjects.add(subjectRepository.findById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown subjectId: " + id)));
        }
        exam.setSubjects(subjects);
        examRepository.save(exam);
        return getSyllabus(examCode);
    }

    /* ------------------------------------------------------------- Topic map (Epic L) */

    /**
     * The topics this exam covers, with the admin's curated weightage. Distinct from
     * {@link #getSyllabus} — that answers "which subjects", this answers "which topics",
     * which was previously unanswerable at all (see preparation-os-requirements.md §18.2).
     */
    @Transactional(readOnly = true)
    public List<ExamTopicResponse> getTopics(String examCode) {
        getEntity(examCode); // 404 for an unknown exam rather than a misleading empty list
        return examTopicRepository.findByExamCodeOrderByTopicName(examCode).stream()
                .map(ExamService::toExamTopicResponse)
                .toList();
    }

    /** Replaces the topic map wholesale — the admin sends the complete list it wants. */
    public List<ExamTopicResponse> setTopics(String examCode, ExamTopicsRequest request) {
        Exam exam = getEntity(examCode);

        // Reject duplicates explicitly: the synthetic id would silently collapse them into
        // one row, so the admin would see fewer topics saved than it sent with no error.
        Set<UUID> seen = new LinkedHashSet<>();
        for (ExamTopicsRequest.Entry entry : request.getTopics()) {
            if (!seen.add(entry.getTopicId())) {
                throw new IllegalArgumentException("Duplicate topicId in request: " + entry.getTopicId());
            }
        }

        examTopicRepository.deleteByExamCode(examCode);
        // Flush the delete before inserting: the natural-key UNIQUE would otherwise be
        // violated by a re-sent topic, since Hibernate is free to order the insert first.
        examTopicRepository.flush();

        List<ExamTopic> rows = new ArrayList<>();
        for (ExamTopicsRequest.Entry entry : request.getTopics()) {
            Topic topic = topicRepository.findById(entry.getTopicId())
                    .orElseThrow(() -> new IllegalArgumentException("Unknown topicId: " + entry.getTopicId()));
            ExamTopic row = new ExamTopic();
            row.setId(ExamTopic.idFor(examCode, topic.getId()));
            row.setExam(exam);
            row.setTopic(topic);
            row.setWeightagePercent(entry.getWeightagePercent());
            rows.add(row);
        }
        examTopicRepository.saveAll(rows);
        return getTopics(examCode);
    }

    private static ExamTopicResponse toExamTopicResponse(ExamTopic row) {
        Topic topic = row.getTopic();
        Topic parent = topic.getParent();
        return new ExamTopicResponse(
                topic.getId(),
                topic.getName(),
                topic.getSubject().getId(),
                topic.getSubject().getName(),
                parent != null ? parent.getId() : null,
                parent != null ? parent.getName() : null,
                row.getWeightagePercent()
        );
    }

    /**
     * Adds subjects to an exam's syllabus without removing anything. Called when a paper
     * section is saved, so the syllabus stays a superset of what the sections reference
     * and the two can never contradict each other.
     */
    public void addToSyllabus(String examCode, Set<Subject> subjects) {
        if (subjects.isEmpty()) return;
        Exam exam = getEntity(examCode);
        if (exam.getSubjects().addAll(subjects)) {
            examRepository.save(exam);
        }
    }

    public ExamResponse create(ExamRequest request) {
        if (examRepository.existsById(request.getCode())) {
            throw new IllegalArgumentException("Exam code already exists: " + request.getCode());
        }
        Exam exam = new Exam();
        applyRequest(exam, request);
        return toResponse(examRepository.save(exam));
    }

    @Transactional(readOnly = true)
    public ExamResponse get(String code) {
        return toResponse(getEntity(code));
    }

    @Transactional(readOnly = true)
    public List<ExamResponse> listActive() {
        return examRepository.findAllByOrderByDisplayOrderAsc().stream()
                .filter(Exam::isActive)
                .map(ExamService::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ExamResponse> listAll() {
        return examRepository.findAllByOrderByDisplayOrderAsc().stream()
                .map(ExamService::toResponse)
                .toList();
    }

    public ExamResponse update(String code, ExamRequest request) {
        Exam exam = getEntity(code);
        applyRequest(exam, request);
        return toResponse(examRepository.save(exam));
    }

    public void delete(String code) {
        if (!examRepository.existsById(code)) {
            throw new NoSuchElementException("Exam not found: " + code);
        }
        examRepository.deleteById(code);
    }

    private void applyRequest(Exam exam, ExamRequest request) {
        exam.setCode(request.getCode());
        exam.setName(request.getName());
        exam.setImageUrl(request.getImageUrl());
        exam.setActive(request.isActive());
        exam.setDisplayOrder(request.getDisplayOrder());
        exam.setDifficulty(normalizeDifficulty(request.getDifficulty()));
        exam.setBadge(normalizeBadge(request.getBadge()));
    }

    /*
     * Both fields are optional FKs. Blank is normalised to null so an admin form that
     * submits "" for "not set" clears the column instead of tripping the constraint, and
     * an unknown code fails here with a 400 rather than as a raw constraint violation —
     * same reasoning as QuestionService.requireDifficultyExists.
     */

    private String normalizeDifficulty(String difficulty) {
        String value = blankToNull(difficulty);
        if (value != null && !difficultyLevelRepository.existsById(value)) {
            throw new IllegalArgumentException("Unknown difficulty: " + value);
        }
        return value;
    }

    private String normalizeBadge(String badge) {
        String value = blankToNull(badge);
        if (value != null && !examBadgeRepository.existsById(value)) {
            throw new IllegalArgumentException("Unknown badge: " + value);
        }
        return value;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private Exam getEntity(String code) {
        return examRepository.findById(code)
                .orElseThrow(() -> new NoSuchElementException("Exam not found: " + code));
    }

    private static ExamResponse toResponse(Exam exam) {
        return new ExamResponse(exam.getCode(), exam.getName(), exam.getImageUrl(), exam.isActive(),
                exam.getDisplayOrder(), exam.getDifficulty(), exam.getBadge());
    }
}
