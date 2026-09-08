package com.sarkaritaiyaari.backend.ingestion;

import com.sarkaritaiyaari.backend.entity.IngestionSource;

import java.util.List;

/**
 * TASK-2401 Document 3 -- one implementation per {@code parser_key}, resolved via a
 * Spring-populated {@code Map<String, NoticeSourceAdapter>} (bean name == parser_key),
 * not an inheritance tree. Mirrors how {@code QuestionEvaluator}'s registry works in the
 * {@code evaluation} package.
 */
public interface NoticeSourceAdapter {

    List<DiscoveredNotice> listNotices(IngestionSource source);
}
