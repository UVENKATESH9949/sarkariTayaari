package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionSourceRequest;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionSourceResponse;
import com.sarkaritaiyaari.backend.entity.IngestionSource;
import com.sarkaritaiyaari.backend.entity.IngestionSourceType;
import com.sarkaritaiyaari.backend.repository.IngestionSourceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * TASK-2401 Task 2 -- Source Registry CRUD only. Scanning/discovery (Task 3) is a
 * separate service that will read from {@link IngestionSourceRepository} but isn't wired
 * up yet; nothing here triggers a fetch of anything.
 */
@Service
public class IngestionSourceService {

    private final IngestionSourceRepository sourceRepository;

    public IngestionSourceService(IngestionSourceRepository sourceRepository) {
        this.sourceRepository = sourceRepository;
    }

    @Transactional
    public IngestionSourceResponse createSource(IngestionSourceRequest request) {
        IngestionSource source = new IngestionSource();
        applyFields(source, request);
        OffsetDateTime now = OffsetDateTime.now();
        source.setCreatedAt(now);
        source.setUpdatedAt(now);
        return toResponse(sourceRepository.save(source));
    }

    @Transactional
    public IngestionSourceResponse updateSource(UUID id, IngestionSourceRequest request) {
        IngestionSource source = requireSource(id);
        applyFields(source, request);
        source.setUpdatedAt(OffsetDateTime.now());
        return toResponse(sourceRepository.save(source));
    }

    @Transactional(readOnly = true)
    public List<IngestionSourceResponse> listSources() {
        return sourceRepository.findAll().stream()
                .sorted(Comparator.comparing(IngestionSource::getName, String.CASE_INSENSITIVE_ORDER))
                .map(IngestionSourceService::toResponse)
                .toList();
    }

    @Transactional
    public void deleteSource(UUID id) {
        if (!sourceRepository.existsById(id)) {
            throw new NoSuchElementException("Ingestion source not found: " + id);
        }
        sourceRepository.deleteById(id);
    }

    IngestionSource requireSource(UUID id) {
        return sourceRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Ingestion source not found: " + id));
    }

    private void applyFields(IngestionSource source, IngestionSourceRequest request) {
        source.setOrganization(request.organization());
        source.setName(request.name());
        source.setBaseUrl(request.baseUrl());
        source.setSourceType(IngestionSourceType.valueOf(request.sourceType().trim().toUpperCase(Locale.ROOT)));
        source.setParserKey(request.parserKey());
        source.setConfig(request.config());
        source.setActive(request.active());
        source.setCheckFrequencyMinutes(request.checkFrequencyMinutes() != null ? request.checkFrequencyMinutes() : 1440);
    }

    private static IngestionSourceResponse toResponse(IngestionSource source) {
        return new IngestionSourceResponse(
                source.getId(),
                source.getOrganization(),
                source.getName(),
                source.getBaseUrl(),
                source.getSourceType().name(),
                source.getParserKey(),
                source.getConfig(),
                source.isActive(),
                source.getCheckFrequencyMinutes(),
                source.getLastCheckedAt(),
                source.getLastSuccessAt(),
                source.getLastFailureAt(),
                source.getConsecutiveFailures(),
                source.getCreatedAt(),
                source.getUpdatedAt());
    }
}
