package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.PaperTypeRequest;
import com.sarkaritaiyaari.backend.dto.PaperTypeResponse;
import com.sarkaritaiyaari.backend.entity.PaperType;
import com.sarkaritaiyaari.backend.repository.PaperTypeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

@Service
@Transactional
public class PaperTypeService {

    private final PaperTypeRepository paperTypeRepository;

    public PaperTypeService(PaperTypeRepository paperTypeRepository) {
        this.paperTypeRepository = paperTypeRepository;
    }

    public PaperTypeResponse create(PaperTypeRequest request) {
        if (paperTypeRepository.existsById(request.getCode())) {
            throw new IllegalArgumentException("Paper type already exists: " + request.getCode());
        }
        PaperType type = new PaperType();
        type.setCode(request.getCode());
        applyRequest(type, request);
        return toResponse(paperTypeRepository.save(type));
    }

    @Transactional(readOnly = true)
    public List<PaperTypeResponse> list() {
        return paperTypeRepository.findAllByOrderByDisplayOrderAsc()
                .stream().map(PaperTypeService::toResponse).toList();
    }

    public PaperTypeResponse update(String code, PaperTypeRequest request) {
        PaperType type = paperTypeRepository.findById(code)
                .orElseThrow(() -> new NoSuchElementException("Paper type not found: " + code));
        applyRequest(type, request);
        return toResponse(paperTypeRepository.save(type));
    }

    public void delete(String code) {
        if (!paperTypeRepository.existsById(code)) {
            throw new NoSuchElementException("Paper type not found: " + code);
        }
        paperTypeRepository.deleteById(code);
    }

    private static void applyRequest(PaperType type, PaperTypeRequest request) {
        type.setLabel(request.getLabel());
        type.setMockable(request.isMockable());
        type.setDisplayOrder(request.getDisplayOrder());
    }

    private static PaperTypeResponse toResponse(PaperType type) {
        return new PaperTypeResponse(
                type.getCode(),
                type.getLabel(),
                type.isMockable(),
                type.getDisplayOrder()
        );
    }
}
