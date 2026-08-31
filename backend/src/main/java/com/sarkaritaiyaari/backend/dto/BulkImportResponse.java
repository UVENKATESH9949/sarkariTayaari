package com.sarkaritaiyaari.backend.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public class BulkImportResponse {

    private int createdCount;
    private List<UUID> ids;
    private List<BulkImportFailure> failures;

    /**
     * Imported question id -> the id of the earlier question it was detected to duplicate
     * (TICKET-2109).
     *
     * <p>Separate from {@code failures} deliberately. These rows <em>were</em> imported —
     * supplied §14 requires a duplicate to be recorded for review, not auto-rejected, since
     * two questions can share wording and still be genuinely different. Folding them into
     * failures would tell the admin the import did not happen, which would be false.
     *
     * <p>Empty rather than null when nothing was detected, so the admin console can render
     * it without a presence check.
     */
    private Map<UUID, UUID> duplicatesDetected = Map.of();

    public BulkImportResponse() {
    }

    public BulkImportResponse(int createdCount, List<UUID> ids, List<BulkImportFailure> failures) {
        this(createdCount, ids, failures, Map.of());
    }

    public BulkImportResponse(int createdCount, List<UUID> ids, List<BulkImportFailure> failures,
                               Map<UUID, UUID> duplicatesDetected) {
        this.createdCount = createdCount;
        this.ids = ids;
        this.failures = failures;
        this.duplicatesDetected = duplicatesDetected == null ? Map.of() : duplicatesDetected;
    }

    public int getCreatedCount() {
        return createdCount;
    }

    public void setCreatedCount(int createdCount) {
        this.createdCount = createdCount;
    }

    public List<UUID> getIds() {
        return ids;
    }

    public void setIds(List<UUID> ids) {
        this.ids = ids;
    }

    public List<BulkImportFailure> getFailures() {
        return failures;
    }

    public void setFailures(List<BulkImportFailure> failures) {
        this.failures = failures;
    }

    public Map<UUID, UUID> getDuplicatesDetected() {
        return duplicatesDetected;
    }

    public void setDuplicatesDetected(Map<UUID, UUID> duplicatesDetected) {
        this.duplicatesDetected = duplicatesDetected == null ? Map.of() : duplicatesDetected;
    }
}
