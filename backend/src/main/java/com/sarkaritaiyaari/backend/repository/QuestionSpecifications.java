package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Question;
import org.springframework.data.jpa.domain.Specification;

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
}
