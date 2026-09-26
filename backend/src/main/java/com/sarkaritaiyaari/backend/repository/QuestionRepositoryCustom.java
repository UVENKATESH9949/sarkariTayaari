package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Question;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Hand-written queries that don't fit Spring Data's derived-query or
 * {@link org.springframework.data.jpa.domain.Specification}+{@code findAll} shapes:
 * grouped aggregates and genuinely random sampling. See {@link QuestionRepositoryImpl}.
 */
public interface QuestionRepositoryCustom {

    /** Count of non-deleted questions matching the filter, grouped by exam/subject/topic/difficulty. */
    Map<String, Long> countGroupedBy(String groupBy, String examCode, UUID subjectId, UUID topicId, String difficulty, boolean poolEnabled);

    /**
     * Count of non-deleted questions across a whole set of subjects, for one exam — backs Mock
     * Test's per-section availability, and (Mock Test Hub) its ad-hoc formats once further
     * narrowed by {@code topicIds}/{@code difficultyCode}/{@code pyqOnly}. Any of the three may
     * be null/empty/false to leave that dimension unfiltered — the original "just subjects"
     * behavior is exactly what an all-null/false call still does.
     */
    long countForMock(String examCode, List<UUID> subjectIds, List<UUID> topicIds, String difficultyCode,
                       boolean pyqOnly, boolean poolEnabled);

    /**
     * Genuinely random sample (not just "first N") across a set of subjects, for one exam —
     * backs Mock Test's attempt assembly, narrowable the same way {@link #countForMock} is.
     */
    List<Question> sampleForMock(String examCode, List<UUID> subjectIds, List<UUID> topicIds, String difficultyCode,
                                  boolean pyqOnly, int limit, boolean poolEnabled);
}
