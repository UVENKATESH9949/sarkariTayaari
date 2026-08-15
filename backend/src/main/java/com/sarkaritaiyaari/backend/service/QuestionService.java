package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.BulkImportFailure;
import com.sarkaritaiyaari.backend.dto.BulkImportQuestionRequest;
import com.sarkaritaiyaari.backend.dto.BulkImportResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionMapper;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.UpsertTranslationRequest;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.QuestionTranslation;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.repository.DifficultyLevelRepository;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.LanguageRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.QuestionSpecifications;
import com.sarkaritaiyaari.backend.repository.QuestionTranslationRepository;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
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
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

/**
 * All public methods map entities to response DTOs before returning, while the
 * transaction (and Hibernate session) is still open — translations are a lazy
 * collection, so mapping after the transaction closes throws LazyInitializationException.
 */
@Service
@Transactional
public class QuestionService {

    private static final String ROOT_LANGUAGE = "en";
    private static final OffsetDateTime EPOCH = Instant.EPOCH.atOffset(ZoneOffset.UTC);
    private static final int MAX_SYNC_PAGE_SIZE = 1000;

    private final QuestionRepository questionRepository;
    private final QuestionTranslationRepository translationRepository;
    private final LanguageRepository languageRepository;
    private final TopicRepository topicRepository;
    private final SubjectRepository subjectRepository;
    private final ExamRepository examRepository;
    private final DifficultyLevelRepository difficultyLevelRepository;

    public QuestionService(QuestionRepository questionRepository,
                            QuestionTranslationRepository translationRepository,
                            LanguageRepository languageRepository,
                            TopicRepository topicRepository,
                            SubjectRepository subjectRepository,
                            ExamRepository examRepository,
                            DifficultyLevelRepository difficultyLevelRepository) {
        this.questionRepository = questionRepository;
        this.translationRepository = translationRepository;
        this.languageRepository = languageRepository;
        this.topicRepository = topicRepository;
        this.subjectRepository = subjectRepository;
        this.examRepository = examRepository;
        this.difficultyLevelRepository = difficultyLevelRepository;
    }

    /**
     * difficulty is a FK to difficulty_levels. Checking it here turns an unknown value
     * into a readable 400 instead of letting it reach the database as an unmapped 500.
     */
    private void requireDifficultyExists(String difficulty) {
        if (!difficultyLevelRepository.existsById(difficulty)) {
            throw new IllegalArgumentException("Unknown difficulty: " + difficulty);
        }
    }

    public QuestionResponse create(CreateQuestionRequest request) {
        validateTranslations(request.getTranslations());

        requireDifficultyExists(request.getDifficulty());

        Question question = new Question();
        question.setCorrectAnswer(request.getCorrectAnswer());
        question.setTopic(requireTopic(request.getTopicId()));
        question.setDifficulty(request.getDifficulty());
        question.setExams(requireExams(request.getExamCodes()));
        question.setPremium(request.isPremium());
        question.setUpdatedAt(OffsetDateTime.now());
        question.setDeleted(false);

        for (TranslationRequest t : request.getTranslations()) {
            question.getTranslations().add(buildTranslation(question, t));
        }

        return QuestionMapper.toResponse(questionRepository.save(question));
    }

    @Transactional(readOnly = true)
    public QuestionResponse get(UUID id) {
        return QuestionMapper.toResponse(getEntity(id));
    }

    @Transactional(readOnly = true)
    public Page<QuestionResponse> list(Pageable pageable, String examCode, UUID subjectId, UUID topicId, String difficulty) {
        return questionRepository
                .findAll(QuestionSpecifications.filter(examCode, subjectId, topicId, difficulty), pageable)
                .map(QuestionMapper::toResponse);
    }

