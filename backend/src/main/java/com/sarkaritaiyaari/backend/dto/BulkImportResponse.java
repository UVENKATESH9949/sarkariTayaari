package com.sarkaritaiyaari.backend.dto;

import java.util.List;
import java.util.UUID;

public class BulkImportResponse {

    private int createdCount;
    private List<UUID> ids;
    private List<BulkImportFailure> failures;

    public BulkImportResponse() {
    }

    public BulkImportResponse(int createdCount, List<UUID> ids, List<BulkImportFailure> failures) {
        this.createdCount = createdCount;
        this.ids = ids;
        this.failures = failures;
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
}
