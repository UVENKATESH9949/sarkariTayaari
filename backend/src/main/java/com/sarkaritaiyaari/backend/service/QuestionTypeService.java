package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.QuestionTypeResponse;
import com.sarkaritaiyaari.backend.entity.QuestionType;
import com.sarkaritaiyaari.backend.repository.QuestionTypeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Read-only in Phase P1 — question types are seeded by V25, not admin-authored yet. Admin
 * CRUD (to flip {@code is_authoring_enabled} without a migration) is real future work, not
 * built ahead of a phase that needs it.
 */
@Service
@Transactional(readOnly = true)
public class QuestionTypeService {

    private final QuestionTypeRepository questionTypeRepository;

    public QuestionTypeService(QuestionTypeRepository questionTypeRepository) {
        this.questionTypeRepository = questionTypeRepository;
    }

    public List<QuestionTypeResponse> listAll() {
        return questionTypeRepository.findAllByOrderByDisplayOrderAsc().stream()
                .map(QuestionTypeService::toResponse)
                .toList();
    }

    private static QuestionTypeResponse toResponse(QuestionType type) {
        return new QuestionTypeResponse(
                type.getCode(),
                type.getLabel(),
                type.getEvaluatorFamily(),
                type.isAuthoringEnabled(),
                type.isDefaultNegativeMarking(),
                type.getDisplayOrder()
        );
    }
}
