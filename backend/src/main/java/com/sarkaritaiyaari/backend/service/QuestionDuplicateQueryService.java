package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.TopicIntelligenceDtos;
import com.sarkaritaiyaari.backend.entity.QuestionDuplicate;
import com.sarkaritaiyaari.backend.entity.QuestionTranslation;
import com.sarkaritaiyaari.backend.repository.QuestionDuplicateRepository;
import com.sarkaritaiyaari.backend.repository.QuestionTranslationRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Read side of the duplicate review queue (TICKET-2109).
 *
 * <p>Split out of {@link DuplicateDetectionService} on purpose: that class is on the hot
 * write path (create, update, every bulk import row) and this is a paginated admin read with
 * completely different concerns. Keeping them together would mean the write path carries an
 * unused dependency on the translation repository.
 */
@Service
public class QuestionDuplicateQueryService {

    /** Matches the admin console's page size; bounded so a caller cannot request the world. */
    private static final int MAX_PAGE_SIZE = 100;

    private final QuestionDuplicateRepository duplicates;
    private final QuestionTranslationRepository translations;

    public QuestionDuplicateQueryService(QuestionDuplicateRepository duplicates,
                                          QuestionTranslationRepository translations) {
        this.duplicates = duplicates;
        this.translations = translations;
    }

    @Transactional(readOnly = true)
    public Page<TopicIntelligenceDtos.DuplicatePair> listUnresolved(int page, int size) {
        int clamped = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        Page<QuestionDuplicate> rows = duplicates.findUnresolved(PageRequest.of(Math.max(page, 0), clamped));

        // Both sides of every pair on the page, fetched in one query rather than two per row.
        // A 20-row page is 40 questions; the per-row version is 40 round trips against a
        // remote Neon database for a screen that is meant to open instantly.
        Set<UUID> questionIds = new HashSet<>();
        for (QuestionDuplicate row : rows.getContent()) {
            questionIds.add(row.getQuestionId());
            questionIds.add(row.getDuplicateOfQuestionId());
        }

        Map<UUID, String> textById = englishTextFor(questionIds);
        return rows.map(row -> toDto(row, textById));
    }

    @Transactional(readOnly = true)
    public long countUnresolved() {
        return duplicates.countUnresolved();
    }

    /**
     * English question text for a set of question ids.
     *
     * <p>Falls back to null rather than an empty string when a question has no {@code en}
     * translation. The admin console renders "(no English text)" for null, which is
     * information; an empty string would render as a blank row that looks like a bug.
     */
    private Map<UUID, String> englishTextFor(Set<UUID> questionIds) {
        Map<UUID, String> byId = new HashMap<>();
        if (questionIds.isEmpty()) return byId;

        List<QuestionTranslation> rows =
                translations.findByQuestionIdInAndLanguageCode(List.copyOf(questionIds), "en");
        for (QuestionTranslation t : rows) {
            byId.put(t.getQuestion().getId(), t.getQuestionText());
        }
        return byId;
    }

    private static TopicIntelligenceDtos.DuplicatePair toDto(QuestionDuplicate row,
                                                             Map<UUID, String> textById) {
        return new TopicIntelligenceDtos.DuplicatePair(
                row.getQuestionId(),
                textById.get(row.getQuestionId()),
                row.getDuplicateOfQuestionId(),
                textById.get(row.getDuplicateOfQuestionId()),
                row.getSimilarityPercent(),
                row.getDetectionMethod(),
                row.getDetectedAt(),
                row.getResolvedAt(),
                row.getResolution() == null ? null : row.getResolution().name()
        );
    }
}
