package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.BulkImportFailure;
import com.sarkaritaiyaari.backend.dto.BulkImportQuestionRequest;
import com.sarkaritaiyaari.backend.dto.BulkImportResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.PyqProvenanceCarrier;
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
import com.sarkaritaiyaari.backend.repository.ExamPaperRepository;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.LanguageRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.QuestionSpecifications;
import com.sarkaritaiyaari.backend.repository.QuestionTranslationRepository;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import org.springframework.beans.factory.annotation.Value;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

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

    /**
     * Temporary measure: while true, every public read (sync, live, counts, mock sampling)
     * is restricted to the ~500-question pool seeded by V9__temporary_question_pool.sql,
     * instead of the full ~37,900-question bank. Flip to false (or reseed the pool table
     * with more ids) to grow the pool later — no other code change needed.
     */
    @Value("${app.question-pool.temporary-enabled:true}")
    private boolean temporaryPoolEnabled;

    private final QuestionRepository questionRepository;
    private final QuestionTranslationRepository translationRepository;
    private final LanguageRepository languageRepository;
    private final TopicRepository topicRepository;
    private final SubjectRepository subjectRepository;
    private final ExamRepository examRepository;
    private final DifficultyLevelRepository difficultyLevelRepository;
    private final ExamPaperRepository examPaperRepository;
    private final DuplicateDetectionService duplicateDetection;

    public QuestionService(QuestionRepository questionRepository,
                            QuestionTranslationRepository translationRepository,
                            LanguageRepository languageRepository,
                            TopicRepository topicRepository,
                            SubjectRepository subjectRepository,
                            ExamRepository examRepository,
                            DifficultyLevelRepository difficultyLevelRepository,
                            ExamPaperRepository examPaperRepository,
                            DuplicateDetectionService duplicateDetection) {
        this.questionRepository = questionRepository;
        this.translationRepository = translationRepository;
        this.languageRepository = languageRepository;
        this.topicRepository = topicRepository;
        this.subjectRepository = subjectRepository;
        this.examRepository = examRepository;
        this.difficultyLevelRepository = difficultyLevelRepository;
        this.examPaperRepository = examPaperRepository;
        this.duplicateDetection = duplicateDetection;
    }

    /**
     * Copies PYQ provenance from any write request onto the entity (TICKET-2104).
     *
     * <p>One method for all three write paths - create, update and bulk import all carry the
     * same five fields via {@link PyqProvenanceCarrier}, and three copies of this would be
     * three places for the rules below to drift apart.
     *
     * <p>Two rules are enforced here rather than by bean validation, because both are
     * cross-field and a field-level annotation cannot express either:
     *
     * <ul>
     *   <li>Year/shift/paper/number are cleared when {@code pyq} is false. Otherwise
     *       un-ticking the PYQ box in the admin form would leave a stale 2019 on the row,
     *       still visible to {@code aggregatePyqByTopicAndYear}'s not-null year filter, and
     *       the topic would keep trending on a question nobody considers a PYQ.</li>
     *   <li>{@code sourcePaperId} must reference a real paper. It is a plain UUID column, not
     *       a mapped association, so nothing else would catch a bad id until the FK rejected
     *       it as an unmapped 500.</li>
     * </ul>
     */
    private void applyPyqProvenance(Question question, PyqProvenanceCarrier request) {
        question.setPyq(request.isPyq());

        if (!request.isPyq()) {
            question.setPyqYear(null);
            question.setPyqShift(null);
            question.setSourcePaperId(null);
            question.setQuestionNumber(null);
            // sourceUrl deliberately survives: it is where the question came from, which
            // stays true whether or not anyone has classified it as a previous-year one.
            question.setSourceUrl(blankToNull(request.getSourceUrl()));
            return;
        }

        question.setPyqYear(request.getPyqYear());
        question.setPyqShift(blankToNull(request.getPyqShift()));
        question.setQuestionNumber(request.getQuestionNumber());
        question.setSourceUrl(blankToNull(request.getSourceUrl()));

        UUID sourcePaperId = request.getSourcePaperId();
        if (sourcePaperId != null && !examPaperRepository.existsById(sourcePaperId)) {
            throw new IllegalArgumentException("Unknown sourcePaperId: " + sourcePaperId);
        }
        question.setSourcePaperId(sourcePaperId);
    }

    /** An empty string from a cleared form field means "not set", not "set to empty". */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
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

        applyPyqProvenance(question, request);

        for (TranslationRequest t : request.getTranslations()) {
            question.getTranslations().add(buildTranslation(question, t));
        }

        // Fingerprint before saving so the stored column is never briefly out of step with
        // the content, and detect afterwards so the new row has an id to record an edge for.
        duplicateDetection.refreshFingerprint(question);
        Question saved = questionRepository.save(question);
        UUID duplicateOf = duplicateDetection.detectAndRecord(saved);

        QuestionResponse response = QuestionMapper.toResponse(saved);
        // Reported, not blocked. Supplied section 14: a detected duplicate is recorded for
        // review, never auto-rejected - two questions can share wording and still differ,
        // and refusing the write would make a legitimate one impossible to enter at all.
        if (duplicateOf != null) {
            response.setDuplicateOfQuestionIds(List.of(duplicateOf));
        }
        return response;
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
                .findByUpdatedAtAfter(sinceTimestamp, temporaryPoolEnabled, pageable)
                .map(QuestionMapper::toResponse);
    }

    private static final int MAX_LIVE_PAGE_SIZE = 500;
    private static final int MAX_MOCK_SAMPLE_SIZE = 200;

    /**
     * Backs the mobile app's hybrid online/local data layer: while a device's first-ever
     * sync is still catching up (or if it's never completed), screens read live from here
     * instead of local SQLite. Same filter predicate as the admin CRUD list ({@link #list}),
     * but student-facing, so soft-deleted questions are excluded — {@link #list} deliberately
     * doesn't exclude them, since admins need to see/restore deleted rows.
     */
    @Transactional(readOnly = true)
    public Page<QuestionResponse> listPublic(String examCode, UUID subjectId, UUID topicId, String difficulty, int page, int size) {
        int clampedSize = Math.min(Math.max(size, 1), MAX_LIVE_PAGE_SIZE);
        var spec = QuestionSpecifications.filter(examCode, subjectId, topicId, difficulty)
                .and(QuestionSpecifications.notDeleted());
        if (temporaryPoolEnabled) {
            spec = spec.and(QuestionSpecifications.inTemporaryPool());
        }
        return questionRepository.findAll(spec, PageRequest.of(page, clampedSize)).map(QuestionMapper::toResponse);
    }

    /**
     * Grouped counts (per exam/subject/topic/difficulty) for the hybrid layer's "how many
     * questions does this subject/topic have" screens — the live equivalent of the local
     * SQLite joins in mobile/src/db/practiceContent.ts (getSubjectStats/getTopicStats/etc).
     */
    @Transactional(readOnly = true)
    public Map<String, Long> countsGroupedBy(String groupBy, String examCode, UUID subjectId, UUID topicId, String difficulty) {
        return questionRepository.countGroupedBy(groupBy, examCode, subjectId, topicId, difficulty, temporaryPoolEnabled);
    }

    /** Live equivalent of mobile/src/db/mockTest.ts's countAvailable() — per-section question availability before local sync completes. */
    @Transactional(readOnly = true)
    public long countForMock(String examCode, List<UUID> subjectIds) {
        return questionRepository.countForMock(examCode, subjectIds, temporaryPoolEnabled);
    }

    /** Live equivalent of mobile/src/db/mockTest.ts's buildMockTestQuestions() per-section query — a genuinely random sample, not just the first N matches. */
    @Transactional(readOnly = true)
    public List<QuestionResponse> sampleForMock(String examCode, List<UUID> subjectIds, int limit) {
        int clampedLimit = Math.min(Math.max(limit, 1), MAX_MOCK_SAMPLE_SIZE);
        return questionRepository.sampleForMock(examCode, subjectIds, clampedLimit, temporaryPoolEnabled).stream()
                .map(QuestionMapper::toResponse)
                .toList();
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
        applyPyqProvenance(question, request);
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

        /*
         * Editing the English text changes what the fingerprint describes. Without this the column
         * silently describes the *previous* wording, and dedup starts comparing against text that
         * no longer exists anywhere.
         *
         * The text is resolved explicitly rather than by reading question.getTranslations(). That
         * collection is a lazy bag with orphanRemoval, and initialising it here - after the new
         * translation above was added to it - made Hibernate compute orphans against a stale
         * snapshot and throw TransientObjectException, turning every add-a-new-language request
         * into a 500. Caught by QuestionCrudTest, not by reading the code.
         */
        String englishText = ROOT_LANGUAGE.equals(languageCode)
                ? request.getQuestionText()
                : translationRepository.findByQuestionIdAndLanguageCode(questionId, ROOT_LANGUAGE)
                        .map(QuestionTranslation::getQuestionText)
                        .orElse(null);
        duplicateDetection.setFingerprintFromText(question, englishText);

        question.setUpdatedAt(OffsetDateTime.now());
        return QuestionMapper.toResponse(questionRepository.save(question));
    }

    public void delete(UUID id) {
        Question question = getEntity(id);
        question.setDeleted(true);
        question.setUpdatedAt(OffsetDateTime.now());
        questionRepository.save(question);
    }

    /**
     * Pre-loads every lookup a row might need once, up front, instead of re-querying per
     * row. Before this, a batch of N questions cost roughly 8-10 round trips per row
     * (difficulty check, subject lookup, topic lookup, one exam lookup per exam code,
     * one language check per translation) — against the real remote Postgres this made
     * a 500-question import take minutes rather than seconds, discovered while seeding
     * load-test data for TICKET-501 (see reports/12-load-test-data-seeding/). This is
     * the same class of N+1 problem already fixed once for the sync endpoint.
     *
     * Flushing is batched every {@link #FLUSH_BATCH_SIZE} rows rather than every row —
     * flushing per row left Hibernate's JDBC batching (see application.yml) with only
     * one row's statements to work with at a time, so it barely helped. Every failure
     * mode this method actually validates for (difficulty, language, exam code, missing
     * root-language translation) is checked *before* `save()`, so a periodic flush
     * failing here means a genuine, previously-unvalidated DB-level problem — rare
     * enough that reporting the whole pending chunk as failed, rather than trying to
     * isolate the exact row, is an acceptable trade for not paying a per-row round trip
     * on every one of what could be thousands of rows.
     */
    private static final int FLUSH_BATCH_SIZE = 50;

    public BulkImportResponse bulkImport(List<BulkImportQuestionRequest> requests) {
        List<UUID> ids = new ArrayList<>();
        List<BulkImportFailure> failures = new ArrayList<>();
        List<Integer> pendingIndexes = new ArrayList<>();
        // Collected so duplicate detection runs once for the whole batch instead of once per
        // row - see DuplicateDetectionService.detectAndRecordBatch for why that matters here
        // specifically.
        List<Question> imported = new ArrayList<>();

        Set<String> validDifficulties = difficultyLevelRepository.findAll().stream()
                .map(d -> d.getCode()).collect(Collectors.toSet());
        Set<String> validLanguages = languageRepository.findAll().stream()
                .map(l -> l.getCode()).collect(Collectors.toSet());
        Map<String, Exam> examCache = examRepository.findAll().stream()
                .collect(Collectors.toMap(Exam::getCode, e -> e));
        Map<String, Subject> subjectCache = subjectRepository.findAll().stream()
                .collect(Collectors.toMap(s -> s.getName().toLowerCase(Locale.ROOT), s -> s, (a, b) -> a));
        Map<String, Topic> topicCache = topicRepository.findAll().stream()
                .collect(Collectors.toMap(this::topicCacheKey, t -> t, (a, b) -> a));

        for (int index = 0; index < requests.size(); index++) {
            BulkImportQuestionRequest request = requests.get(index);
            try {
                validateTranslations(request.getTranslations());

                if (!validDifficulties.contains(request.getDifficulty())) {
                    throw new IllegalArgumentException("Unknown difficulty: " + request.getDifficulty());
                }
                for (TranslationRequest t : request.getTranslations()) {
                    if (!validLanguages.contains(t.getLanguageCode())) {
                        throw new IllegalArgumentException("Unknown language code: " + t.getLanguageCode());
                    }
                }

                Question question = new Question();
                question.setCorrectAnswer(request.getCorrectAnswer());
                question.setTopic(resolveOrCreateTopic(request.getSubjectName(), request.getTopicName(), subjectCache, topicCache));
                question.setDifficulty(request.getDifficulty());
                question.setExams(requireExams(request.getExamCodes(), examCache));
                question.setPremium(request.isPremium());
                question.setUpdatedAt(OffsetDateTime.now());
                question.setDeleted(false);

                applyPyqProvenance(question, request);

                for (TranslationRequest t : request.getTranslations()) {
                    QuestionTranslation translation = new QuestionTranslation();
                    translation.setQuestion(question);
                    translation.setLanguage(languageRepository.getReferenceById(t.getLanguageCode()));
                    translation.setQuestionText(t.getQuestionText());
                    translation.setOptions(t.getOptions());
                    translation.setExplanation(t.getExplanation());
                    question.getTranslations().add(translation);
                }

                duplicateDetection.refreshFingerprint(question);
                Question savedQuestion = questionRepository.save(question);
                imported.add(savedQuestion);
                ids.add(savedQuestion.getId());
                pendingIndexes.add(index);
                if (pendingIndexes.size() >= FLUSH_BATCH_SIZE) {
                    flushPending(pendingIndexes, ids, failures);
                }
            } catch (RuntimeException e) {
                failures.add(new BulkImportFailure(index, e.getMessage()));
            }
        }
        flushPending(pendingIndexes, ids, failures);

        // After the final flush, so every row has a real id, and only for rows that actually
        // survived (a failed chunk removes its ids above, and detecting against a rolled-back
        // row would record an edge pointing at a question that does not exist).
        Map<UUID, UUID> duplicatePairs = Map.of();
        if (!imported.isEmpty()) {
            List<Question> survived = imported.stream().filter(q -> ids.contains(q.getId())).toList();
            if (!survived.isEmpty()) {
                duplicatePairs = duplicateDetection.detectAndRecordBatch(survived);
            }
        }

        return new BulkImportResponse(ids.size(), ids, failures, duplicatePairs);
    }

    private void flushPending(List<Integer> pendingIndexes, List<UUID> ids, List<BulkImportFailure> failures) {
        if (pendingIndexes.isEmpty()) return;
        try {
            questionRepository.flush();
        } catch (RuntimeException e) {
            int chunkSize = pendingIndexes.size();
            for (int idx : pendingIndexes) {
                failures.add(new BulkImportFailure(idx, "Batch write failed: " + e.getMessage()));
            }
            ids.subList(ids.size() - chunkSize, ids.size()).clear();
        } finally {
            pendingIndexes.clear();
        }
    }

    private String topicCacheKey(Topic topic) {
        return topic.getSubject().getId() + "|" + topic.getName().toLowerCase(Locale.ROOT);
    }

    /**
     * Bulk import resolves Subject/Topic by name, creating either if they don't exist yet —
     * content authors shouldn't need a separate step to register a new sub-topic before
     * using it. Cache-backed so a name repeated across many rows in the same batch (the
     * common case) costs one lookup, not one per row.
     */
    private Topic resolveOrCreateTopic(String subjectName, String topicName,
                                        Map<String, Subject> subjectCache, Map<String, Topic> topicCache) {
        Subject subject = subjectCache.computeIfAbsent(subjectName.toLowerCase(Locale.ROOT), key -> {
            Subject s = new Subject();
            s.setName(subjectName);
            return subjectRepository.save(s);
        });
        String topicKey = subject.getId() + "|" + topicName.toLowerCase(Locale.ROOT);
        return topicCache.computeIfAbsent(topicKey, key -> {
            Topic t = new Topic();
            t.setSubject(subject);
            t.setName(topicName);
            return topicRepository.save(t);
        });
    }

    private Set<Exam> requireExams(List<String> examCodes, Map<String, Exam> examCache) {
        Set<Exam> exams = new HashSet<>();
        for (String code : examCodes) {
            Exam exam = examCache.get(code);
            if (exam == null) {
                throw new IllegalArgumentException("Unknown exam code: " + code);
            }
            exams.add(exam);
        }
        return exams;
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
