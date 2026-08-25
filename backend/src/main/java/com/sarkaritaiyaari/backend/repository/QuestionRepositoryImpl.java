package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.TemporaryQuestionPool;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Fragment implementation for {@link QuestionRepositoryCustom} — named
 * QuestionRepositoryImpl (not QuestionRepositoryCustomImpl) per Spring Data
 * JPA's default naming convention for wiring a custom-query fragment into a
 * composed repository proxy.
 */
public class QuestionRepositoryImpl implements QuestionRepositoryCustom {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public Map<String, Long> countGroupedBy(String groupBy, String examCode, UUID subjectId, UUID topicId, String difficulty, boolean poolEnabled) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Object[]> cq = cb.createQuery(Object[].class);
        Root<Question> root = cq.from(Question.class);

        // A separate join from whatever QuestionSpecifications.filter() below may add for
        // its own examCode predicate — callers never combine groupBy="exam" with an
        // examCode filter (nonsensical: grouping by exam while filtering to one exam), so
        // this never produces the double-join row inflation that combination would cause.
        Expression<?> groupExpr = switch (groupBy) {
            case "exam" -> root.join("exams", JoinType.INNER).get("code");
            case "subject" -> root.get("topic").get("subject").get("id");
            case "topic" -> root.get("topic").get("id");
            case "difficulty" -> root.get("difficulty");
            default -> throw new IllegalArgumentException("Unknown groupBy: " + groupBy);
        };

        Predicate predicate = QuestionSpecifications.filter(examCode, subjectId, topicId, difficulty)
                .toPredicate(root, cq, cb);
        predicate = cb.and(predicate, cb.isFalse(root.get("deleted")));
        predicate = cb.and(predicate, poolPredicate(cb, cq, root, poolEnabled));

        cq.multiselect(groupExpr, cb.count(root)).where(predicate).groupBy(groupExpr);

        Map<String, Long> result = new LinkedHashMap<>();
        for (Object[] row : entityManager.createQuery(cq).getResultList()) {
            result.put(String.valueOf(row[0]), (Long) row[1]);
        }
        return result;
    }

    @Override
    public long countForMock(String examCode, List<UUID> subjectIds, boolean poolEnabled) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Long> cq = cb.createQuery(Long.class);
        Root<Question> root = cq.from(Question.class);
        Predicate predicate = QuestionSpecifications.examAndSubjectsIn(examCode, subjectIds).toPredicate(root, cq, cb);
        predicate = cb.and(predicate, poolPredicate(cb, cq, root, poolEnabled));
        cq.select(cb.count(root)).where(predicate);
        return entityManager.createQuery(cq).getSingleResult();
    }

    @Override
    public List<Question> sampleForMock(String examCode, List<UUID> subjectIds, int limit, boolean poolEnabled) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Question> cq = cb.createQuery(Question.class);
        Root<Question> root = cq.from(Question.class);
        Predicate predicate = QuestionSpecifications.examAndSubjectsIn(examCode, subjectIds).toPredicate(root, cq, cb);
        predicate = cb.and(predicate, poolPredicate(cb, cq, root, poolEnabled));
        // Genuine random ordering (Postgres's random(), zero-arg) — the same requirement
        // the local SQLite mock-test builder solves with `ORDER BY RANDOM()` (see
        // mobile/src/db/mockTest.ts's buildMockTestQuestions).
        cq.select(root).where(predicate).orderBy(cb.asc(cb.function("random", Double.class)));
        return entityManager.createQuery(cq).setMaxResults(limit).getResultList();
    }

    /** Same temporary-pool restriction as {@link QuestionSpecifications#inTemporaryPool()}, expressed directly against this method's own CriteriaQuery since these three queries build predicates by hand rather than composing Specifications. */
    private Predicate poolPredicate(CriteriaBuilder cb, CriteriaQuery<?> cq, Root<Question> root, boolean poolEnabled) {
        if (!poolEnabled) {
            return cb.conjunction();
        }
        Subquery<UUID> sub = cq.subquery(UUID.class);
        var poolRoot = sub.from(TemporaryQuestionPool.class);
        sub.select(poolRoot.get("questionId"));
        return root.get("id").in(sub);
    }
}
