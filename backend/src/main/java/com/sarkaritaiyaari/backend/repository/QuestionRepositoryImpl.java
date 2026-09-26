package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ContentStatus;
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
        // TASK-2501 Phase 2 — counts shown to students shouldn't be inflated by an
        // unreviewed ingestion candidate.
        predicate = cb.and(predicate, cb.equal(root.get("contentStatus"), ContentStatus.PUBLISHED));
        predicate = cb.and(predicate, poolPredicate(cb, cq, root, poolEnabled));

        cq.multiselect(groupExpr, cb.count(root)).where(predicate).groupBy(groupExpr);

        Map<String, Long> result = new LinkedHashMap<>();
        for (Object[] row : entityManager.createQuery(cq).getResultList()) {
            result.put(String.valueOf(row[0]), (Long) row[1]);
        }
        return result;
    }

    @Override
    public long countForMock(String examCode, List<UUID> subjectIds, List<UUID> topicIds, String difficultyCode,
                              boolean pyqOnly, boolean poolEnabled) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Long> cq = cb.createQuery(Long.class);
        Root<Question> root = cq.from(Question.class);
        Predicate predicate = QuestionSpecifications
                .examAndSubjectsIn(examCode, subjectIds, topicIds, difficultyCode, pyqOnly)
                .toPredicate(root, cq, cb);
        predicate = cb.and(predicate, poolPredicate(cb, cq, root, poolEnabled));
        cq.select(cb.count(root)).where(predicate);
        return entityManager.createQuery(cq).getSingleResult();
    }

    /**
     * Generous enough that {@link QuestionGroupAssembly#packRandomSample} has real variety to
     * pack from even when several sampled rows land in the same group (each group only
     * contributes one unit, however many of its children were fetched), while staying far short
     * of loading a whole subject's eligible set into memory — the same anti-pattern this
     * codebase has already fixed as a real performance bug more than once.
     */
    private static final int MAX_SAMPLE_POOL_SIZE = 5000;

    @Override
    public List<Question> sampleForMock(String examCode, List<UUID> subjectIds, List<UUID> topicIds,
                                         String difficultyCode, boolean pyqOnly, int limit, boolean poolEnabled) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Question> cq = cb.createQuery(Question.class);
        Root<Question> root = cq.from(Question.class);
        Predicate predicate = QuestionSpecifications
                .examAndSubjectsIn(examCode, subjectIds, topicIds, difficultyCode, pyqOnly)
                .toPredicate(root, cq, cb);
        predicate = cb.and(predicate, poolPredicate(cb, cq, root, poolEnabled));
        // Genuine random ordering (Postgres's random(), zero-arg) — the same requirement
        // the local SQLite mock-test builder solves with `ORDER BY RANDOM()` (see
        // mobile/src/db/mockTest.ts's buildMockTestQuestions). Sampled at a bounded size, not
        // `limit` itself (TASK-2301 Phase P3) — some rows may belong to a group, which pulls
        // in sibling questions beyond one row each; QuestionGroupAssembly packs the real
        // section quota out of this bounded candidate set without ever splitting a group.
        int sampleSize = Math.min(Math.max(limit * 20, 500), MAX_SAMPLE_POOL_SIZE);
        cq.select(root).where(predicate).orderBy(cb.asc(cb.function("random", Double.class)));
        List<Question> candidates = entityManager.createQuery(cq).setMaxResults(sampleSize).getResultList();
        return QuestionGroupAssembly.packRandomSample(candidates, limit, this::fullGroupChildren);
    }

    /** Every non-deleted child of a group, in authored order — the atomic unit a group contributes to assembly. */
    private List<Question> fullGroupChildren(UUID groupId) {
        return entityManager.createQuery(
                        "select q from Question q where q.questionGroup.id = :groupId and q.deleted = false order by q.groupOrder",
                        Question.class)
                .setParameter("groupId", groupId)
                .getResultList();
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
