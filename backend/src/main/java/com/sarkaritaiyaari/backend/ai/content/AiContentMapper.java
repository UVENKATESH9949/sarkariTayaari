package com.sarkaritaiyaari.backend.ai.content;

import com.sarkaritaiyaari.backend.dto.AiContentDtos.AiContentResponse;
import com.sarkaritaiyaari.backend.dto.AiContentDtos.AiContentSyncEntry;
import com.sarkaritaiyaari.backend.entity.AiContent;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import org.springframework.stereotype.Component;

@Component
public class AiContentMapper {

    /**
     * TASK-2701 Phase 3. The payload and every admin-only field are withheld unless the row is
     * currently PUBLISHED — an unreviewed DRAFT/REVIEW row, or one rejected/unpublished, must
     * never reach a public sync response even as inert data.
     */
    public AiContentSyncEntry toSyncEntry(AiContent content) {
        boolean published = content.getContentStatus() == ContentStatus.PUBLISHED;
        return new AiContentSyncEntry(
                content.getId(),
                content.getTaskId().name(),
                content.getQuestion() != null ? content.getQuestion().getId() : null,
                content.getTopic() != null ? content.getTopic().getId() : null,
                content.getLanguageCode(),
                published,
                published ? content.getPayload() : null,
                content.getUpdatedAt());
    }

    public AiContentResponse toResponse(AiContent content) {
        return new AiContentResponse(
                content.getId(),
                content.getTaskId().name(),
                content.getQuestion() != null ? content.getQuestion().getId() : null,
                content.getTopic() != null ? content.getTopic().getId() : null,
                content.getLanguageCode(),
                content.getPromptVersion(),
                content.getProvider(),
                content.getModelId(),
                content.getPayload(),
                content.getContentStatus().name(),
                content.getRejectionReason(),
                content.getGeneratedAt(),
                content.getReviewedAt(),
                content.getReviewedByEmail(),
                content.getUpdatedAt(),
                content.getVersion());
    }
}
