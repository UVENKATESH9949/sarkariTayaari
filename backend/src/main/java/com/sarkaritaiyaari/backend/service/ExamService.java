package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.ExamRequest;
import com.sarkaritaiyaari.backend.dto.ExamResponse;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.repository.DifficultyLevelRepository;
import com.sarkaritaiyaari.backend.repository.ExamBadgeRepository;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    public ExamService(ExamRepository examRepository, SubjectRepository subjectRepository,
                       DifficultyLevelRepository difficultyLevelRepository, ExamBadgeRepository examBadgeRepository) {
        this.examRepository = examRepository;
        this.subjectRepository = subjectRepository;
        this.difficultyLevelRepository = difficultyLevelRepository;
        this.examBadgeRepository = examBadgeRepository;
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
