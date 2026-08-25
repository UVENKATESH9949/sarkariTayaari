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

    /** Count of non-deleted questions across a whole set of subjects, for one exam — backs Mock Test's per-section availability. */
    long countForMock(String examCode, List<UUID> subjectIds, boolean poolEnabled);

    /** Genuinely random sample (not just "first N") across a set of subjects, for one exam — backs Mock Test's attempt assembly. */
    List<Question> sampleForMock(String examCode, List<UUID> subjectIds, int limit, boolean poolEnabled);
}
