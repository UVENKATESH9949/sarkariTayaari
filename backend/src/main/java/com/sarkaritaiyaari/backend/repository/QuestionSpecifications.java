package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.TemporaryQuestionPool;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.jpa.domain.Specification;

import java.util.List;
import java.util.UUID;

public final class QuestionSpecifications {

    private QuestionSpecifications() {
    }

    public static Specification<Question> filter(String examCode, UUID subjectId, UUID topicId, String difficulty) {
        return (root, query, cb) -> {
            var predicate = cb.conjunction();
            if (examCode != null && !examCode.isBlank()) {
                var examJoin = root.join("exams");
                predicate = cb.and(predicate, cb.equal(examJoin.get("code"), examCode));
            }
            if (topicId != null) {
                predicate = cb.and(predicate, cb.equal(root.get("topic").get("id"), topicId));
            } else if (subjectId != null) {
                predicate = cb.and(predicate, cb.equal(root.get("topic").get("subject").get("id"), subjectId));
            }
            if (difficulty != null && !difficulty.isBlank()) {
                predicate = cb.and(predicate, cb.equal(root.get("difficulty"), difficulty));
            }
            return predicate;
        };
    }

    /** Student-facing reads must never surface a soft-deleted question — unlike the admin CRUD list, which deliberately shows them for restore purposes. */
    public static Specification<Question> notDeleted() {
        return (root, query, cb) -> cb.isFalse(root.get("deleted"));
    }

    /**
     * Restricts to the temporary ~500-question pool (see V9__temporary_question_pool.sql
     * and app.question-pool.temporary-enabled) — applied only where the caller has
     * confirmed the flag is on, so this predicate itself doesn't need to know about config.
     */
    public static Specification<Question> inTemporaryPool() {
        return (root, query, cb) -> {
            Subquery<UUID> sub = query.subquery(UUID.class);
            var poolRoot = sub.from(TemporaryQuestionPool.class);
            sub.select(poolRoot.get("questionId"));
            return root.get("id").in(sub);
        };
    }

    /**
     * Mock Test needs "questions across this whole set of subjects, for one exam" —
     * a different shape than {@link #filter}'s single optional subjectId, since a mock
     * paper section can draw from several subjects at once (see mobile's
     * db/mockTest.ts, which does the equivalent local query with an IN clause).
     */
    public static Specification<Question> examAndSubjectsIn(String examCode, List<UUID> subjectIds) {
        return (root, query, cb) -> {
            var examJoin = root.join("exams");
            return cb.and(
                    cb.equal(examJoin.get("code"), examCode),
                    root.get("topic").get("subject").get("id").in(subjectIds),
                    cb.isFalse(root.get("deleted"))
            );
        };
    }
}
