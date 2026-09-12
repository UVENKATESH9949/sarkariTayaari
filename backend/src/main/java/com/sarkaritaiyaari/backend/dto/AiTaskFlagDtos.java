package com.sarkaritaiyaari.backend.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public final class AiTaskFlagDtos {

    private AiTaskFlagDtos() {
    }

    public record AiTaskFlagView(
            String taskId,
            boolean enabled,
            OffsetDateTime updatedAt,
            String updatedByEmail,
            long version) {
    }

    public record UpdateAiTaskFlagRequest(boolean enabled, long expectedVersion) {
    }

    /** Admin console read — every known task id, including ones never toggled yet. */
    public record AiTaskFlagListResponse(List<AiTaskFlagView> flags) {
    }

    /**
     * TASK-2701 Phase 4 — the public, unauthenticated shape a device caches and consults before
     * offering any AI surface. Deliberately just `{taskId: enabled}` rather than the full view:
     * a client has no use for who last changed a flag or its optimistic-lock version.
     */
    public record ClientConfigResponse(Map<String, Boolean> aiTasks) {
    }
}
