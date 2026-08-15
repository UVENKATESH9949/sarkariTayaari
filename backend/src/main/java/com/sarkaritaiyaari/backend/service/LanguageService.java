package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.LanguageRequest;
import com.sarkaritaiyaari.backend.dto.LanguageResponse;
import com.sarkaritaiyaari.backend.entity.Language;
import com.sarkaritaiyaari.backend.repository.LanguageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

@Service
@Transactional
public class LanguageService {

    private final LanguageRepository languageRepository;

    public LanguageService(LanguageRepository languageRepository) {
        this.languageRepository = languageRepository;
    }

    public LanguageResponse create(LanguageRequest request) {
        if (languageRepository.existsById(request.getCode())) {
            throw new IllegalArgumentException("Language code already exists: " + request.getCode());
        }
        Language language = new Language();
        applyRequest(language, request);
        return toResponse(languageRepository.save(language));
    }

    @Transactional(readOnly = true)
    public List<LanguageResponse> listActive() {
        return languageRepository.findByActiveTrue().stream().map(LanguageService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<LanguageResponse> listAll() {
        return languageRepository.findAll().stream().map(LanguageService::toResponse).toList();
    }

    public LanguageResponse update(String code, LanguageRequest request) {
        Language language = getEntity(code);
        applyRequest(language, request);
        return toResponse(languageRepository.save(language));
    }

    public void delete(String code) {
        if (!languageRepository.existsById(code)) {
            throw new NoSuchElementException("Language not found: " + code);
        }
        languageRepository.deleteById(code);
    }

    private void applyRequest(Language language, LanguageRequest request) {
        language.setCode(request.getCode());
        language.setName(request.getName());
        language.setActive(request.isActive());
    }

    private Language getEntity(String code) {
        return languageRepository.findById(code)
                .orElseThrow(() -> new NoSuchElementException("Language not found: " + code));
    }

    private static LanguageResponse toResponse(Language language) {
        return new LanguageResponse(language.getCode(), language.getName(), language.isActive());
    }
}
