package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.DifficultyLevelRequest;
import com.sarkaritaiyaari.backend.dto.DifficultyLevelResponse;
import com.sarkaritaiyaari.backend.entity.DifficultyLevel;
import com.sarkaritaiyaari.backend.repository.DifficultyLevelRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

@Service
@Transactional
public class DifficultyLevelService {

    private final DifficultyLevelRepository difficultyLevelRepository;

    public DifficultyLevelService(DifficultyLevelRepository difficultyLevelRepository) {
        this.difficultyLevelRepository = difficultyLevelRepository;
    }

    public DifficultyLevelResponse create(DifficultyLevelRequest request) {
        if (difficultyLevelRepository.existsById(request.getCode())) {
            throw new IllegalArgumentException("Difficulty level already exists: " + request.getCode());
        }
        DifficultyLevel level = new DifficultyLevel();
        level.setCode(request.getCode());
        applyRequest(level, request);
        return toResponse(difficultyLevelRepository.save(level));
    }

    /** Active only — the list the mobile app renders. */
    @Transactional(readOnly = true)
    public List<DifficultyLevelResponse> listActive() {
        return difficultyLevelRepository.findByActiveTrueOrderByDisplayOrderAsc()
                .stream().map(DifficultyLevelService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<DifficultyLevelResponse> listAll() {
        return difficultyLevelRepository.findAllByOrderByDisplayOrderAsc()
                .stream().map(DifficultyLevelService::toResponse).toList();
    }

    public DifficultyLevelResponse update(String code, DifficultyLevelRequest request) {
        DifficultyLevel level = getEntity(code);
        applyRequest(level, request);
        return toResponse(difficultyLevelRepository.save(level));
    }

    public void delete(String code) {
        if (!difficultyLevelRepository.existsById(code)) {
            throw new NoSuchElementException("Difficulty level not found: " + code);
        }
        difficultyLevelRepository.deleteById(code);
    }

    private DifficultyLevel getEntity(String code) {
        return difficultyLevelRepository.findById(code)
                .orElseThrow(() -> new NoSuchElementException("Difficulty level not found: " + code));
    }

    private static void applyRequest(DifficultyLevel level, DifficultyLevelRequest request) {
        level.setLabel(request.getLabel());
        level.setDisplayOrder(request.getDisplayOrder());
        level.setColor(request.getColor());
        level.setColorBg(request.getColorBg());
        level.setIcon(request.getIcon());
        level.setActive(request.isActive());
    }

    private static DifficultyLevelResponse toResponse(DifficultyLevel level) {
        return new DifficultyLevelResponse(
                level.getCode(),
                level.getLabel(),
                level.getDisplayOrder(),
                level.getColor(),
                level.getColorBg(),
                level.getIcon(),
                level.isActive()
        );
    }
}
