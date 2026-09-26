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
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.QuestionGroup;
import com.sarkaritaiyaari.backend.entity.QuestionMedia;
import com.sarkaritaiyaari.backend.entity.QuestionOccurrence;
import com.sarkaritaiyaari.backend.entity.QuestionTranslation;
import com.sarkaritaiyaari.backend.entity.QuestionType;
import com.sarkaritaiyaari.backend.entity.QuestionTypeCode;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.repository.DifficultyLevelRepository;
import com.sarkaritaiyaari.backend.repository.ExamPaperRepository;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.LanguageRepository;
import com.sarkaritaiyaari.backend.repository.QuestionGroupRepository;
import com.sarkaritaiyaari.backend.repository.QuestionMediaRepository;
import com.sarkaritaiyaari.backend.repository.QuestionOccurrenceRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.QuestionSpecifications;
import com.sarkaritaiyaari.backend.repository.QuestionTranslationRepository;
import com.sarkaritaiyaari.backend.repository.QuestionTypeRepository;
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
import java.util.LinkedHashMap;
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
    private final QuestionTypeRepository questionTypeRepository;
    private final DuplicateDetectionService duplicateDetection;
    private final QuestionGroupRepository questionGroupRepository;
    private final QuestionMediaRepository questionMediaRepository;
    private final QuestionOccurrenceRepository questionOccurrenceRepository;

    public QuestionService(QuestionRepository questionRepository,
                            QuestionTranslationRepository translationRepository,
                            LanguageRepository languageRepository,
                            TopicRepository topicRepository,
                            SubjectRepository subjectRepository,
                            ExamRepository examRepository,
                            DifficultyLevelRepository difficultyLevelRepository,
                            ExamPaperRepository examPaperRepository,
                            QuestionTypeRepository questionTypeRepository,
                            DuplicateDetectionService duplicateDetection,
                            QuestionGroupRepository questionGroupRepository,
                            QuestionMediaRepository questionMediaRepository,
                            QuestionOccurrenceRepository questionOccurrenceRepository) {
        this.questionRepository = questionRepository;
        this.translationRepository = translationRepository;
        this.languageRepository = languageRepository;
        this.topicRepository = topicRepository;
        this.subjectRepository = subjectRepository;
        this.examRepository = examRepository;
        this.difficultyLevelRepository = difficultyLevelRepository;
        this.examPaperRepository = examPaperRepository;
        this.questionTypeRepository = questionTypeRepository;
        this.duplicateDetection = duplicateDetection;
        this.questionGroupRepository = questionGroupRepository;
        this.questionMediaRepository = questionMediaRepository;
        this.questionOccurrenceRepository = questionOccurrenceRepository;
    }

    /* ------------------------------------------- Shared content / groups (V29, TASK-2301 Phase P3) */

    /**
     * Null for no group, matching {@link CreateQuestionRequest#getQuestionGroupId()}'s own
     * "organisational, not evaluator-critical" note — a bad id is still rejected, just not
     * treated as fixed at creation.
     */
    private QuestionGroup requireQuestionGroupOrNull(UUID questionGroupId) {
        if (questionGroupId == null) {
            return null;
        }
        QuestionGroup group = questionGroupRepository.findById(questionGroupId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown questionGroupId: " + questionGroupId));
        if (group.isDeleted()) {
            throw new IllegalArgumentException("questionGroupId refers to a deleted group: " + questionGroupId);
        }
        return group;
    }

    /**
     * One batch query for a whole page of questions instead of one per row — the same N+1
     * defence this codebase has already applied to translations/exams via Hibernate's
     * {@code default_batch_fetch_size}, needed here explicitly because {@link Question} has
     * no entity-level association to {@link QuestionMedia} to batch-fetch automatically.
     */
    private Map<UUID, List<QuestionMedia>> mediaByQuestionId(List<UUID> questionIds) {
        if (questionIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<QuestionMedia>> result = new HashMap<>();
        for (QuestionMedia media : questionMediaRepository.findByQuestionIdInAndDeletedFalse(questionIds)) {
            result.computeIfAbsent(media.getQuestion().getId(), id -> new ArrayList<>()).add(media);
        }
        return result;
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

    /* ------------------------------------------------- Question occurrences (TASK-2501 Phase 1) */

    /**
     * Keeps the new {@code question_occurrences} table from drifting apart from the legacy
     * singular PYQ columns {@link #applyPyqProvenance} already wrote onto {@code saved}. Called
     * once after each of the three save points that touch PYQ provenance (create/update/each
     * bulk-import row) — post-save, so {@code saved.getId()} is populated.
     *
     * <p>Replaces this question's single {@code is_legacy_derived} row wholesale rather than
     * patching it in place: simpler than diffing five nullable fields, and safe because this
     * method never touches any *other* occurrence (an explicitly-added extra appearance, or one
     * the ingestion pipeline created) — see {@link QuestionOccurrence#isLegacyDerived()}'s own
     * note on why that flag exists.
     */
    private void syncLegacyOccurrence(Question saved, PyqProvenanceCarrier request) {
        questionOccurrenceRepository.deleteByQuestion_IdAndLegacyDerivedTrue(saved.getId());
        if (!request.isPyq()) {
            return;
        }
        boolean hasIdentifyingField = request.getPyqYear() != null || request.getPyqShift() != null
                || request.getSourcePaperId() != null || request.getQuestionNumber() != null
                || (request.getSourceUrl() != null && !request.getSourceUrl().isBlank());
        if (!hasIdentifyingField) {
            return;
        }

        QuestionOccurrence occurrence = new QuestionOccurrence();
        occurrence.setQuestion(saved);
        occurrence.setExamCode(singleExamCodeOrNull(saved));
        occurrence.setPyqYear(saved.getPyqYear());
        occurrence.setPyqShift(saved.getPyqShift());
        occurrence.setSourcePaperId(saved.getSourcePaperId());
        occurrence.setQuestionNumber(saved.getQuestionNumber());
        occurrence.setSourceUrl(saved.getSourceUrl());
        occurrence.setLegacyDerived(true);
        occurrence.setCreatedAt(OffsetDateTime.now());
        questionOccurrenceRepository.save(occurrence);
    }

    /** Best-effort single exam code, matching V36's own backfill rule — left null when the question maps to zero or several exams. */
    private static String singleExamCodeOrNull(Question question) {
        Set<Exam> exams = question.getExams();
        return exams.size() == 1 ? exams.iterator().next().getCode() : null;
    }

    /** Same batching reasoning as {@link #mediaByQuestionId} — one query for a whole page, not one per row. */
    private Map<UUID, List<QuestionOccurrence>> occurrencesByQuestionId(List<UUID> questionIds) {
        if (questionIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<QuestionOccurrence>> result = new HashMap<>();
        for (QuestionOccurrence occurrence : questionOccurrenceRepository.findByQuestion_IdIn(questionIds)) {
            result.computeIfAbsent(occurrence.getQuestion().getId(), id -> new ArrayList<>()).add(occurrence);
        }
        return result;
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

    /* ------------------------------------- Multi-type question foundation (V25/V26, TASK-2301) */

    /** {@code correct_answer} (always populated, for the legacy column and admin list display) plus the structured {@code answer_key}. */
    private record ResolvedAnswer(String correctAnswer, Map<String, Object> answerKey) {
    }

    /**
     * Derives the structured SINGLE_CHOICE answer key from {@code correct_answer} — the same
     * two-tier resolution the mobile client already uses at read time
     * ({@code mobile/src/db/answerResolution.ts}'s {@code resolveCorrectIndex}) and the admin
     * form uses at edit time ({@code toAnswerLetter}), run here at write time instead so
     * {@code answer_key} never drifts from {@code correct_answer}. Returns {@code null},
     * deliberately, when neither a letter nor a text match resolves — matching
     * {@code resolveCorrectIndex}'s refusal to invent an answer rather than silently
     * defaulting to option A.
     */
    private static Map<String, Object> deriveSingleChoiceAnswerKey(String correctAnswer, List<String> englishOptions) {
        if (correctAnswer == null) {
            return null;
        }
        String trimmed = correctAnswer.trim();
        String upper = trimmed.toUpperCase(Locale.ROOT);
        if (upper.length() == 1 && upper.charAt(0) >= 'A' && upper.charAt(0) <= 'D') {
            return Map.of("correctOption", upper.charAt(0) - 'A');
        }
        if (englishOptions != null) {
            int index = englishOptions.indexOf(trimmed);
            if (index >= 0) {
                return Map.of("correctOption", index);
            }
        }
        return null;
    }

    /**
     * Resolves the answer for any of the nine types authorable today (V26/V27, TASK-2301
     * Phase P2 Wave A/B). SINGLE_CHOICE/ASSERTION_REASON/STATEMENT_COMBINATION are all
     * genuinely single-index answers under the hood, so they share the P1 path unchanged.
     * Every other type has no letter to derive from — its {@code answerKey} is the source of
     * truth, submitted directly by the caller, and {@code correct_answer} becomes a computed
     * display string so the legacy column — and anything still reading it, like the admin
     * question list — keeps showing something meaningful rather than going blank.
     * {@code contentStructure} is only read by MATCH/ORDERING, to validate {@code answerKey}
     * references real keys rather than an id that doesn't exist.
     */
    private ResolvedAnswer resolveAnswer(String questionType, String correctAnswer,
                                          Map<String, Object> requestAnswerKey, List<String> englishOptions,
                                          Map<String, Object> contentStructure) {
        return switch (questionType) {
            case "MULTIPLE_CHOICE" -> {
                Object raw = requestAnswerKey == null ? null : requestAnswerKey.get("correctOptions");
                if (!(raw instanceof List<?> list) || list.isEmpty()) {
                    throw new IllegalArgumentException("answerKey.correctOptions is required for MULTIPLE_CHOICE and must be non-empty");
                }
                List<Integer> indices = list.stream()
                        .map(o -> {
                            if (!(o instanceof Number n)) {
                                throw new IllegalArgumentException("answerKey.correctOptions must contain numbers");
                            }
                            return n.intValue();
                        })
                        .distinct()
                        .sorted()
                        .toList();
                String display = indices.stream()
                        .map(i -> String.valueOf((char) ('A' + i)))
                        .collect(Collectors.joining(","));
                yield new ResolvedAnswer(display, Map.of("correctOptions", indices));
            }
            case "TRUE_FALSE" -> {
                Object raw = requestAnswerKey == null ? null : requestAnswerKey.get("correctBoolean");
                if (!(raw instanceof Boolean correctBoolean)) {
                    throw new IllegalArgumentException("answerKey.correctBoolean is required for TRUE_FALSE");
                }
                yield new ResolvedAnswer(correctBoolean ? "TRUE" : "FALSE", Map.of("correctBoolean", correctBoolean));
            }
            case "NUMERIC" -> {
                Object rawValue = requestAnswerKey == null ? null : requestAnswerKey.get("correctValue");
                if (!(rawValue instanceof Number correctValue)) {
                    throw new IllegalArgumentException("answerKey.correctValue is required for NUMERIC and must be a number");
                }
                Object rawTolerance = requestAnswerKey.get("tolerance");
                double tolerance = 0.0;
                if (rawTolerance != null) {
                    if (!(rawTolerance instanceof Number toleranceNumber) || toleranceNumber.doubleValue() < 0) {
                        throw new IllegalArgumentException("answerKey.tolerance must be a non-negative number");
                    }
                    tolerance = toleranceNumber.doubleValue();
                }
                yield new ResolvedAnswer(formatNumericAnswer(correctValue),
                        Map.of("correctValue", correctValue.doubleValue(), "tolerance", tolerance));
            }
            case "FILL_BLANK" -> {
                Object raw = requestAnswerKey == null ? null : requestAnswerKey.get("acceptedAnswers");
                if (!(raw instanceof List<?> list) || list.isEmpty()) {
                    throw new IllegalArgumentException("answerKey.acceptedAnswers is required for FILL_BLANK and must be non-empty");
                }
                List<String> accepted = list.stream().map(o -> {
                    if (!(o instanceof String s) || s.isBlank()) {
                        throw new IllegalArgumentException("answerKey.acceptedAnswers must contain only non-blank strings");
                    }
                    return s.trim();
                }).toList();
                yield new ResolvedAnswer(String.join(" / ", accepted), Map.of("acceptedAnswers", accepted));
            }
            case "MATCH" -> {
                List<String> leftKeys = stringList(contentStructure, "leftKeys");
                List<String> rightKeys = stringList(contentStructure, "rightKeys");
                Object raw = requestAnswerKey == null ? null : requestAnswerKey.get("correctMapping");
                if (!(raw instanceof Map<?, ?> mapping)) {
                    throw new IllegalArgumentException("answerKey.correctMapping is required for MATCH");
                }
                Map<String, String> correctMapping = new LinkedHashMap<>();
                for (String leftKey : leftKeys) {
                    Object value = mapping.get(leftKey);
                    if (!(value instanceof String rightKey) || !rightKeys.contains(rightKey)) {
                        throw new IllegalArgumentException(
                                "answerKey.correctMapping must map every leftKey to one of rightKeys (missing or invalid: " + leftKey + ")");
                    }
                    correctMapping.put(leftKey, rightKey);
                }
                String display = correctMapping.entrySet().stream()
                        .map(e -> e.getKey() + "-" + e.getValue())
                        .collect(Collectors.joining(","));
                yield new ResolvedAnswer(display, Map.of("correctMapping", correctMapping));
            }
            case "ORDERING" -> {
                List<String> itemKeys = stringList(contentStructure, "itemKeys");
                Object raw = requestAnswerKey == null ? null : requestAnswerKey.get("correctOrder");
                if (!(raw instanceof List<?> list) || list.size() != itemKeys.size()) {
                    throw new IllegalArgumentException("answerKey.correctOrder is required for ORDERING and must list every itemKey exactly once");
                }
                List<String> correctOrder = list.stream().map(o -> {
                    if (!(o instanceof String s)) {
                        throw new IllegalArgumentException("answerKey.correctOrder must contain only strings");
                    }
                    return s;
                }).toList();
                if (correctOrder.size() != new HashSet<>(correctOrder).size() || !new HashSet<>(correctOrder).equals(new HashSet<>(itemKeys))) {
                    throw new IllegalArgumentException("answerKey.correctOrder must be a permutation of contentStructure.itemKeys");
                }
                yield new ResolvedAnswer(String.join(",", correctOrder), Map.of("correctOrder", correctOrder));
            }
            default -> { // SINGLE_CHOICE, ASSERTION_REASON, STATEMENT_COMBINATION
                if (correctAnswer == null || correctAnswer.isBlank()) {
                    throw new IllegalArgumentException("correctAnswer is required for " + questionType);
                }
                yield new ResolvedAnswer(correctAnswer, deriveSingleChoiceAnswerKey(correctAnswer, englishOptions));
            }
        };
    }

    /** Drops a pointless ".0" for a whole-number NUMERIC answer, e.g. "42" not "42.0". */
    private static String formatNumericAnswer(Number value) {
        double d = value.doubleValue();
        if (d == Math.floor(d) && !Double.isInfinite(d)) {
            return String.valueOf((long) d);
        }
        return String.valueOf(d);
    }

    /**
     * The language-independent skeleton's own shape, by type (V27, TASK-2301 Phase P2 Wave
     * B). A no-op for every type except MATCH/ORDERING — see {@link CreateQuestionRequest}'s
     * own note on why the field exists only there, not on update.
     */
    private static void validateContentStructure(String questionType, Map<String, Object> contentStructure) {
        if ("MATCH".equals(questionType)) {
            List<String> leftKeys = stringList(contentStructure, "leftKeys");
            List<String> rightKeys = stringList(contentStructure, "rightKeys");
            if (leftKeys.size() < 2 || rightKeys.size() < 2) {
                throw new IllegalArgumentException("MATCH requires contentStructure.leftKeys and rightKeys, each with at least 2 entries");
            }
            if (new HashSet<>(leftKeys).size() != leftKeys.size() || new HashSet<>(rightKeys).size() != rightKeys.size()) {
                throw new IllegalArgumentException("MATCH's leftKeys and rightKeys must each contain distinct entries");
            }
        } else if ("ORDERING".equals(questionType)) {
            List<String> itemKeys = stringList(contentStructure, "itemKeys");
            if (itemKeys.size() < 2) {
                throw new IllegalArgumentException("ORDERING requires contentStructure.itemKeys with at least 2 entries");
            }
            if (new HashSet<>(itemKeys).size() != itemKeys.size()) {
                throw new IllegalArgumentException("ORDERING's itemKeys must contain distinct entries");
            }
        }
    }

    /** A required list-of-non-blank-strings field, read from either contentStructure or content. */
    private static List<String> stringList(Map<String, Object> map, String key) {
        Object raw = map == null ? null : map.get(key);
        if (!(raw instanceof List<?> list)) {
            throw new IllegalArgumentException("contentStructure." + key + " is required and must be a list of strings");
        }
        return list.stream().map(o -> {
            if (!(o instanceof String s) || s.isBlank()) {
                throw new IllegalArgumentException("contentStructure." + key + " must contain only non-blank strings");
            }
            return s;
        }).toList();
    }

    /** Every key in {@code keys} must have a non-blank label in {@code content.get(labelsField)}. */
    private static void requireLabelsCoverKeys(Map<String, Object> content, String labelsField, List<String> keys) {
        Object raw = content == null ? null : content.get(labelsField);
        if (!(raw instanceof Map<?, ?> labels)) {
            throw new IllegalArgumentException("content." + labelsField + " is required");
        }
        for (String key : keys) {
            Object label = labels.get(key);
            if (!(label instanceof String s) || s.isBlank()) {
                throw new IllegalArgumentException("content." + labelsField + " is missing a non-blank label for \"" + key + "\"");
            }
        }
    }

    /**
     * A question's type must exist as real data (an admin can disable one) and be a code the
     * Java side actually knows how to evaluate and render — the "table can disable a type,
     * never invent one" defence from the architecture proposal, enforced here as the one
     * place every authoring path passes through.
     */
    private void requireQuestionTypeAuthoringEnabled(String questionType) {
        try {
            QuestionTypeCode.valueOf(questionType);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown question type: " + questionType);
        }
        QuestionType type = questionTypeRepository.findById(questionType)
                .orElseThrow(() -> new IllegalArgumentException("Unknown question type: " + questionType));
        if (!type.isAuthoringEnabled()) {
            throw new IllegalArgumentException("Question type is not enabled for authoring: " + questionType);
        }
    }

    /** The "en" translation's options from a write request that carries its own translations (create, bulk import). */
    private static List<String> englishOptions(List<TranslationRequest> translations) {
        return translations.stream()
                .filter(t -> ROOT_LANGUAGE.equals(t.getLanguageCode()))
                .findFirst()
                .map(TranslationRequest::getOptions)
                .orElse(null);
    }

    /** The "en" translation's options already loaded on an entity — used by {@code update}, which does not touch translations. */
    private static List<String> englishOptions(Question question) {
        return question.getTranslations().stream()
                .filter(t -> ROOT_LANGUAGE.equals(t.getLanguage().getCode()))
                .findFirst()
                .map(QuestionTranslation::getOptions)
                .orElse(null);
    }

    public QuestionResponse create(CreateQuestionRequest request) {
        String questionType = request.getQuestionType() == null ? "SINGLE_CHOICE" : request.getQuestionType();
        requireQuestionTypeAuthoringEnabled(questionType);
        validateContentStructure(questionType, request.getContentStructure());
        validateTranslations(request.getTranslations(), questionType, request.getContentStructure());

        requireDifficultyExists(request.getDifficulty());

        ResolvedAnswer answer = resolveAnswer(questionType, request.getCorrectAnswer(), request.getAnswerKey(),
                englishOptions(request.getTranslations()), request.getContentStructure());

        Question question = new Question();
        question.setCorrectAnswer(answer.correctAnswer());
        question.setTopic(requireTopic(request.getTopicId()));
        question.setDifficulty(request.getDifficulty());
        question.setExams(requireExams(request.getExamCodes()));
        question.setPremium(request.isPremium());
        question.setUpdatedAt(OffsetDateTime.now());
        question.setDeleted(false);
        question.setQuestionType(questionType);
        question.setAnswerKey(answer.answerKey());
        question.setContentStructure(request.getContentStructure());
        question.setQuestionGroup(requireQuestionGroupOrNull(request.getQuestionGroupId()));
        question.setGroupOrder(request.getQuestionGroupId() == null ? null : request.getGroupOrder());

        applyPyqProvenance(question, request);

        for (TranslationRequest t : request.getTranslations()) {
            question.getTranslations().add(buildTranslation(question, t));
        }

        // Fingerprint before saving so the stored column is never briefly out of step with
        // the content, and detect afterwards so the new row has an id to record an edge for.
        duplicateDetection.refreshFingerprint(question);
        Question saved = questionRepository.save(question);
        syncLegacyOccurrence(saved, request);
        UUID duplicateOf = duplicateDetection.detectAndRecord(saved);

        QuestionResponse response = QuestionMapper.toResponse(saved, List.of(),
                questionOccurrenceRepository.findByQuestion_IdOrderByCreatedAtAsc(saved.getId()));
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
        Question question = getEntity(id);
        return QuestionMapper.toResponse(question,
                questionMediaRepository.findByQuestionIdAndDeletedFalseOrderByDisplayOrderAsc(id),
                questionOccurrenceRepository.findByQuestion_IdOrderByCreatedAtAsc(id));
    }

    @Transactional(readOnly = true)
    public Page<QuestionResponse> list(Pageable pageable, String examCode, UUID subjectId, UUID topicId, String difficulty) {
        Page<Question> page = questionRepository
                .findAll(QuestionSpecifications.filter(examCode, subjectId, topicId, difficulty), pageable);
        List<UUID> ids = page.getContent().stream().map(Question::getId).toList();
        Map<UUID, List<QuestionMedia>> media = mediaByQuestionId(ids);
        Map<UUID, List<QuestionOccurrence>> occurrences = occurrencesByQuestionId(ids);
        return page.map(q -> QuestionMapper.toResponse(q, media.getOrDefault(q.getId(), List.of()),
                occurrences.getOrDefault(q.getId(), List.of())));
    }

    /**
     * The one place "a client that declares nothing" is defined (V29, TASK-2301 Phase P3) —
     * exactly what every client received before any type beyond SINGLE_CHOICE existed, so an
     * app built before this mechanism keeps working unchanged rather than silently losing a
     * type it never learned to render.
     */
    private static final List<String> DEFAULT_SUPPORTED_TYPES = List.of(QuestionTypeCode.SINGLE_CHOICE.name());

    /** Blank/omitted becomes the pre-negotiation default; anything else is used as sent, not validated against {@code question_types} — an unknown type just matches nothing. */
    private static List<String> resolveSupportedTypes(String supportedTypes) {
        if (supportedTypes == null || supportedTypes.isBlank()) {
            return DEFAULT_SUPPORTED_TYPES;
        }
        return List.of(supportedTypes.split(","));
    }

    /**
     * Returns questions that changed (created, updated, or soft-deleted) after {@code since},
     * across every exam — the client always syncs the entire question bank and filters by exam
     * locally, so there's no exam parameter here. Ordered by updatedAt ascending so a client
     * resuming a paginated sync after a network drop can safely continue from the last
     * successfully-processed page.
     */
    @Transactional(readOnly = true)
    public Page<QuestionResponse> sync(String since, int page, int size, String supportedTypes) {
        OffsetDateTime sinceTimestamp = parseSince(since);
        int clampedSize = Math.min(Math.max(size, 1), MAX_SYNC_PAGE_SIZE);
        Pageable pageable = PageRequest.of(page, clampedSize, Sort.by("updatedAt").ascending());

        Page<Question> result = questionRepository
                .findByUpdatedAtAfter(sinceTimestamp, temporaryPoolEnabled, resolveSupportedTypes(supportedTypes), pageable);
        Map<UUID, List<QuestionMedia>> media = mediaByQuestionId(result.getContent().stream().map(Question::getId).toList());
        return result.map(q -> QuestionMapper.toResponse(q, media.getOrDefault(q.getId(), List.of())));
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
    public Page<QuestionResponse> listPublic(String examCode, UUID subjectId, UUID topicId, String difficulty, int page, int size,
                                              String supportedTypes) {
        int clampedSize = Math.min(Math.max(size, 1), MAX_LIVE_PAGE_SIZE);
        var spec = QuestionSpecifications.filter(examCode, subjectId, topicId, difficulty)
                .and(QuestionSpecifications.notDeleted())
                .and(QuestionSpecifications.published())
                .and(QuestionSpecifications.typeIn(resolveSupportedTypes(supportedTypes)));
        if (temporaryPoolEnabled) {
            spec = spec.and(QuestionSpecifications.inTemporaryPool());
        }
        Page<Question> result = questionRepository.findAll(spec, PageRequest.of(page, clampedSize));
        Map<UUID, List<QuestionMedia>> media = mediaByQuestionId(result.getContent().stream().map(Question::getId).toList());
        return result.map(q -> QuestionMapper.toResponse(q, media.getOrDefault(q.getId(), List.of())));
    }

    private static final int MAX_BY_IDS_SIZE = 100;

    /**
     * Batch hydration for a client with no local question bank of its own — the web app (
     * TASK-2601 Phase 3) uses this to turn a bare {@code questionId} from a session/attempt
     * review or a bookmark into real content, the same join mobile does against its local
     * SQLite copy. Same visibility rule as {@link #listPublic}: soft-deleted and non-PUBLISHED
     * rows are silently withheld rather than erroring, since a caller passing a stale id (a
     * question deleted after the student answered it) should get "nothing for this one," not a
     * failure for the whole batch.
     */
    @Transactional(readOnly = true)
    public List<QuestionResponse> getByIds(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("ids must not be empty");
        }
        if (ids.size() > MAX_BY_IDS_SIZE) {
            throw new IllegalArgumentException("ids must not exceed " + MAX_BY_IDS_SIZE + " per request");
        }
        List<Question> questions = questionRepository.findAllById(ids).stream()
                .filter(q -> !q.isDeleted() && q.getContentStatus() == ContentStatus.PUBLISHED)
                .toList();
        Map<UUID, List<QuestionMedia>> media = mediaByQuestionId(questions.stream().map(Question::getId).toList());
        return questions.stream()
                .map(q -> QuestionMapper.toResponse(q, media.getOrDefault(q.getId(), List.of())))
                .toList();
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

    /**
     * Live equivalent of mobile/src/db/mockTest.ts's countAvailable() — per-section question
     * availability before local sync completes, and (Mock Test Hub) an ad-hoc format's
     * available-question count once narrowed by {@code topicIds}/{@code difficultyCode}/
     * {@code pyqOnly}. Any of the three may be null/empty/false.
     */
    @Transactional(readOnly = true)
    public long countForMock(String examCode, List<UUID> subjectIds, List<UUID> topicIds, String difficultyCode,
                              boolean pyqOnly) {
        return questionRepository.countForMock(examCode, subjectIds, topicIds, difficultyCode, pyqOnly, temporaryPoolEnabled);
    }

    /**
     * Live equivalent of mobile/src/db/mockTest.ts's buildMockTestQuestions() per-section
     * query — a genuinely random sample, not just the first N matches, and (TASK-2301 Phase
     * P3) group-aware: a question sharing a {@code question_group_id} with another sampled row
     * pulls in every sibling as one atomic unit — see {@code QuestionGroupAssembly}. Also backs
     * the Mock Test Hub's ad-hoc formats once narrowed the same way {@link #countForMock} is.
     */
    @Transactional(readOnly = true)
    public List<QuestionResponse> sampleForMock(String examCode, List<UUID> subjectIds, List<UUID> topicIds,
                                                 String difficultyCode, boolean pyqOnly, int limit) {
        int clampedLimit = Math.min(Math.max(limit, 1), MAX_MOCK_SAMPLE_SIZE);
        List<Question> sampled = questionRepository.sampleForMock(
                examCode, subjectIds, topicIds, difficultyCode, pyqOnly, clampedLimit, temporaryPoolEnabled);
        Map<UUID, List<QuestionMedia>> media = mediaByQuestionId(sampled.stream().map(Question::getId).toList());
        return sampled.stream()
                .map(q -> QuestionMapper.toResponse(q, media.getOrDefault(q.getId(), List.of())))
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
        // Type is fixed at creation — see UpdateQuestionRequest's own note on why there is no
        // questionType field to change it from here. contentStructure is the same story
        // (CreateQuestionRequest's own note) — read from the entity, never from this request.
        String questionType = question.getQuestionType();
        ResolvedAnswer answer = resolveAnswer(questionType, request.getCorrectAnswer(), request.getAnswerKey(),
                englishOptions(question), question.getContentStructure());

        question.setCorrectAnswer(answer.correctAnswer());
        question.setTopic(requireTopic(request.getTopicId()));
        question.setDifficulty(request.getDifficulty());
        question.setExams(requireExams(request.getExamCodes()));
        question.setPremium(request.isPremium());
        applyPyqProvenance(question, request);
        question.setAnswerKey(answer.answerKey());
        question.setQuestionGroup(requireQuestionGroupOrNull(request.getQuestionGroupId()));
        question.setGroupOrder(request.getQuestionGroupId() == null ? null : request.getGroupOrder());
        question.setUpdatedAt(OffsetDateTime.now());
        Question saved = questionRepository.save(question);
        syncLegacyOccurrence(saved, request);
        return QuestionMapper.toResponse(saved,
                questionMediaRepository.findByQuestionIdAndDeletedFalseOrderByDisplayOrderAsc(saved.getId()),
                questionOccurrenceRepository.findByQuestion_IdOrderByCreatedAtAsc(saved.getId()));
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

        validateTranslationShape(request.getOptions(), request.getContent(), question.getQuestionType(), question.getContentStructure());
        translation.setQuestionText(request.getQuestionText());
        translation.setOptions(request.getOptions());
        translation.setExplanation(request.getExplanation());
        translation.setContent(request.getContent());

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
        Question saved = questionRepository.save(question);
        return QuestionMapper.toResponse(saved,
                questionMediaRepository.findByQuestionIdAndDeletedFalseOrderByDisplayOrderAsc(saved.getId()));
    }

    public void delete(UUID id) {
        Question question = getEntity(id);
        question.setDeleted(true);
        question.setUpdatedAt(OffsetDateTime.now());
        questionRepository.save(question);
    }

    /**
     * A one-click content-status change (TASK-2501 Phase 2), mirroring
     * {@code ExamGuideService.setCycleContentStatus} exactly — no separate submit-for-review
     * step, ADMIN or REVIEWER can move a question directly between DRAFT/REVIEW/PUBLISHED.
     * This is what makes a {@code question_candidates} Accept's DRAFT row eventually visible
     * to students, and is also freely usable for any hand-authored question an admin wants to
     * unpublish/republish.
     */
    public QuestionResponse setContentStatus(UUID id, ContentStatus status) {
        Question question = getEntity(id);
        question.setContentStatus(status);
        question.setUpdatedAt(OffsetDateTime.now());
        Question saved = questionRepository.save(question);
        return QuestionMapper.toResponse(saved,
                questionMediaRepository.findByQuestionIdAndDeletedFalseOrderByDisplayOrderAsc(saved.getId()),
                questionOccurrenceRepository.findByQuestion_IdOrderByCreatedAtAsc(saved.getId()));
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
                // Bulk import stays SINGLE_CHOICE-only in Phase P2 Wave A, deliberately — a
                // CSV/JSON import format for four divergent authoring shapes (a checkbox set,
                // a boolean, an assertion+reason block, a statement list) is real, separate
                // work nothing has asked for yet. The single-question admin form is where the
                // four new types are authored.
                validateTranslations(request.getTranslations(), QuestionTypeCode.SINGLE_CHOICE.name(), null);

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
                question.setQuestionType(QuestionTypeCode.SINGLE_CHOICE.name());
                question.setAnswerKey(deriveSingleChoiceAnswerKey(request.getCorrectAnswer(), englishOptions(request.getTranslations())));

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
                syncLegacyOccurrence(savedQuestion, request);
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
        translation.setContent(request.getContent());
        return translation;
    }

    private void requireLanguageExists(String languageCode) {
        if (!languageRepository.existsById(languageCode)) {
            throw new IllegalArgumentException("Unknown language code: " + languageCode);
        }
    }

    private void validateTranslations(List<TranslationRequest> translations, String questionType, Map<String, Object> contentStructure) {
        boolean hasRootLanguage = translations.stream()
                .anyMatch(t -> ROOT_LANGUAGE.equals(t.getLanguageCode()));
        if (!hasRootLanguage) {
            throw new IllegalArgumentException("Translations must include the root language: " + ROOT_LANGUAGE);
        }
        for (TranslationRequest t : translations) {
            validateTranslationShape(t.getOptions(), t.getContent(), questionType, contentStructure);
        }
    }

    /**
     * Types with no fixed 4-option list at all (V26/V27, TASK-2301 Phase P2 Wave A/B) — each
     * has its own free-form answer shape instead (a boolean, a number, free text, a mapping,
     * a sequence).
     */
    private static final Set<String> NO_OPTIONS_TYPES = Set.of("TRUE_FALSE", "NUMERIC", "FILL_BLANK", "MATCH", "ORDERING");

    /**
     * The options-arity and content rules, by type (V26/V27, TASK-2301 Phase P2 Wave A/B).
     * Shared between the create/bulk-import path (via {@link #validateTranslations}, one call
     * per language) and {@code upsertTranslation} (one call, since it only ever edits one
     * language at a time) — a single place every type's shape is defined, rather than the two
     * write paths drifting apart on what "valid" means for a given type's options/content.
     */
    /**
     * Package-private and {@code static} rather than private/instance (TASK-2501 Phase 2) so
     * {@code QuestionCandidateStagingService} can run a freshly-extracted candidate through
     * the *exact same* per-type validation a hand-typed question already goes through — per
     * the design's own instruction not to reinvent this (architecture proposal §O). {@code
     * static} is load-bearing, not a style choice: an instance call would route through this
     * (transactional) bean's own Spring proxy, and a thrown {@code IllegalArgumentException}
     * would mark the *caller's* shared transaction rollback-only before its own catch block
     * ever ran — the exact trap {@code DocumentStoreService.store}'s own doc comment already
     * documents once for a different pair of classes. A plain static call goes through no
     * proxy at all, so it cannot do that.
     */
    static void validateTranslationShape(List<String> options, Map<String, Object> content, String questionType,
                                          Map<String, Object> contentStructure) {
        if (NO_OPTIONS_TYPES.contains(questionType)) {
            if (options == null || !options.isEmpty()) {
                throw new IllegalArgumentException(questionType + " questions must not have authored options — its answer isn't a fixed option list");
            }
        } else if (options == null || options.size() != 4 || options.stream().anyMatch(QuestionService::isBlank)) {
            throw new IllegalArgumentException("options must contain exactly 4 non-blank entries for " + questionType);
        }

        if ("ASSERTION_REASON".equals(questionType)) {
            if (content == null || isBlank((String) content.get("assertion")) || isBlank((String) content.get("reason"))) {
                throw new IllegalArgumentException("ASSERTION_REASON requires content.assertion and content.reason, both non-blank");
            }
        } else if ("STATEMENT_COMBINATION".equals(questionType)) {
            if (content == null || !(content.get("statements") instanceof List<?> statements) || statements.size() < 2) {
                throw new IllegalArgumentException("STATEMENT_COMBINATION requires content.statements with at least 2 entries");
            }
        } else if ("MATCH".equals(questionType)) {
            requireLabelsCoverKeys(content, "leftLabels", stringList(contentStructure, "leftKeys"));
            requireLabelsCoverKeys(content, "rightLabels", stringList(contentStructure, "rightKeys"));
        } else if ("ORDERING".equals(questionType)) {
            requireLabelsCoverKeys(content, "itemLabels", stringList(contentStructure, "itemKeys"));
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
