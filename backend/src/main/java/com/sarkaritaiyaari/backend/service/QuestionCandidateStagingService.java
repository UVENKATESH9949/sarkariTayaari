package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.IngestionDocument;
import com.sarkaritaiyaari.backend.entity.QuestionCandidate;
import com.sarkaritaiyaari.backend.entity.QuestionRawExtraction;
import com.sarkaritaiyaari.backend.ingestion.QuestionCandidateBuilder;
import com.sarkaritaiyaari.backend.ingestion.QuestionCandidateBuilder.BuiltCandidate;
import com.sarkaritaiyaari.backend.ingestion.QuestionRawExtractor.RawQuestionBlock;
import com.sarkaritaiyaari.backend.repository.QuestionCandidateRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRawExtractionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * TASK-2501 Phase 2 -- stages exactly one raw extraction + candidate pair, in its own
 * transaction. Deliberately a separate bean from {@code QuestionIngestionService}, not a
 * private/protected method on it — {@code @Transactional(REQUIRES_NEW)} only takes effect
 * through Spring's AOP proxy, which a same-class (self-invoked) call bypasses entirely.
 * {@code QuestionIngestionService#ingest} calls this once per detected question block,
 * catching any failure so one bad block can never roll back every other candidate already
 * staged from the same document — the same per-item resilience {@code DocumentStoreService}/
 * {@code ExtractionJobService} already established for TASK-2401's sibling pipeline (see
 * {@code DocumentStoreService.store}'s own doc comment for why this shape matters).
 */
@Service
public class QuestionCandidateStagingService {

    private final QuestionRawExtractionRepository rawExtractionRepository;
    private final QuestionCandidateRepository candidateRepository;
    private final QuestionCandidateBuilder questionCandidateBuilder;
    private final DuplicateDetectionService duplicateDetection;

    public QuestionCandidateStagingService(QuestionRawExtractionRepository rawExtractionRepository,
                                            QuestionCandidateRepository candidateRepository,
                                            QuestionCandidateBuilder questionCandidateBuilder,
                                            DuplicateDetectionService duplicateDetection) {
        this.rawExtractionRepository = rawExtractionRepository;
        this.candidateRepository = candidateRepository;
        this.questionCandidateBuilder = questionCandidateBuilder;
        this.duplicateDetection = duplicateDetection;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public QuestionCandidate stageOne(IngestionDocument document, String extractorVersion, int position,
                                       Integer pageNumber, RawQuestionBlock block) {
        OffsetDateTime now = OffsetDateTime.now();

        QuestionRawExtraction raw = new QuestionRawExtraction();
        raw.setDocument(document);
        raw.setExtractorVersion(extractorVersion);
        raw.setPositionInDocument(position);
        raw.setPageNumber(pageNumber);
        raw.setRawQuestionText(block.questionText());
        raw.setRawOptions(block.options());
        raw.setRawAnswerText(block.answerText());
        raw.setTextExtractable(true);
        raw.setCreatedAt(now);
        raw = rawExtractionRepository.save(raw);

        BuiltCandidate built = questionCandidateBuilder.build(block);

        QuestionCandidate candidate = new QuestionCandidate();
        candidate.setRawExtraction(raw);
        candidate.setPayload(built.payload());
        candidate.setConfidence(built.confidence());
        candidate.setSourceExcerpt(built.sourceExcerpt());
        candidate.setCreatedAt(now);

        List<String> warnings = validateCandidatePayload(built.payload());
        if (!warnings.isEmpty()) {
            candidate.setValidationWarnings(Map.of("messages", warnings));
        }

        String englishText = englishQuestionText(built.payload());
        if (englishText != null && !englishText.isBlank()) {
            List<UUID> matches = duplicateDetection.findExistingMatches(englishText);
            if (!matches.isEmpty()) {
                candidate.setPossibleDuplicateOfQuestionId(matches.get(0));
                candidate.setDuplicateSimilarityPercent(new BigDecimal("100.00"));
            }
        }

        return candidateRepository.save(candidate);
    }

    /**
     * Reuses {@code QuestionService}'s own per-type structural/content validation — the same
     * checks a hand-typed question already goes through — rather than a second, parallel
     * validator (architecture proposal §O). Never throws: a candidate that fails this is
     * simply recorded with a warning, so one malformed block never blocks the rest of the
     * batch.
     */
    @SuppressWarnings("unchecked")
    private List<String> validateCandidatePayload(Map<String, Object> payload) {
        List<String> warnings = new ArrayList<>();
        try {
            List<Map<String, Object>> translations = (List<Map<String, Object>>) payload.get("translations");
            List<String> options = (List<String>) translations.get(0).get("options");
            QuestionService.validateTranslationShape(options, null, "SINGLE_CHOICE", null);
        } catch (RuntimeException e) {
            warnings.add(e.getMessage());
        }
        if (payload.get("correctAnswer") == null) {
            warnings.add("No answer resolved from the source — a reviewer must supply correctAnswer before this can be accepted.");
        }
        return warnings;
    }

    @SuppressWarnings("unchecked")
    private static String englishQuestionText(Map<String, Object> payload) {
        List<Map<String, Object>> translations = (List<Map<String, Object>>) payload.get("translations");
        return translations.isEmpty() ? null : (String) translations.get(0).get("questionText");
    }
}
