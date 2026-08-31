package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.QuestionTranslation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuestionTranslationRepository extends JpaRepository<QuestionTranslation, UUID> {

    Optional<QuestionTranslation> findByQuestionIdAndLanguageCode(UUID questionId, String languageCode);

    /**
     * One translation per question for a batch of ids — the duplicate review queue needs both
     * sides of every pair on a page, and the per-row alternative is two round trips per row
     * against a remote database.
     *
     * <p>{@code join fetch t.question} because the caller keys the result by question id, and
     * without the fetch reading {@code t.getQuestion().getId()} triggers a lazy proxy load per
     * row — reintroducing the exact 1+N this method exists to remove.
     */
    @Query("select t from QuestionTranslation t join fetch t.question q "
            + "where q.id in :questionIds and t.language.code = :languageCode")
    List<QuestionTranslation> findByQuestionIdInAndLanguageCode(@Param("questionIds") List<UUID> questionIds,
                                                                @Param("languageCode") String languageCode);
}