    /**
     * Returns questions that changed (created, updated, or soft-deleted) after {@code since},
     * across every exam — the client always syncs the entire question bank and filters by exam
     * locally, so there's no exam parameter here. Ordered by updatedAt ascending so a client
     * resuming a paginated sync after a network drop can safely continue from the last
     * successfully-processed page.
     */
    @Transactional(readOnly = true)
    public Page<QuestionResponse> sync(String since, int page, int size) {
        OffsetDateTime sinceTimestamp = parseSince(since);
        int clampedSize = Math.min(Math.max(size, 1), MAX_SYNC_PAGE_SIZE);
        Pageable pageable = PageRequest.of(page, clampedSize, Sort.by("updatedAt").ascending());

        return questionRepository
                .findByUpdatedAtAfter(sinceTimestamp, pageable)
                .map(QuestionMapper::toResponse);
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

    public QuestionResponse update(UUID id, UpdateQuestionRequest request) {
        requireDifficultyExists(request.getDifficulty());

        Question question = getEntity(id);
        question.setCorrectAnswer(request.getCorrectAnswer());
        question.setTopic(requireTopic(request.getTopicId()));
        question.setDifficulty(request.getDifficulty());
        question.setExams(requireExams(request.getExamCodes()));
        question.setPremium(request.isPremium());
        question.setUpdatedAt(OffsetDateTime.now());
        return QuestionMapper.toResponse(questionRepository.save(question));
    }

    public QuestionResponse upsertTranslation(UUID questionId, String languageCode, UpsertTranslationRequest request) {
        Question question = getEntity(questionId);
        requireLanguageExists(languageCode);

        QuestionTranslation translation = translationRepository
                .findByQuestionIdAndLanguageCode(questionId, languageCode)
                .orElseGet(() -> {
                    QuestionTranslation t = new QuestionTranslation();
                    t.setQuestion(question);
                    t.setLanguage(languageRepository.getReferenceById(languageCode));
                    question.getTranslations().add(t);
                    return t;
                });

        translation.setQuestionText(request.getQuestionText());
        translation.setOptions(request.getOptions());
        translation.setExplanation(request.getExplanation());

        question.setUpdatedAt(OffsetDateTime.now());
        return QuestionMapper.toResponse(questionRepository.save(question));
    }

    public void delete(UUID id) {
        Question question = getEntity(id);
        question.setDeleted(true);
        question.setUpdatedAt(OffsetDateTime.now());
        questionRepository.save(question);
    }

    public BulkImportResponse bulkImport(List<BulkImportQuestionRequest> requests) {
        List<UUID> ids = new ArrayList<>();
        List<BulkImportFailure> failures = new ArrayList<>();

        for (int index = 0; index < requests.size(); index++) {
            BulkImportQuestionRequest request = requests.get(index);
            try {
                validateTranslations(request.getTranslations());

                requireDifficultyExists(request.getDifficulty());

                Question question = new Question();
                question.setCorrectAnswer(request.getCorrectAnswer());
                question.setTopic(resolveOrCreateTopic(request.getSubjectName(), request.getTopicName()));
                question.setDifficulty(request.getDifficulty());
                question.setExams(requireExams(request.getExamCodes()));
                question.setPremium(request.isPremium());
                question.setUpdatedAt(OffsetDateTime.now());
                question.setDeleted(false);

                for (TranslationRequest t : request.getTranslations()) {
                    question.getTranslations().add(buildTranslation(question, t));
                }

                ids.add(questionRepository.saveAndFlush(question).getId());
            } catch (RuntimeException e) {
                failures.add(new BulkImportFailure(index, e.getMessage()));
            }
        }

        return new BulkImportResponse(ids.size(), ids, failures);
    }

    public int bulkDelete(List<UUID> ids) {
        List<Question> questions = questionRepository.findAllById(ids);
        OffsetDateTime now = OffsetDateTime.now();
        for (Question question : questions) {
            question.setDeleted(true);
            question.setUpdatedAt(now);
        }
        questionRepository.saveAll(questions);
        return questions.size();
    }

    private Question getEntity(UUID id) {
        return questionRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Question not found: " + id));
    }

    private Topic requireTopic(UUID topicId) {
        return topicRepository.findById(topicId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown topicId: " + topicId));
    }

    /**
     * Bulk import resolves Subject/Topic by name, creating either if they don't exist yet —
     * content authors shouldn't need a separate step to register a new sub-topic before using it.
     */
    private Topic resolveOrCreateTopic(String subjectName, String topicName) {
        Subject subject = subjectRepository.findByNameIgnoreCase(subjectName)
                .orElseGet(() -> {
                    Subject s = new Subject();
                    s.setName(subjectName);
                    return subjectRepository.save(s);
                });
        return topicRepository.findBySubjectIdAndNameIgnoreCase(subject.getId(), topicName)
                .orElseGet(() -> {
                    Topic t = new Topic();
                    t.setSubject(subject);
                    t.setName(topicName);
                    return topicRepository.save(t);
                });
    }

    /**
     * Unlike Subject/Topic, exam codes must already exist — exams are curated (they carry
     * display metadata like images), so an unknown code fails the question rather than
     * silently creating a bare exam row.
     */
    private Set<Exam> requireExams(List<String> examCodes) {
        Set<Exam> exams = new HashSet<>();
        for (String code : examCodes) {
            Exam exam = examRepository.findById(code)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown exam code: " + code));
            exams.add(exam);
        }
        return exams;
    }

    private QuestionTranslation buildTranslation(Question question, TranslationRequest request) {
        requireLanguageExists(request.getLanguageCode());
        QuestionTranslation translation = new QuestionTranslation();
        translation.setQuestion(question);
        translation.setLanguage(languageRepository.getReferenceById(request.getLanguageCode()));
        translation.setQuestionText(request.getQuestionText());
        translation.setOptions(request.getOptions());
        translation.setExplanation(request.getExplanation());
        return translation;
    }

    private void requireLanguageExists(String languageCode) {
        if (!languageRepository.existsById(languageCode)) {
            throw new IllegalArgumentException("Unknown language code: " + languageCode);
        }
    }

    private void validateTranslations(List<TranslationRequest> translations) {
        boolean hasRootLanguage = translations.stream()
                .anyMatch(t -> ROOT_LANGUAGE.equals(t.getLanguageCode()));
        if (!hasRootLanguage) {
            throw new IllegalArgumentException("Translations must include the root language: " + ROOT_LANGUAGE);
        }
    }
}
