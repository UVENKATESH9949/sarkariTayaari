package com.sarkaritaiyaari.backend.dto;

public class BulkDeleteResponse {

    private int deletedCount;

    public BulkDeleteResponse() {
    }

    public BulkDeleteResponse(int deletedCount) {
        this.deletedCount = deletedCount;
    }

    public int getDeletedCount() {
        return deletedCount;
    }

    public void setDeletedCount(int deletedCount) {
        this.deletedCount = deletedCount;
    }
}
