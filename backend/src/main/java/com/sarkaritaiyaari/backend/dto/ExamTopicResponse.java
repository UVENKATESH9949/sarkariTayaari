package com.sarkaritaiyaari.backend.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One topic in an exam's topic map. Carries the subject and parent names so a client can
 * render the hierarchy without a second call.
 */
public record ExamTopicResponse(
        UUID topicId,
        String topicName,
        UUID subjectId,
        String subjectName,
        UUID parentId,
        String parentName,
        BigDecimal weightagePercent
) {
}
